"""Worker independente: busca todos os monitores gerenciados e repara drift.

Políticas:
- Somente monitores com managed_by:rabbitmq-monitor-portal; nunca remove remoto.
- Não adota IDs arbitrários: requer portal_binding_id:<binding_id> ou ID salvo.
- Fila transacional da v0.5.6 tem precedência; não disputa alterações recentes.
- Nunca cria se a listagem completa da organização falhou.
"""
import time
from datetime import timedelta
from sqlalchemy import select, func
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.logging import logger
from app.models.datadog_reconciliation import DatadogReconcileRun, DatadogReconcileCluster, DatadogReconcileControl
from app.models.datadog_org import DatadogOrg
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.generated_monitor import GeneratedMonitor
from app.models.datadog_sync_queue import DatadogSyncQueue
from app.services.datadog_sync_service import _get_client, _normalize_for_compare
from app.services.datadog_reconcile_service import utcnow, enqueue_reconciliation
from app.services.datadog_planner_service import persist_datadog_plan


def _update_run(db, run_id, **values):
    run = db.get(DatadogReconcileRun, run_id)
    if run:
        for key, val in values.items():
            setattr(run, key, val)
        run.heartbeat_at = utcnow()
        db.commit()
    return run


def _finish(db, run_id, status, message=None):
    ctrl = db.scalar(select(DatadogReconcileControl).where(DatadogReconcileControl.id == 1).with_for_update())
    run = db.get(DatadogReconcileRun, run_id)
    run.status = status
    run.stage = 'Finalizado' if status in ('done','done_with_errors') else 'Falha na execução'
    run.current_action = None
    run.finished_at = utcnow()
    run.error_summary = message[:1900] if message else None
    if ctrl and ctrl.active_run_id == run_id:
        ctrl.active_run_id = None
    db.commit()


def _is_pending(db, queue_id):
    ticket = db.get(DatadogSyncQueue, queue_id)
    return ticket and ticket.status in ('pending','running','retry','blocked','error')


def _desired_payload(m):
    return {
        'name': m.name or '',
        'type': (m.desired_config or {}).get('monitor_type') or 'query alert',
        'query': m.query or '', 'message': m.message or '',
        'tags': m.tags_json or [], 'options': m.options_json or {},
    }


def _different(payload, actual):
    for key in ('name','type','query','message'):
        if payload[key] != actual.get(key):
            return True
    if sorted(payload['tags']) != sorted(actual.get('tags') or []):
        return True
    for key, value in payload['options'].items():
        if _normalize_for_compare(value) != _normalize_for_compare((actual.get('options') or {}).get(key)):
            return True
    return False


def _mark_applied(m, external_id, client):
    m.external_monitor_id = m.external_id = str(external_id)
    m.external_monitor_url = m.external_url = client.monitor_url(external_id)
    m.applied_config_hash = m.desired_config_hash
    m.last_applied_config = m.desired_config
    m.sync_status = m.status = 'synced'
    m.last_synced_at = utcnow()
    m.last_error = m.error_message = None


def execute_run(run_id):
    with SessionLocal() as db:
        _update_run(db, run_id, status='running', started_at=utcnow(), stage='Inventariando organizações')
        orgs = db.scalars(select(DatadogOrg).where(DatadogOrg.is_active.is_(True)).order_by(DatadogOrg.id)).all()
        clusters = db.scalars(select(RabbitMQCluster).where(RabbitMQCluster.datadog_org_id.in_([o.id for o in orgs])).order_by(RabbitMQCluster.id)).all() if orgs else []
        counts = dict(db.execute(select(RabbitMQQueue.cluster_id, func.count()).where(
            RabbitMQQueue.cluster_id.in_([c.id for c in clusters]), RabbitMQQueue.is_removed.is_(False)
        ).group_by(RabbitMQQueue.cluster_id)).all()) if clusters else {}
        run = db.get(DatadogReconcileRun, run_id)
        run.total_orgs = len(orgs)
        run.total_clusters = len(clusters)
        run.total_queues = sum(counts.values())
        for cluster in clusters:
            db.add(DatadogReconcileCluster(run_id=run_id, cluster_id=cluster.id, cluster_name=cluster.name,
                org_name=cluster.datadog_org.name if cluster.datadog_org else 'Indefinida', total_queues=counts.get(cluster.id, 0)))
        db.commit()
        for org in orgs:
            run = _update_run(db, run_id, stage='Obtendo monitores da org Datadog', current_action=f'Listando monitores de {org.name}')
            try:
                client = _get_client(org)
                # Ambientes que compartilham uma Org Datadog não devem reconciliar
                # monitores explicitamente marcados como pertencentes a outro ambiente.
                found = [m for m in client.search_managed_monitors()
                         if not any(tag.startswith('portal_instance:') and
                                    tag != f'portal_instance:{settings.app_env}'
                                    for tag in (m.get('tags') or []))]
                by_id = {str(m['id']): m for m in found if m.get('id') is not None}
                matched_remote_ids: set[str] = set()
                by_binding = {}
                for item in found:
                    for tag in item.get('tags') or []:
                        if tag.startswith('portal_binding_id:'):
                            by_binding.setdefault(tag.split(':', 1)[1], []).append(item)
            except Exception as exc:
                # Uma org inacessível não pode ser tratada como se todos os monitores tivessem desaparecido.
                for c in clusters:
                    if c.datadog_org_id != org.id:
                        continue
                    entry = db.get(DatadogReconcileCluster, (run_id,c.id))
                    entry.status = 'error'
                    entry.current_action = 'Falha ao listar org; nenhuma modificação aplicada'
                    entry.errors += 1
                    entry.processed_queues = entry.total_queues
                    run.errors += 1
                    run.processed_queues += entry.total_queues
                    run.processed_clusters += 1
                run.processed_orgs += 1
                run.current_action = f'Falha na org {org.name}: {type(exc).__name__}: {exc}'[:500]
                db.commit()
                continue
            for cluster in clusters:
                if cluster.datadog_org_id != org.id:
                    continue
                entry = db.get(DatadogReconcileCluster, (run_id, cluster.id))
                entry.status = 'running'
                queues = db.scalars(select(RabbitMQQueue).where(
                    RabbitMQQueue.cluster_id == cluster.id, RabbitMQQueue.is_removed.is_(False)).order_by(RabbitMQQueue.id)).all()
                for q in queues:
                    entry.current_queue = q.name
                    entry.current_action = 'Comparando configurações'
                    run.current_action = f'{cluster.name} / {q.name}: comparando'
                    run.stage = 'Validando queues e monitores'
                    run.heartbeat_at = utcnow()
                    db.commit()
                    try:
                        if _is_pending(db, q.id):
                            entry.current_action = 'Fila aguardando dispatcher; ignorada nesta passagem'
                        else:
                            # Replaneja contra estado desejado vigente (sem remover órfãos).
                            persist_datadog_plan(db, queue_id=q.id)
                            monitors = db.scalars(select(GeneratedMonitor).where(
                                GeneratedMonitor.queue_id==q.id, GeneratedMonitor.datadog_org_id==org.id,
                                GeneratedMonitor.provider=='datadog', GeneratedMonitor.is_active.is_(True),
                                GeneratedMonitor.sync_status.notin_(['pending_delete','orphaned','disabled','deleted'])
                            )).all()
                            for mon in monitors:
                                payload = _desired_payload(mon)
                                if not payload['query'] or not payload['message']:
                                    raise ValueError(f'Monitor {mon.id} sem query ou mensagem')
                                current_id = str(mon.external_monitor_id or mon.external_id or '')
                                remote = by_id.get(current_id) if current_id else None
                                stable_key = str((mon.grouping_key or '').split(':')[-1])
                                candidates = by_binding.get(stable_key, []) if stable_key else []
                                if remote is None and current_id:
                                    # Um usuário pode ter retirado a tag managed_by no Datadog.
                                    # Só recuperamos por ID previamente salvo pelo Portal.
                                    try:
                                        actual_by_id = client.get_monitor(current_id)
                                        remote = {'id': actual_by_id['id'], 'tags': actual_by_id.get('tags') or []}
                                    except Exception as lookup_exc:
                                        if getattr(lookup_exc, 'status_code', None) != 404:
                                            raise
                                if remote is None and not candidates:
                                    # Templates legados anteriores à tag portal_binding_id:
                                    # recuperar apenas se o par nome/query for único na org.
                                    legacy = [x for x in found if x.get('name') == payload['name'] and x.get('query') == payload['query']]
                                    if len(legacy) == 1:
                                        remote = legacy[0]
                                    elif len(legacy) > 1:
                                        raise ValueError('Há múltiplos monitores legados com mesmo nome/query; associação manual necessária')
                                if remote is None and len(candidates) > 1:
                                    raise ValueError(f'IDs remotos duplicados com portal_binding_id:{stable_key}; revisão manual necessária')
                                if remote is None and len(candidates) == 1:
                                    remote = candidates[0]
                                if remote:
                                    rid = str(remote['id'])
                                    matched_remote_ids.add(rid)
                                    # GET completo para comparar query, message, tags e options.
                                    actual = client.get_monitor(rid)
                                    if _different(payload, actual):
                                        entry.current_action = f'Atualizando monitor Datadog #{rid}'
                                        run.current_action = entry.current_action
                                        db.commit()
                                        client.update_monitor(rid, payload)
                                        entry.updated += 1
                                        run.updated += 1
                                    if current_id != rid:
                                        run.recovered += 1
                                    _mark_applied(mon, rid, client)
                                else:
                                    entry.current_action = f'Criando monitor para {q.name}'
                                    run.current_action = entry.current_action
                                    db.commit()
                                    created = client.create_monitor(payload)
                                    rid = created.get('id')
                                    if not rid:
                                        raise RuntimeError('Datadog retornou criação sem ID')
                                    _mark_applied(mon, rid, client)
                                    matched_remote_ids.add(str(rid))
                                    by_id[str(rid)] = {'id': rid, 'tags': payload['tags']}
                                    by_binding.setdefault(stable_key, []).append({'id': rid, 'tags': payload['tags']})
                                    entry.created += 1
                                    run.created += 1
                                db.commit()
                    except Exception as exc:
                        logger.error('Reconciliação run=%s queue=%s: %s',run_id,q.id,exc)
                        db.rollback()
                        # Rollback descarta atualizações ainda não commitadas.
                        # Recarrega as linhas antes de registrar o erro.
                        run = db.get(DatadogReconcileRun, run_id)
                        entry = db.get(DatadogReconcileCluster, (run_id, cluster.id))
                        entry.errors += 1
                        run.errors += 1
                        entry.current_action = f'Erro: {type(exc).__name__}: {exc}'[:255]
                        # Erros não interrompem os demais clusters/queues.
                    finally:
                        entry.processed_queues += 1
                        run.processed_queues += 1
                        run.heartbeat_at = utcnow()
                        db.commit()
                entry.status = 'done' if not entry.errors else 'done_with_errors'
                entry.current_queue = None
                entry.current_action = 'Cluster concluído'
                run.processed_clusters += 1
                db.commit()
            # Monitores com tag managed_by mas sem associação no Portal são
            # contabilizados, nunca excluídos automaticamente.
            all_known_ids = {str(id) for (id,) in db.execute(
                select(GeneratedMonitor.external_monitor_id).where(
                    GeneratedMonitor.datadog_org_id == org.id,
                    GeneratedMonitor.external_monitor_id.is_not(None),
                    GeneratedMonitor.is_active.is_(True),
                )).all()}
            run.untracked_remote += len(set(by_id) - all_known_ids - matched_remote_ids)
            run.processed_orgs += 1
            db.commit()
        _finish(db, run_id, 'done' if not run.errors else 'done_with_errors')


def main():
    logger.info('Datadog reconciler v0.5.6.2 iniciado')
    while True:
        try:
            with SessionLocal() as db:
                # Somente um worker faz a transição queued -> running.
                ctrl = db.scalar(select(DatadogReconcileControl).where(DatadogReconcileControl.id==1).with_for_update())
                active = db.get(DatadogReconcileRun, ctrl.active_run_id) if ctrl and ctrl.active_run_id else None
                if active and active.status == 'running' and active.heartbeat_at and utcnow() - active.heartbeat_at > timedelta(minutes=40):
                    _finish(db, active.id, 'failed', 'Lease expirado após interrupção do worker; execução encerrada para permitir nova tentativa.')
                    active = None
                    db.commit()
                if active and active.status == 'queued':
                    run_id = active.id
                    active.status = 'running'
                    active.heartbeat_at = utcnow()
                    db.commit()
                else:
                    run_id = None
                    db.commit()
                if not run_id and not active:
                    latest = db.scalar(select(DatadogReconcileRun).order_by(DatadogReconcileRun.id.desc()).limit(1))
                    last = latest.created_at if latest else None
                    if not last or utcnow() - last >= timedelta(seconds=max(300,settings.datadog_reconcile_interval_seconds)):
                        try:
                            enqueue_reconciliation(db,actor='scheduler:datadog-reconciler',trigger='daily')
                        except Exception:
                            db.rollback()
            if run_id:
                try:
                    execute_run(run_id)
                except Exception as exc:
                    logger.exception('Falha geral na reconciliação %s', run_id)
                    with SessionLocal() as db:
                        _finish(db,run_id,'failed',f'{type(exc).__name__}: {exc}')
            else:
                time.sleep(max(2, settings.datadog_reconcile_poll_seconds))
        except Exception:
            logger.exception('Falha no loop reconciliador')
            time.sleep(10)

if __name__=='__main__':
    main()
