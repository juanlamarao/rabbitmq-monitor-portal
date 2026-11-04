"""Gatilho único por ambiente e apresentação dos runs do reconciliador."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.audit.service import create_audit_log
from app.models.datadog_reconciliation import DatadogReconcileRun, DatadogReconcileCluster, DatadogReconcileControl


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def enqueue_reconciliation(db: Session, *, actor: str, trigger: str) -> DatadogReconcileRun:
    # Linha única + FOR UPDATE evita duas requisições criando processos simultâneos.
    control = db.scalar(select(DatadogReconcileControl).where(DatadogReconcileControl.id == 1).with_for_update())
    if control is None:
        # Migração 011 deve criar a linha 1. Fail-closed se não foi aplicada.
        raise HTTPException(503, 'Migração SQL 011 necessária para habilitar a reconciliação.')
    if control.active_run_id:
        active = db.get(DatadogReconcileRun, control.active_run_id)
        if active and active.status in ('queued', 'running'):
            # Falha real só é liberada pelo worker quando marcar o run como failed.
            raise HTTPException(409, f'Reconciliação #{active.id} já está em execução ou aguardando worker.')
        control.active_run_id = None
    run = DatadogReconcileRun(status='queued', trigger=trigger, requested_by=actor, stage='Aguardando worker')
    db.add(run)
    db.flush()
    control.active_run_id = run.id
    create_audit_log(db, entity_type='datadog_reconcile', entity_id=run.id, action='enqueue',
                     actor=actor, summary=f'Reconciliação Datadog solicitada ({trigger})')
    db.commit()
    db.refresh(run)
    return run


def describe_run(db: Session, run: DatadogReconcileRun) -> dict:
    clusters = db.scalars(select(DatadogReconcileCluster).where(DatadogReconcileCluster.run_id == run.id).order_by(DatadogReconcileCluster.cluster_name)).all()
    return {
        'id': run.id, 'status': run.status, 'trigger': run.trigger, 'requested_by': run.requested_by,
        'stage': run.stage, 'current_action': run.current_action,
        'total_orgs': run.total_orgs, 'processed_orgs': run.processed_orgs,
        'total_clusters': run.total_clusters, 'processed_clusters': run.processed_clusters,
        'total_queues': run.total_queues, 'processed_queues': run.processed_queues,
        'percent': round(100*run.processed_queues / run.total_queues, 1) if run.total_queues else (100 if run.status == 'done' else 0),
        'created': run.created, 'updated': run.updated, 'recovered': run.recovered,
        'errors': run.errors, 'untracked_remote': run.untracked_remote, 'error_summary': run.error_summary,
        'created_at': run.created_at, 'started_at': run.started_at, 'finished_at': run.finished_at,
        'clusters': [{
            'cluster_id': c.cluster_id, 'cluster_name': c.cluster_name, 'org_name': c.org_name,
            'status': c.status, 'total_queues': c.total_queues, 'processed_queues': c.processed_queues,
            'percent': round(100*c.processed_queues/c.total_queues, 1) if c.total_queues else (100 if c.status == 'done' else 0),
            'current_queue': c.current_queue, 'current_action': c.current_action,
            'created': c.created, 'updated': c.updated, 'errors': c.errors,
        } for c in clusters],
    }
