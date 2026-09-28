import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.core.security import decrypt_secret, encrypt_secret
from app.models.cluster import ClusterTemporaryQueueRegex, RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.providers.rabbitmq.client import RabbitMQClient
from app.providers.rabbitmq.normalizer import normalize_queue
from app.schemas.cluster import ClusterCreate, ClusterUpdate, DiscoveryResult
from app.services.template_service import apply_default_queue_templates


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cluster_options():
    return [
        selectinload(RabbitMQCluster.temporary_queue_regexes),
        selectinload(RabbitMQCluster.sre_group),
        selectinload(RabbitMQCluster.datadog_org),
    ]


def list_clusters(db: Session) -> list[RabbitMQCluster]:
    stmt = select(RabbitMQCluster).options(*_cluster_options()).order_by(RabbitMQCluster.name)
    return list(db.scalars(stmt).all())


def get_cluster(db: Session, cluster_id: int) -> RabbitMQCluster:
    cluster = db.scalar(
        select(RabbitMQCluster)
        .where(RabbitMQCluster.id == cluster_id)
        .options(*_cluster_options())
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster não encontrado")
    return cluster


async def _test_connection_values(protocol: str, dns: str, api_port: int, username: str, password: str) -> dict[str, Any]:
    base_url = f"{protocol}://{dns}:{api_port}"
    client = RabbitMQClient(base_url, username, password)
    try:
        overview = await client.get_overview()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise HTTPException(status_code=400, detail="Credencial RabbitMQ inválida ou sem permissão na Management API.") from exc
        raise HTTPException(status_code=400, detail=f"Erro ao testar RabbitMQ ({exc.response.status_code}): {exc.response.text[:500]}") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao conectar no RabbitMQ: {exc}") from exc

    return {
        "status": "ok",
        "rabbitmq_version": overview.get("rabbitmq_version"),
        "management_version": overview.get("management_version"),
    }


async def create_cluster(db: Session, payload: ClusterCreate) -> RabbitMQCluster:
    await _test_connection_values(payload.protocol, payload.dns, payload.api_port, payload.api_username, payload.api_password)

    cluster = RabbitMQCluster(
        name=payload.name,
        environment=payload.environment,
        business_line=payload.business_line,
        protocol=payload.protocol,
        dns=payload.dns,
        api_port=payload.api_port,
        api_username=payload.api_username,
        api_password_encrypted=encrypt_secret(payload.api_password) or "",
        sre_group_id=payload.sre_group_id,
        datadog_org_id=payload.datadog_org_id,
        datadog_integration_type=payload.datadog_integration_type,
        datadog_cluster_tag_value=payload.datadog_cluster_tag_value or payload.name,
        datadog_cluster_tag_key=payload.datadog_cluster_tag_key,
        datadog_vhost_tag_key=payload.datadog_vhost_tag_key,
        datadog_queue_tag_key=payload.datadog_queue_tag_key,
        datadog_node_tag_key=payload.datadog_node_tag_key,
        datadog_metric_messages=payload.datadog_metric_messages,
        datadog_metric_consumers=payload.datadog_metric_consumers,
        monitor_cluster=True,
        monitor_queues=True,
        monitor_exchanges=False,
        monitor_connections=False,
        monitor_nodes=False,
        monitor_shovels=False,
        is_active=payload.is_active,
    )
    db.add(cluster)
    db.flush()

    _replace_regexes(db, cluster, payload.temporary_queue_regexes)
    create_audit_log(
        db,
        entity_type="cluster",
        entity_id=cluster.id,
        action="created",
        summary=f"Cluster {cluster.name} criado",
        after_data={"name": cluster.name, "dns": cluster.dns, "environment": cluster.environment},
    )
    db.commit()
    return get_cluster(db, cluster.id)


async def update_cluster(db: Session, cluster_id: int, payload: ClusterUpdate) -> RabbitMQCluster:
    cluster = get_cluster(db, cluster_id)
    before = _cluster_snapshot(cluster)
    data = payload.model_dump(exclude_unset=True)

    regexes = data.pop("temporary_queue_regexes", None)
    password = data.pop("api_password", None)

    connection_fields = {"protocol", "dns", "api_port", "api_username"}
    must_validate_connection = bool(password) or any(field in data for field in connection_fields)

    if must_validate_connection:
        test_protocol = data.get("protocol", cluster.protocol)
        test_dns = data.get("dns", cluster.dns)
        test_api_port = data.get("api_port", cluster.api_port)
        test_username = data.get("api_username", cluster.api_username)
        test_password = password or decrypt_secret(cluster.api_password_encrypted) or ""
        await _test_connection_values(test_protocol, test_dns, test_api_port, test_username, test_password)

    if password:
        cluster.api_password_encrypted = encrypt_secret(password) or ""

    # Cluster e Queues ficam forçados como habilitados, e os demais bloqueados.
    data["monitor_cluster"] = True
    data["monitor_queues"] = True
    data["monitor_exchanges"] = False
    data["monitor_connections"] = False
    data["monitor_nodes"] = False
    data["monitor_shovels"] = False

    for field, value in data.items():
        setattr(cluster, field, value)

    if regexes is not None:
        _replace_regexes(db, cluster, regexes)

    create_audit_log(
        db,
        entity_type="cluster",
        entity_id=cluster.id,
        action="updated",
        summary=f"Cluster {cluster.name} atualizado",
        before_data=before,
        after_data=_cluster_snapshot(cluster),
    )
    db.commit()
    return get_cluster(db, cluster.id)


def _replace_regexes(db: Session, cluster: RabbitMQCluster, regexes: list[str]) -> None:
    for item in list(cluster.temporary_queue_regexes):
        db.delete(item)
    db.flush()

    cleaned = [item.strip() for item in regexes if item and item.strip()] or ["^$"]
    for index, pattern in enumerate(cleaned):
        db.add(ClusterTemporaryQueueRegex(cluster_id=cluster.id, pattern=pattern, position=index))


def _cluster_snapshot(cluster: RabbitMQCluster) -> dict[str, Any]:
    return {
        "id": cluster.id,
        "name": cluster.name,
        "environment": cluster.environment,
        "business_line": cluster.business_line,
        "protocol": cluster.protocol,
        "dns": cluster.dns,
        "api_port": cluster.api_port,
        "api_username": cluster.api_username,
        "sre_group_id": cluster.sre_group_id,
        "datadog_org_id": cluster.datadog_org_id,
        "datadog_integration_type": cluster.datadog_integration_type,
        "datadog_cluster_tag_value": cluster.datadog_cluster_tag_value,
        "datadog_cluster_tag_key": cluster.datadog_cluster_tag_key,
        "datadog_vhost_tag_key": cluster.datadog_vhost_tag_key,
        "datadog_queue_tag_key": cluster.datadog_queue_tag_key,
        "datadog_metric_messages": cluster.datadog_metric_messages,
        "datadog_metric_consumers": cluster.datadog_metric_consumers,
        "is_active": cluster.is_active,
        "temporary_queue_regexes": [r.pattern for r in cluster.temporary_queue_regexes],
    }


def _queue_is_temporary(queue_name: str, regexes: list[str]) -> bool:
    for pattern in regexes:
        try:
            if re.search(pattern, queue_name):
                return True
        except re.error:
            continue
    return False


async def test_cluster_connection(db: Session, cluster_id: int) -> dict[str, Any]:
    cluster = get_cluster(db, cluster_id)
    result = await _test_connection_values(
        cluster.protocol,
        cluster.dns,
        cluster.api_port,
        cluster.api_username,
        decrypt_secret(cluster.api_password_encrypted) or "",
    )
    return {"cluster_id": cluster.id, **result}


async def discover_queues(db: Session, cluster_id: int) -> DiscoveryResult:
    cluster = get_cluster(db, cluster_id)
    client = RabbitMQClient(cluster.api_base_url, cluster.api_username, decrypt_secret(cluster.api_password_encrypted) or "")
    raw_queues = await client.list_queues()

    now = _now()
    regexes = [item.pattern for item in cluster.temporary_queue_regexes] or ["^$"]
    existing = {
        (queue.vhost, queue.name): queue
        for queue in db.scalars(select(RabbitMQQueue).where(RabbitMQQueue.cluster_id == cluster.id)).all()
    }
    fetched_keys: set[tuple[str, str]] = set()
    created = updated = restored = temporary_matched = 0

    for raw in raw_queues:
        normalized = normalize_queue(raw)
        if not normalized["name"]:
            continue

        key = (normalized["vhost"], normalized["name"])
        fetched_keys.add(key)
        is_temporary = _queue_is_temporary(normalized["name"], regexes)
        temporary_matched += 1 if is_temporary else 0

        queue = existing.get(key)
        if queue:
            if queue.is_removed:
                restored += 1
            else:
                updated += 1

            queue.type = normalized["type"]
            queue.durable = normalized["durable"]
            queue.auto_delete = normalized["auto_delete"]
            queue.exclusive = normalized["exclusive"]
            queue.state = normalized["state"]
            queue.api_raw = normalized["api_raw"]
            queue.is_temporary = is_temporary
            queue.is_removed = False
            queue.removed_at = None
            queue.discovered_at = now
        else:
            queue = RabbitMQQueue(
                cluster_id=cluster.id,
                name=normalized["name"],
                vhost=normalized["vhost"],
                type=normalized["type"],
                durable=normalized["durable"],
                auto_delete=normalized["auto_delete"],
                exclusive=normalized["exclusive"],
                state=normalized["state"],
                api_raw=normalized["api_raw"],
                monitoring_schedule="24x7",
                dev_emails=[],
                is_dead_letter=False,
                monitor_anomaly=True,
                monitor_enabled=True,
                is_temporary=is_temporary,
                is_removed=False,
                discovered_at=now,
            )
            db.add(queue)
            db.flush()
            apply_default_queue_templates(db, queue)
            created += 1

    marked_removed = 0
    for key, queue in existing.items():
        if key not in fetched_keys and not queue.is_removed:
            queue.is_removed = True
            queue.removed_at = now
            marked_removed += 1

    cluster.last_discovery_at = now
    result = DiscoveryResult(
        cluster_id=cluster.id,
        fetched=len(fetched_keys),
        created=created,
        updated=updated,
        restored=restored,
        marked_removed=marked_removed,
        temporary_matched=temporary_matched,
    )

    create_audit_log(
        db,
        entity_type="cluster",
        entity_id=cluster.id,
        action="queue_discovery_executed",
        summary=f"Discovery de queues executado para {cluster.name}",
        after_data=result.model_dump(),
    )
    db.commit()
    return result
