from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.cluster import ClusterCreate, ClusterRead, ClusterUpdate, DiscoveryResult
from app.services.cluster_service import (
    create_cluster,
    discover_queues,
    get_cluster,
    list_clusters,
    test_cluster_connection,
    update_cluster,
)

router = APIRouter()


@router.get("", response_model=list[ClusterRead])
def route_list_clusters(db: Session = Depends(get_db)):
    return list_clusters(db)


@router.post("", response_model=ClusterRead, status_code=201)
async def route_create_cluster(payload: ClusterCreate, db: Session = Depends(get_db)):
    return await create_cluster(db, payload)


@router.get("/{cluster_id}", response_model=ClusterRead)
def route_get_cluster(cluster_id: int, db: Session = Depends(get_db)):
    return get_cluster(db, cluster_id)


@router.put("/{cluster_id}", response_model=ClusterRead)
async def route_update_cluster(cluster_id: int, payload: ClusterUpdate, db: Session = Depends(get_db)):
    return await update_cluster(db, cluster_id, payload)


@router.post("/{cluster_id}/test-connection")
async def route_test_cluster_connection(cluster_id: int, db: Session = Depends(get_db)):
    return await test_cluster_connection(db, cluster_id)


@router.post("/{cluster_id}/discover-queues", response_model=DiscoveryResult)
async def route_discover_queues(cluster_id: int, db: Session = Depends(get_db)):
    return await discover_queues(db, cluster_id)
