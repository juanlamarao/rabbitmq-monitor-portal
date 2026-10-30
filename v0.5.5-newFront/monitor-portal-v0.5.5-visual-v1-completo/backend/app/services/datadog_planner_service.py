from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.core.config import settings
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.datadog_org import DatadogOrg
from app.models.generated_monitor import GeneratedMonitor
from app.models.monitor_template import MonitorTemplate, QueueMonitorTemplate
from app.schemas.datadog_sync import (
    DatadogPlanBucket,
    DatadogPlanPersistResult,
    DatadogPlanQueueSample,
    DatadogPlanRead,
    DatadogPlanSummary,
    GeneratedMonitorRead,
)
from app.services.template_service import merge_effective_config

MONITOR_SCOPE_TYPE = "dedicated_queue_template"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stable_json(value: Any) -> str:
    return json.dumps(value or {}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _desired_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_stable_json(payload).encode()).hexdigest()


def _render_template(template: str | None, context: dict[str, Any]) -> str | None:
    if not template:
        return None

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        if key in context:
            return str(context[key])
        # Mantém variáveis Datadog não resolvidas quando realmente forem necessárias.
        if key.startswith("#") or key.startswith("/"):
            return match.group(0)
        return str(context.get(key, match.group(0)))

    rendered = re.sub(r"\{\{\s*([#/]?[a-zA-Z0-9_\.]+)\s*\}\}", replace, template)
    for key, value in context.items():
        rendered = rendered.replace("${" + key + "}", str(value))
    return rendered


def _render_list_template(values: list[str] | None, context: dict[str, Any]) -> list[str]:
    rendered: list[str] = []
    for item in values or []:
        value = _render_template(item, context)
        if value:
            rendered.append(value)
    return rendered


def _dd_tag_value(value: str | None) -> str:
    # Datadog aceita tag values com vários caracteres; escapar vírgula reduz risco de quebrar o scope.
    return str(value or "").replace(",", "\\,")


def _public_reference_url(cluster_tag: str, vhost: str, queue_name: str) -> str:
    base = settings.portal_public_base_url.rstrip("/")
    return (
        f"{base}/public/queue-reference"
        f"?rabbitmq_cluster={quote(cluster_tag, safe='')}"
        f"&vhost={quote(vhost, safe='')}"
        f"&queue={quote(queue_name, safe='')}"
    )


def _default_message_template() -> str:
    return (
        "{{#is_alert}}\n"
        "🚨 RabbitMQ Queue em alerta\n\n"
        "Cluster: {{rabbitmq_cluster.name}}\n"
        "Vhost: {{vhost.name}}\n"
        "Queue: {{queue.name}}\n\n"
        "Detalhes da fila: {{public_reference_url}}\n"
        "{{/is_alert}}\n\n"
        "{{#is_recovery}}\n"
        "✅ RabbitMQ Queue recuperada\n\n"
        "Cluster: {{rabbitmq_cluster.name}}\n"
        "Vhost: {{vhost.name}}\n"
        "Queue: {{queue.name}}\n"
        "{{/is_recovery}}"
    )



def _cluster_tag_value(cluster: RabbitMQCluster) -> str:
    return cluster.datadog_cluster_tag_value or cluster.name


def _integration_context(cluster: RabbitMQCluster, queue: RabbitMQQueue) -> dict[str, str]:
    cluster_tag_key = cluster.datadog_cluster_tag_key or "rabbitmq_cluster"
    vhost_tag_key = cluster.datadog_vhost_tag_key or "vhost"
    queue_tag_key = cluster.datadog_queue_tag_key or "queue"
    cluster_value = _cluster_tag_value(cluster)
    scope = ",".join(
        [
            f"{cluster_tag_key}:{_dd_tag_value(cluster_value)}",
            f"{vhost_tag_key}:{_dd_tag_value(queue.vhost)}",
            f"{queue_tag_key}:{_dd_tag_value(queue.name)}",
        ]
    )
    return {
        "datadog_integration_type": cluster.datadog_integration_type or "custom",
        "cluster_tag_key": cluster_tag_key,
        "vhost_tag_key": vhost_tag_key,
        "queue_tag_key": queue_tag_key,
        "node_tag_key": cluster.datadog_node_tag_key or "node",
        "metric_messages": cluster.datadog_metric_messages or "rabbitmq.queue.messages",
        "metric_consumers": cluster.datadog_metric_consumers or "rabbitmq.queue.consumers",
        "rabbitmq_cluster_tag": cluster_value,
        "datadog_scope": scope,
        "group_by": "",
        "public_reference_url": _public_reference_url(cluster_value, queue.vhost, queue.name),
    }


def _normalize_dedicated_query(query: str | None, context: dict[str, Any]) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    if not query:
        return None, warnings

    rendered = _render_template(query, context) or ""
    scope = str(context["datadog_scope"])

    # Compatibilidade com templates legados da v0.5.0/v0.5.2 que usavam rabbitmq_cluster:* e group-by.
    if "rabbitmq_cluster:*" in rendered or " by {" in rendered:
        warnings.append("Query legada normalizada para monitor dedicado: scope explícito de cluster/vhost/queue e sem group-by.")
    rendered = re.sub(r"\{[^{}]*rabbitmq_cluster:\*[^{}]*\}", "{" + scope + "}", rendered)
    rendered = re.sub(r"\s+by\s+\{[^{}]+\}", "", rendered)

    # Se o template já usa placeholder novo, garante que não reste group-by.
    rendered = rendered.replace("{{datadog_scope}}", scope).replace("${datadog_scope}", scope)
    rendered = re.sub(r"\s+by\s+\{[^{}]+\}", "", rendered)
    return rendered.strip(), warnings


def _bucket_desired_payload(bucket: DatadogPlanBucket) -> dict[str, Any]:
    return {
        "provider": "datadog",
        "strategy": bucket.strategy,
        "monitor_scope_type": MONITOR_SCOPE_TYPE,
        "grouping_key": bucket.bucket_key,
        "datadog_org_id": bucket.datadog_org_id,
        "cluster_id": bucket.cluster_id,
        "queue_id": bucket.queue_id,
        "template_id": bucket.template_id,
        "template_code": bucket.template_code,
        "monitor_type": bucket.monitor_type,
        "monitor_kind": bucket.monitor_kind,
        "effective_config": bucket.effective_config,
        "query": bucket.query,
        "message": bucket.message,
        "tags": bucket.tags,
        "options": bucket.options,
        "scope_tags_used": bucket.scope_tags_used,
        "public_reference_url_template": bucket.public_reference_url_template,
    }


def _saved_monitor_to_read(item: GeneratedMonitor) -> GeneratedMonitorRead:
    return GeneratedMonitorRead(
        id=item.id,
        datadog_org_id=item.datadog_org_id,
        datadog_org_name=item.datadog_org.name if item.datadog_org else None,
        cluster_id=item.cluster_id,
        queue_id=item.queue_id,
        template_id=item.template_id,
        template_code=item.template.code if item.template else None,
        provider=item.provider,
        monitor_scope_type=item.monitor_scope_type,
        grouping_key=item.grouping_key,
        name=item.name,
        query=item.query,
        message=item.message,
        tags=item.tags_json or [],
        options=item.options_json or {},
        covered_queues_count=item.covered_queues_count,
        desired_config_hash=item.desired_config_hash,
        applied_config_hash=item.applied_config_hash,
        sync_status=item.sync_status,
        external_monitor_id=item.external_monitor_id or item.external_id,
        external_monitor_url=item.external_monitor_url or item.external_url,
        last_planned_at=item.last_planned_at,
        last_synced_at=item.last_synced_at,
        last_error=item.last_error or item.error_message,
        is_active=item.is_active,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _scope_saved_stmt(*, datadog_org_id: int | None = None, template_id: int | None = None):
    stmt = (
        select(GeneratedMonitor)
        .where(GeneratedMonitor.provider == "datadog", GeneratedMonitor.monitor_scope_type == MONITOR_SCOPE_TYPE)
        .options(selectinload(GeneratedMonitor.datadog_org), selectinload(GeneratedMonitor.template))
    )
    if datadog_org_id:
        stmt = stmt.where(GeneratedMonitor.datadog_org_id == datadog_org_id)
    if template_id:
        stmt = stmt.where(GeneratedMonitor.template_id == template_id)
    return stmt


def list_generated_monitors(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    sync_status: str | None = None,
    active_only: bool = True,
    limit: int = 200,
) -> list[GeneratedMonitorRead]:
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=422, detail="limit deve estar entre 1 e 1000")

    stmt = _scope_saved_stmt(datadog_org_id=datadog_org_id, template_id=template_id)
    if sync_status:
        stmt = stmt.where(GeneratedMonitor.sync_status == sync_status)
    if active_only:
        stmt = stmt.where(GeneratedMonitor.is_active.is_(True))
    stmt = stmt.order_by(GeneratedMonitor.updated_at.desc()).limit(limit)
    return [_saved_monitor_to_read(item) for item in db.scalars(stmt).all()]


def _bindings_stmt(datadog_org_id: int | None, template_id: int | None):
    stmt = (
        select(QueueMonitorTemplate)
        .where(QueueMonitorTemplate.enabled.is_(True))
        .join(QueueMonitorTemplate.queue)
        .join(QueueMonitorTemplate.template)
        .join(RabbitMQQueue.cluster)
        .join(RabbitMQCluster.datadog_org)
        .where(
            RabbitMQQueue.is_removed.is_(False),
            RabbitMQQueue.monitor_enabled.is_(True),
            RabbitMQQueue.is_temporary.is_(False),
            RabbitMQCluster.is_active.is_(True),
            RabbitMQCluster.monitor_queues.is_(True),
            MonitorTemplate.is_active.is_(True),
            DatadogOrg.is_active.is_(True),
        )
        .options(
            selectinload(QueueMonitorTemplate.template),
            selectinload(QueueMonitorTemplate.queue)
            .selectinload(RabbitMQQueue.cluster)
            .selectinload(RabbitMQCluster.datadog_org),
        )
        .order_by(DatadogOrg.name, MonitorTemplate.code, RabbitMQCluster.name, RabbitMQQueue.vhost, RabbitMQQueue.name)
    )
    if datadog_org_id:
        stmt = stmt.where(RabbitMQCluster.datadog_org_id == datadog_org_id)
    if template_id:
        stmt = stmt.where(QueueMonitorTemplate.template_id == template_id)
    return stmt


def build_datadog_plan(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    sample_limit: int = 10,
) -> DatadogPlanRead:
    if sample_limit < 1 or sample_limit > 100:
        raise HTTPException(status_code=422, detail="sample_limit deve estar entre 1 e 100")

    bindings = list(db.scalars(_bindings_stmt(datadog_org_id, template_id)).all())
    saved_by_key = {
        item.grouping_key: item
        for item in db.scalars(_scope_saved_stmt(datadog_org_id=datadog_org_id, template_id=template_id)).all()
        if item.grouping_key
    }

    buckets: list[DatadogPlanBucket] = []
    templates_without_query = set()

    for binding in bindings:
        template = binding.template
        queue = binding.queue
        cluster = queue.cluster
        org = cluster.datadog_org
        effective_config = merge_effective_config(template, binding.overrides)
        integration = _integration_context(cluster, queue)
        context = {
            **effective_config,
            **integration,
            "template_code": template.code,
            "template_name": template.name,
            "monitor_kind": template.monitor_kind,
            "portal_public_base_url": settings.portal_public_base_url.rstrip("/"),
            "cluster_name": cluster.name,
            "vhost": queue.vhost,
            "queue_name": queue.name,
            "rabbitmq_cluster.name": integration["rabbitmq_cluster_tag"],
            "vhost.name": queue.vhost,
            "queue.name": queue.name,
        }
        query, query_warnings = _normalize_dedicated_query(template.datadog_query_template, context)
        message = _render_template(template.datadog_message_template or _default_message_template(), context)
        tags = _render_list_template(template.datadog_tags_template or [], context)
        options = template.datadog_options or {}
        errors: list[str] = []
        warnings: list[str] = list(query_warnings)

        if not template.datadog_query_template:
            errors.append("Template não possui datadog_query_template configurado.")
            templates_without_query.add(template.id)
        if not query:
            errors.append("Não foi possível gerar query Datadog para este monitor dedicado.")
        if not org.has_credentials:
            warnings.append("Org Datadog vinculada não possui API Key/APP Key cadastradas.")
        if not cluster.datadog_cluster_tag_value:
            warnings.append("Cluster não possui valor de tag Datadog configurado; usando o nome do cluster do portal como fallback.")
        warnings.append("Monitor dedicado: 1 template aplicado em 1 fila gera 1 monitor Datadog com scope explícito de cluster/vhost/queue.")

        sample_queues = [
            DatadogPlanQueueSample(
                queue_id=queue.id,
                cluster_id=cluster.id,
                cluster_name=cluster.name,
                rabbitmq_cluster_tag=integration["rabbitmq_cluster_tag"],
                vhost=queue.vhost,
                queue=queue.name,
                service_name=queue.service_name,
                criticality=queue.criticality,
                owner_email=queue.owner_email,
                is_customized=bool(binding.overrides),
            )
        ]

        bucket_key = f"queue_template:{binding.id}"
        payload = {
            "datadog_org_id": org.id,
            "cluster_id": cluster.id,
            "queue_id": queue.id,
            "template_id": template.id,
            "binding_id": binding.id,
            "monitor_type": template.datadog_monitor_type or "query alert",
            "monitor_kind": template.monitor_kind,
            "effective_config": effective_config,
            "query": query,
            "message": message,
            "tags": tags,
            "options": options,
            "scope_tags_used": [integration["cluster_tag_key"], integration["vhost_tag_key"], integration["queue_tag_key"]],
        }
        desired_config_hash = _desired_hash(payload)
        saved = saved_by_key.get(bucket_key)
        plan_state = "new"
        if saved:
            plan_state = "unchanged" if saved.desired_config_hash == desired_config_hash else "changed"

        buckets.append(
            DatadogPlanBucket(
                bucket_key=bucket_key,
                datadog_org_id=org.id,
                datadog_org_name=org.name,
                cluster_id=cluster.id,
                queue_id=queue.id,
                template_id=template.id,
                template_code=template.code,
                template_name=template.name,
                monitor_type=template.datadog_monitor_type or "query alert",
                monitor_kind=template.monitor_kind,
                strategy="dedicated",
                effective_config=effective_config,
                queue_count=1,
                customized_queue_count=1 if binding.overrides else 0,
                inherited_queue_count=0 if binding.overrides else 1,
                query=query,
                message=message,
                tags=tags,
                options=options,
                grouping_tags=[],
                scope_tags_used=payload["scope_tags_used"],
                public_reference_url_template=integration["public_reference_url"],
                warnings=warnings,
                errors=errors,
                sample_queues=sample_queues[:sample_limit],
                desired_config_hash=desired_config_hash,
                saved_monitor_id=saved.id if saved else None,
                saved_sync_status=saved.sync_status if saved else None,
                saved_desired_config_hash=saved.desired_config_hash if saved else None,
                saved_applied_config_hash=saved.applied_config_hash if saved else None,
                saved_last_planned_at=saved.last_planned_at if saved else None,
                plan_state=plan_state,
            )
        )

    buckets.sort(key=lambda item: (item.datadog_org_name, item.template_code, item.bucket_key))
    summary = DatadogPlanSummary(
        total_buckets=len(buckets),
        total_queues_covered=sum(item.queue_count for item in buckets),
        buckets_with_errors=sum(1 for item in buckets if item.errors),
        buckets_with_warnings=sum(1 for item in buckets if item.warnings),
        templates_without_query=len(templates_without_query),
        orgs=sorted({item.datadog_org_name for item in buckets}),
        new_buckets=sum(1 for item in buckets if item.plan_state == "new"),
        unchanged_buckets=sum(1 for item in buckets if item.plan_state == "unchanged"),
        changed_buckets=sum(1 for item in buckets if item.plan_state == "changed"),
        saved_buckets=sum(1 for item in buckets if item.saved_monitor_id is not None),
    )
    return DatadogPlanRead(summary=summary, buckets=buckets)


def persist_datadog_plan(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    sample_limit: int = 10,
) -> DatadogPlanPersistResult:
    plan = build_datadog_plan(db, datadog_org_id=datadog_org_id, template_id=template_id, sample_limit=sample_limit)
    now = _utcnow()
    current_keys = {bucket.bucket_key for bucket in plan.buckets if not bucket.errors}
    saved_by_key = {
        item.grouping_key: item
        for item in db.scalars(_scope_saved_stmt(datadog_org_id=datadog_org_id, template_id=template_id)).all()
        if item.grouping_key
    }
    created = updated = unchanged = skipped = 0

    for bucket in plan.buckets:
        if bucket.errors:
            skipped += 1
            continue
        payload = _bucket_desired_payload(bucket)
        desired_config_hash = _desired_hash(payload)
        item = saved_by_key.get(bucket.bucket_key)
        if not item:
            item = GeneratedMonitor(
                provider="datadog",
                datadog_org_id=bucket.datadog_org_id,
                cluster_id=bucket.cluster_id,
                queue_id=bucket.queue_id,
                template_id=bucket.template_id,
                monitor_scope_type=MONITOR_SCOPE_TYPE,
                grouping_key=bucket.bucket_key,
                sync_status="pending_create",
                status="pending_create",
                is_active=True,
            )
            db.add(item)
            created += 1
        elif item.desired_config_hash == desired_config_hash:
            unchanged += 1
        else:
            updated += 1
            item.sync_status = "pending_update" if (item.external_monitor_id or item.external_id) else "pending_create"
            item.status = item.sync_status
            item.is_active = True

        item.cluster_id = bucket.cluster_id
        item.queue_id = bucket.queue_id
        item.name = bucket_name(bucket)
        item.query = bucket.query
        item.message = bucket.message
        item.tags_json = bucket.tags
        item.options_json = bucket.options
        item.covered_queues_count = bucket.queue_count
        item.sample_queues_json = [queue.model_dump() for queue in bucket.sample_queues]
        item.desired_config = payload
        item.desired_config_hash = desired_config_hash
        item.external_monitor_id = item.external_monitor_id or item.external_id
        item.external_monitor_url = item.external_monitor_url or item.external_url
        item.last_planned_at = now
        item.last_error = None
        item.error_message = None
        item.datadog_org_id = bucket.datadog_org_id
        item.template_id = bucket.template_id
        if item.applied_config_hash and item.applied_config_hash == desired_config_hash:
            item.sync_status = "synced"
            item.status = "synced"

    orphaned = 0
    for saved_key, item in saved_by_key.items():
        if saved_key in current_keys:
            continue
        if not item.is_active:
            continue
        item.sync_status = "orphaned"
        item.status = "orphaned"
        item.last_planned_at = now
        orphaned += 1

    create_audit_log(
        db,
        entity_type="datadog_monitor_plan",
        action="persist",
        summary=(
            f"Plano Datadog dedicado persistido: {created} criados, {updated} atualizados, "
            f"{unchanged} sem alteração, {orphaned} órfãos, {skipped} ignorados por erro."
        ),
        after_data={
            "datadog_org_id": datadog_org_id,
            "template_id": template_id,
            "created": created,
            "updated": updated,
            "unchanged": unchanged,
            "orphaned": orphaned,
            "skipped_with_errors": skipped,
            "strategy": "dedicated_queue_template",
        },
    )
    db.commit()

    active_count = len(
        list(
            db.scalars(
                _scope_saved_stmt(datadog_org_id=datadog_org_id, template_id=template_id).where(GeneratedMonitor.is_active.is_(True))
            ).all()
        )
    )
    return DatadogPlanPersistResult(
        planned=len(plan.buckets),
        created=created,
        updated=updated,
        unchanged=unchanged,
        orphaned=orphaned,
        skipped_with_errors=skipped,
        active_saved_monitors=active_count,
    )


def bucket_name(bucket: DatadogPlanBucket) -> str:
    sample = bucket.sample_queues[0] if bucket.sample_queues else None
    suffix = f" - {sample.cluster_name} / {sample.vhost} / {sample.queue}" if sample else f" ({bucket.bucket_key})"
    return f"[RabbitMQ] {bucket.template_code}{suffix}"


