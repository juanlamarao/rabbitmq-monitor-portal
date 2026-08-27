from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.core.security import decrypt_secret
from app.models.datadog_org import DatadogOrg
from app.models.generated_monitor import GeneratedMonitor
from app.providers.datadog.client import DatadogApiError, DatadogMonitorClient

APPLICABLE_STATUSES = ("pending_create", "pending_update", "error")
BLOCKED_STATUSES = ("orphaned", "disabled")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass
class DatadogMonitorSyncResult:
    requested: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    synced: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    monitor_ids: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "requested": self.requested,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "failed": self.failed,
            "synced": self.synced,
            "errors": self.errors,
            "monitor_ids": self.monitor_ids,
        }


def _base_stmt():
    return (
        select(GeneratedMonitor)
        .where(
            GeneratedMonitor.provider == "datadog",
            GeneratedMonitor.monitor_scope_type == "grouped_queue",
            GeneratedMonitor.is_active.is_(True),
        )
        .options(selectinload(GeneratedMonitor.datadog_org), selectinload(GeneratedMonitor.template))
        .order_by(GeneratedMonitor.datadog_org_id, GeneratedMonitor.template_id, GeneratedMonitor.id)
    )


def _get_client(org: DatadogOrg) -> DatadogMonitorClient:
    if not org or not org.is_active:
        raise ValueError("Datadog Org inativa ou não encontrada.")
    if not org.has_credentials:
        raise ValueError(f'Datadog Org "{org.name}" não possui API Key/APP Key configuradas.')
    api_key = decrypt_secret(org.api_key_encrypted)
    app_key = decrypt_secret(org.app_key_encrypted)
    if not api_key or not app_key:
        raise ValueError(f'Datadog Org "{org.name}" não possui credenciais descriptografáveis.')
    return DatadogMonitorClient(api_url=org.api_url, api_key=api_key, app_key=app_key, org_url=org.org_url)


def _operation_for_monitor(monitor: GeneratedMonitor) -> str | None:
    external_id = monitor.external_monitor_id or monitor.external_id
    if monitor.sync_status in BLOCKED_STATUSES:
        return None
    if not external_id:
        return "create"
    if monitor.applied_config_hash != monitor.desired_config_hash or monitor.sync_status in ("pending_update", "error"):
        return "update"
    return None


def _validate_monitor(monitor: GeneratedMonitor) -> None:
    if not monitor.datadog_org:
        raise ValueError("Monitor planejado não possui Datadog Org vinculada.")
    if monitor.sync_status in BLOCKED_STATUSES:
        raise ValueError(f'Monitor com status "{monitor.sync_status}" não pode ser aplicado nesta etapa.')
    if not monitor.name:
        raise ValueError("Monitor planejado não possui nome.")
    if not monitor.query:
        raise ValueError("Monitor planejado não possui query Datadog.")
    if not monitor.message:
        raise ValueError("Monitor planejado não possui message Datadog.")
    if not monitor.desired_config_hash:
        raise ValueError("Monitor planejado não possui desired_config_hash. Salve o plano novamente antes de aplicar.")


def _mark_error(monitor: GeneratedMonitor, message: str) -> None:
    monitor.sync_status = "error"
    monitor.status = "error"
    monitor.last_error = message[:5000]
    monitor.error_message = message[:5000]


def apply_datadog_monitors(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    monitor_ids: list[int] | None = None,
    actor: str = "worker",
) -> DatadogMonitorSyncResult:
    """Cria/atualiza monitores agrupados reais no Datadog.

    Guardrails desta etapa:
    - só aplica pending_create, pending_update e error;
    - ignora orphaned/disabled;
    - não deleta nem muta monitores;
    - não cria se query/message estiverem vazios;
    - usa apenas o estado desejado persistido em generated_monitors.
    """
    stmt = _base_stmt().where(GeneratedMonitor.sync_status.in_(APPLICABLE_STATUSES))
    if datadog_org_id:
        stmt = stmt.where(GeneratedMonitor.datadog_org_id == datadog_org_id)
    if template_id:
        stmt = stmt.where(GeneratedMonitor.template_id == template_id)
    if monitor_ids:
        stmt = stmt.where(GeneratedMonitor.id.in_(monitor_ids))

    monitors = list(db.scalars(stmt).all())
    result = DatadogMonitorSyncResult(requested=len(monitors), monitor_ids=[item.id for item in monitors])

    client_by_org_id: dict[int, DatadogMonitorClient] = {}

    for index, monitor in enumerate(monitors, start=1):
        try:
            _validate_monitor(monitor)
            operation = _operation_for_monitor(monitor)
            if not operation:
                result.skipped += 1
                continue

            org = monitor.datadog_org
            assert org is not None
            if org.id not in client_by_org_id:
                client_by_org_id[org.id] = _get_client(org)
            client = client_by_org_id[org.id]
            payload = client.build_monitor_payload(
                name=monitor.name or "",
                monitor_type=(monitor.desired_config or {}).get("monitor_type") or "query alert",
                query=monitor.query or "",
                message=monitor.message or "",
                tags=monitor.tags_json or [],
                options=monitor.options_json or {},
            )

            if operation == "create":
                response = client.create_monitor(payload)
                result.created += 1
            else:
                response = client.update_monitor(monitor.external_monitor_id or monitor.external_id or "", payload)
                result.updated += 1

            external_id = str(response.get("id") or monitor.external_monitor_id or monitor.external_id or "")
            monitor.external_monitor_id = external_id
            monitor.external_id = external_id
            monitor.external_monitor_url = client.monitor_url(external_id) if external_id else None
            monitor.external_url = monitor.external_monitor_url
            monitor.applied_config_hash = monitor.desired_config_hash
            monitor.last_applied_config = monitor.desired_config
            monitor.sync_status = "synced"
            monitor.status = "synced"
            monitor.last_synced_at = _utcnow()
            monitor.last_error = None
            monitor.error_message = None
            result.synced += 1

        except (DatadogApiError, ValueError, RuntimeError) as exc:
            result.failed += 1
            message = exc.message if isinstance(exc, DatadogApiError) else str(exc)
            _mark_error(monitor, message)
            result.errors.append(
                {
                    "generated_monitor_id": monitor.id,
                    "datadog_org_id": monitor.datadog_org_id,
                    "template_id": monitor.template_id,
                    "error": message,
                }
            )
        except Exception as exc:  # noqa: BLE001 - evita derrubar o batch inteiro por um monitor.
            result.failed += 1
            message = str(exc)
            _mark_error(monitor, message)
            result.errors.append(
                {
                    "generated_monitor_id": monitor.id,
                    "datadog_org_id": monitor.datadog_org_id,
                    "template_id": monitor.template_id,
                    "error": message,
                }
            )

        if index % 25 == 0:
            db.commit()

    create_audit_log(
        db,
        entity_type="datadog_monitor_sync",
        action="apply",
        actor=actor,
        summary=(
            f"Sync Datadog aplicado: {result.created} criados, {result.updated} atualizados, "
            f"{result.failed} falhas, {result.skipped} ignorados."
        ),
        after_data={
            "datadog_org_id": datadog_org_id,
            "template_id": template_id,
            "monitor_ids": monitor_ids,
            **result.to_dict(),
            "errors": result.errors[:50],
        },
    )
    db.commit()
    return result


def count_applicable_datadog_monitors(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
) -> dict[str, int]:
    stmt = _base_stmt().where(GeneratedMonitor.sync_status.in_(APPLICABLE_STATUSES))
    if datadog_org_id:
        stmt = stmt.where(GeneratedMonitor.datadog_org_id == datadog_org_id)
    if template_id:
        stmt = stmt.where(GeneratedMonitor.template_id == template_id)
    monitors = list(db.scalars(stmt).all())
    return {
        "total": len(monitors),
        "pending_create": sum(1 for item in monitors if item.sync_status == "pending_create"),
        "pending_update": sum(1 for item in monitors if item.sync_status == "pending_update"),
        "error": sum(1 for item in monitors if item.sync_status == "error"),
    }
