from urllib.parse import quote, urlsplit
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.monitor_template import QueueMonitorTemplate
from app.schemas.public_reference import PublicAppliedTemplateRead, PublicQueueReferenceRead
from app.services.template_service import merge_effective_config


def get_public_queue_reference(db: Session, *, rabbitmq_cluster: str, vhost: str, queue: str) -> PublicQueueReferenceRead:
    stmt = (
        select(RabbitMQQueue)
        .join(RabbitMQQueue.cluster)
        .where(
            or_(RabbitMQCluster.name == rabbitmq_cluster, RabbitMQCluster.datadog_cluster_tag_value == rabbitmq_cluster),
            RabbitMQQueue.vhost == vhost,
            RabbitMQQueue.name == queue,
        )
        .options(
            selectinload(RabbitMQQueue.cluster).selectinload(RabbitMQCluster.sre_group),
            selectinload(RabbitMQQueue.cluster).selectinload(RabbitMQCluster.datadog_org),
            selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template),
        )
    )
    queue_obj = db.scalar(stmt)
    if not queue_obj:
        raise HTTPException(status_code=404, detail="Queue não encontrada no portal para os parâmetros informados.")

    cluster = queue_obj.cluster
    sre_group = cluster.sre_group
    sre_members = [member.email for member in getattr(sre_group, "members", [])] if sre_group else []
    applied_templates = []
    for binding in queue_obj.template_bindings or []:
        template = binding.template
        if not template:
            continue
        applied_templates.append(
            PublicAppliedTemplateRead(
                binding_id=binding.id,
                template_id=template.id,
                code=template.code,
                name=template.name,
                enabled=binding.enabled,
                is_customized=bool(binding.overrides),
                effective_config=merge_effective_config(template, binding.overrides),
                overrides=binding.overrides or None,
            )
        )

    datadog_monitors_url = None
    org_url = (cluster.datadog_org.org_url or "").rstrip("/") if cluster.datadog_org else ""
    # O link é gerado no servidor com os identificadores efetivos do cluster.
    if org_url and urlsplit(org_url).scheme == "https" and urlsplit(org_url).hostname:
        scope_filters = []
        if cluster.datadog_use_cluster_dimension is not False:
            scope_filters.append(f'{cluster.datadog_cluster_tag_key or "rabbitmq_cluster"}:{cluster.datadog_cluster_tag_value or cluster.name}')
        scope_filters.extend(f'{item["key"]}:{item["value"]}' for item in (cluster.datadog_extra_dimensions or []))
        scope_filters.extend([
            f'{cluster.datadog_vhost_tag_key or "vhost"}:{queue_obj.vhost}',
            f'{cluster.datadog_queue_tag_key or "queue"}:{queue_obj.name}',
        ])
        scope_query = ('tag:"managed_by:rabbitmq-monitor-portal" scope:('
                       + ' AND '.join(f'"{value}"' for value in scope_filters) + ')')
        datadog_monitors_url = f"{org_url}/monitors/manage?q={quote(scope_query, safe='')}"

    return PublicQueueReferenceRead(
        cluster_id=cluster.id,
        cluster_name=cluster.name,
        rabbitmq_cluster_tag=cluster.datadog_cluster_tag_value or cluster.name,
        datadog_monitors_url=datadog_monitors_url,
        environment=cluster.environment,
        business_line=cluster.business_line,
        vhost=queue_obj.vhost,
        queue=queue_obj.name,
        type=queue_obj.type,
        state=queue_obj.state,
        service_name=queue_obj.service_name,
        criticality=queue_obj.criticality,
        owner_email=queue_obj.owner_email,
        sre_group_name=sre_group.name if sre_group else None,
        sre_group_members=sre_members,
        dev_emails=queue_obj.dev_emails or [],
        journey=queue_obj.journey,
        description=queue_obj.description,
        monitoring_schedule=queue_obj.monitoring_schedule,
        is_removed=queue_obj.is_removed,
        removed_at=queue_obj.removed_at,
        discovered_at=queue_obj.discovered_at,
        updated_at=queue_obj.updated_at,
        applied_templates=applied_templates,
    )
