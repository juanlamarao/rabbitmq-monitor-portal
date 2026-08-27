from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.public_reference import PublicQueueReferenceRead
from app.services.public_reference_service import get_public_queue_reference

router = APIRouter()


@router.get("/queue-reference", response_model=PublicQueueReferenceRead)
def route_public_queue_reference(
    rabbitmq_cluster: str = Query(min_length=1),
    vhost: str = Query(min_length=1),
    queue: str = Query(min_length=1),
    db: Session = Depends(get_db),
):
    return get_public_queue_reference(db, rabbitmq_cluster=rabbitmq_cluster, vhost=vhost, queue=queue)
