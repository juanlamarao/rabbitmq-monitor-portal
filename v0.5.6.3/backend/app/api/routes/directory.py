from fastapi import APIRouter, Query

from app.schemas.directory import DirectoryPersonRead
from app.services.directory_service import directory_cache_status, refresh_directory_cache, search_cached_people

router = APIRouter()


@router.get("/people", response_model=list[DirectoryPersonRead])
def search_people(query: str = Query(min_length=1, max_length=255), limit: int = Query(default=5, ge=1, le=20)):
    return search_cached_people(query, limit=limit)


@router.get("/cache-status")
def cache_status():
    return directory_cache_status()


@router.post("/refresh-cache")
def refresh_cache():
    return refresh_directory_cache()
