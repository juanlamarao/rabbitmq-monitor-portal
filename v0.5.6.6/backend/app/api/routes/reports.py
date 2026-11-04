"""Reports administrativos (consultas de leitura, CSV completo em streaming, PDF limitado)."""
import csv
import io
from datetime import datetime, timezone
from typing import Iterator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import String, and_, case, cast, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.datadog_org import DatadogOrg
from app.models.datadog_sync_queue import DatadogSyncQueue
from app.models.generated_monitor import GeneratedMonitor
from app.models.monitor_template import MonitorTemplate, QueueMonitorTemplate

router = APIRouter()

# Explicit column sets prevent accidental export of API keys, LDAP data and queue api_raw.
DEFINITIONS = {
    "templates_review": ("Templates para revisão", "Templates inativos ou sem query de monitor Datadog", ["ID", "Código", "Nome", "Estado", "Motivo"]),
    "queues_unsynced": ("Queues sem sincronização", "Filas com monitores e revisão pendente, falha ou sem ticket de sync", ["Cluster", "Vhost", "Fila", "Status", "Revisão desejada", "Revisão aplicada"]),
    "customized": ("Monitores customizados", "Templates aplicados com overrides por fila", ["Cluster", "Vhost", "Fila", "Template", "Ativo", "Overrides"]),
    "queues_no_templates": ("Queues sem templates", "Filas ativas sem templates habilitados", ["Cluster", "Vhost", "Fila", "Serviço", "Criticidade", "Jornada"]),
    "monitor_attention": ("Monitores que exigem atenção", "Monitores locais ativos que não estão sincronizados", ["Cluster", "Fila", "Template", "Monitor ID", "Status", "Erro"]),
    "clusters_inventory": ("Inventário de clusters", "Clusters cadastrados e quantitativos das filas", ["Cluster", "Organização Datadog", "Ativo", "Queues", "Último discovery"]),
    "sync_backlog": ("Fila Datadog pendente", "Entradas da outbox aguardando processamento ou revisão", ["Cluster", "Vhost", "Fila", "Estado", "Tentativas", "Último erro"]),
}


def _query(report_id: str, cluster_id: int | None):
    if report_id not in DEFINITIONS:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    c, q, t, b, s, gm, org = RabbitMQCluster, RabbitMQQueue, MonitorTemplate, QueueMonitorTemplate, DatadogSyncQueue, GeneratedMonitor, DatadogOrg
    scoped = (c.id == cluster_id) if cluster_id is not None else None
    if report_id == "templates_review":
        reason = case((t.is_active.is_(False), "Inativo"),
                      (or_(t.datadog_query_template.is_(None), func.trim(t.datadog_query_template) == ""), "Query ausente"),
                      else_="Verificar")
        statement = select(t.id, t.code, t.name, t.is_active, reason).where(
            or_(t.is_active.is_(False), t.datadog_query_template.is_(None), func.trim(t.datadog_query_template) == "")
        ).order_by(t.code, t.id)
        # Template is global; cluster filter intentionally doesn't apply.
        return statement
    if report_id == "queues_unsynced":
        bound = exists(select(b.id).where(b.queue_id == q.id, b.enabled.is_(True)))
        return (select(c.name, q.vhost, q.name, func.coalesce(s.status, "not_configured"),
                       func.coalesce(s.desired_revision, 0), func.coalesce(s.applied_revision, 0))
                .select_from(q).join(c, q.cluster_id == c.id)
                .outerjoin(s, s.queue_id == q.id)
                .where(q.is_removed.is_(False), bound,
                       or_(s.queue_id.is_(None), s.status != "synced", s.desired_revision > s.applied_revision))
                .where(scoped if scoped is not None else True)
                .order_by(c.name, q.vhost, q.name))
    if report_id == "customized":
        return (select(c.name, q.vhost, q.name, t.code, b.enabled, cast(b.overrides, String))
                .select_from(b).join(q, b.queue_id == q.id).join(c, c.id == q.cluster_id)
                .join(t, t.id == b.template_id)
                .where(q.is_removed.is_(False), b.overrides.is_not(None))
                .where(scoped if scoped is not None else True)
                .order_by(c.name, q.vhost, q.name, t.code))
    if report_id == "queues_no_templates":
        bound = exists(select(b.id).where(b.queue_id == q.id, b.enabled.is_(True)))
        return (select(c.name, q.vhost, q.name, q.service_name, q.criticality, q.journey)
                .select_from(q).join(c, q.cluster_id == c.id)
                .where(q.is_removed.is_(False), ~bound)
                .where(scoped if scoped is not None else True)
                .order_by(c.name, q.vhost, q.name))
    if report_id == "monitor_attention":
        return (select(c.name, q.name, t.code, gm.external_monitor_id, gm.sync_status, gm.last_error)
                .select_from(gm).outerjoin(q, q.id == gm.queue_id)
                .outerjoin(c, c.id == gm.cluster_id).outerjoin(t, t.id == gm.template_id)
                .where(gm.is_active.is_(True), gm.sync_status != "synced")
                .where(scoped if scoped is not None else True)
                .order_by(gm.updated_at.desc(), gm.id.desc()))
    if report_id == "clusters_inventory":
        count_queues = func.count(q.id)
        return (select(c.name, org.name, c.is_active, count_queues, c.last_discovery_at)
                .select_from(c).outerjoin(org, org.id == c.datadog_org_id)
                .outerjoin(q, and_(q.cluster_id == c.id, q.is_removed.is_(False)))
                .where(scoped if scoped is not None else True)
                .group_by(c.id, c.name, org.name, c.is_active, c.last_discovery_at)
                .order_by(c.name))
    # sync_backlog
    return (select(c.name, q.vhost, q.name, s.status, s.attempts, s.last_error)
            .select_from(s).join(q, q.id == s.queue_id).join(c, c.id == q.cluster_id)
            .where(or_(s.status != "synced", s.desired_revision > s.applied_revision))
            .where(scoped if scoped is not None else True)
            .order_by(s.updated_at.desc(), q.id))


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    return str(value)


@router.get("")
def list_report_types():
    return [{"id": key, "name": definition[0], "description": definition[1], "columns": definition[2],
             "cluster_filter": key != "templates_review"} for key, definition in DEFINITIONS.items()]


@router.get("/{report_id}")
def preview_report(report_id: str, cluster_id: int | None = Query(default=None, ge=1), limit: int = Query(default=100, ge=1, le=500)):
    statement = _query(report_id, cluster_id)
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
        rows = [[_cell(v) for v in row] for row in db.execute(statement.limit(limit)).all()]
    return {"name": DEFINITIONS[report_id][0], "columns": DEFINITIONS[report_id][2],
            "total": count, "rows": rows, "preview_limit": limit}


def _csv_stream(report_id: str, cluster_id: int | None) -> Iterator[str]:
    yield "\ufeff"  # UTF-8 BOM supports Excel.
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(DEFINITIONS[report_id][2])
    yield buffer.getvalue()
    buffer.seek(0); buffer.truncate(0)
    # Open the session inside the stream so it survives the HTTP response lifecycle.
    with SessionLocal() as db:
        for row in db.execute(_query(report_id, cluster_id).execution_options(yield_per=500)):
            writer.writerow(["'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value for value in [_cell(v) for v in row]])
            yield buffer.getvalue()
            buffer.seek(0); buffer.truncate(0)


@router.get("/{report_id}/export.csv")
def export_csv(report_id: str, cluster_id: int | None = Query(default=None, ge=1)):
    _query(report_id, cluster_id)
    name = f"monitor-portal-{report_id}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(_csv_stream(report_id, cluster_id), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.get("/{report_id}/export.pdf")
def export_pdf(report_id: str, cluster_id: int | None = Query(default=None, ge=1)):
    statement = _query(report_id, cluster_id)
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, LongTable, Paragraph, Spacer, TableStyle
    from xml.sax.saxutils import escape

    with SessionLocal() as db:
        total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
        rows = [[_cell(v) for v in row] for row in db.execute(statement.limit(1000)).all()]

    stream = io.BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=landscape(A4), leftMargin=28, rightMargin=28,
                            topMargin=32, bottomMargin=28)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("cell", parent=styles["Normal"], fontSize=7.3, leading=9.5, wordWrap="CJK")
    header = ParagraphStyle("header", parent=small, textColor=colors.white, fontName="Helvetica-Bold")
    label = DEFINITIONS[report_id][0]
    elements = [Paragraph(escape(label), styles["Title"]),
                Paragraph(f"Gerado em {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · Total: {total:,} registro(s)", styles["Normal"]), Spacer(1, 12)]
    if total > 1000:
        elements.extend([Paragraph("Prévia PDF limitada aos primeiros 1.000 registros. Use CSV para obter todos os dados.", styles["Normal"]), Spacer(1, 10)])
    headings = DEFINITIONS[report_id][2]
    table_rows = [[Paragraph(escape(title), header) for title in headings]]
    for row in rows:
        table_rows.append([Paragraph(escape(str(value))[:300].replace("\n", "<br/>"), small) for value in row])
    if not rows:
        table_rows.append([Paragraph("Sem dados" if i == 0 else "", small) for i in range(len(headings))])
    width = (landscape(A4)[0] - 56) / len(headings)
    table = LongTable(table_rows, colWidths=[width] * len(headings), repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0756AE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F6FF")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#0756AE")),
    ]))
    elements.append(table)
    doc.build(elements)
    stream.seek(0)
    filename = f"monitor-portal-{report_id}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.pdf"
    return StreamingResponse(stream, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})
