from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.bulk_actions import QueueBulkActionRequest, QueueBulkApplyRead, QueueBulkPreviewRead, QueueBulkPreviewRequest
from app.schemas.component import QueueRead, QueueUpdate
from app.schemas.monitor_template import QueueMonitorTemplateCreate, QueueMonitorTemplateRead, QueueMonitorTemplateUpdate
from app.services.bulk_action_service import apply_bulk_action, preview_bulk_queues
from app.services.component_service import list_queues, update_queue
from app.services.template_service import (
    add_queue_template_binding,
    delete_queue_template_binding,
    list_queue_template_bindings,
    update_queue_template_binding,
)

router = APIRouter()


@router.get("/queues", response_model=list[QueueRead])
def route_list_queues(
    cluster_id: int | None = None,
    include_removed: bool = False,
    removed_only: bool = False,
    search: str | None = Query(default=None, max_length=255),
    template_id: int | None = None,
    customized_only: bool = False,
    db: Session = Depends(get_db),
):
    return list_queues(
        db,
        cluster_id=cluster_id,
        include_removed=include_removed,
        removed_only=removed_only,
        search=search,
        template_id=template_id,
        customized_only=customized_only,
    )


@router.post("/queues/bulk/preview", response_model=QueueBulkPreviewRead)
def route_preview_bulk_queues(payload: QueueBulkPreviewRequest, db: Session = Depends(get_db)):
    return preview_bulk_queues(db, payload.filters)


@router.post("/queues/bulk/apply", response_model=QueueBulkApplyRead)
def route_apply_bulk_queues(payload: QueueBulkActionRequest, db: Session = Depends(get_db)):
    return apply_bulk_action(db, payload)


@router.put("/queues/{queue_id}", response_model=QueueRead)
def route_update_queue(queue_id: int, payload: QueueUpdate, db: Session = Depends(get_db)):
    return update_queue(db, queue_id, payload)


@router.get("/queues/{queue_id}/templates", response_model=list[QueueMonitorTemplateRead])
def route_list_queue_templates(queue_id: int, db: Session = Depends(get_db)):
    return list_queue_template_bindings(db, queue_id)


@router.post("/queues/{queue_id}/templates", response_model=QueueMonitorTemplateRead, status_code=status.HTTP_201_CREATED)
def route_add_queue_template(queue_id: int, payload: QueueMonitorTemplateCreate, db: Session = Depends(get_db)):
    return add_queue_template_binding(db, queue_id, payload)


@router.put("/queues/{queue_id}/templates/{binding_id}", response_model=QueueMonitorTemplateRead)
def route_update_queue_template(queue_id: int, binding_id: int, payload: QueueMonitorTemplateUpdate, db: Session = Depends(get_db)):
    return update_queue_template_binding(db, queue_id, binding_id, payload)


@router.delete("/queues/{queue_id}/templates/{binding_id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete_queue_template(queue_id: int, binding_id: int, db: Session = Depends(get_db)):
    delete_queue_template_binding(db, queue_id, binding_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
