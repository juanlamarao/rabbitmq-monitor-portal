import json
from datetime import datetime, timezone
from typing import TypedDict

from app.core.redis import redis_client
from app.providers.ldap.client import LDAPDirectoryClient

DIRECTORY_PEOPLE_CACHE_KEY = "directory:people"
DIRECTORY_PEOPLE_REFRESHED_AT_KEY = "directory:people:refreshed_at"


class DirectoryPerson(TypedDict):
    first_name: str
    last_name: str
    full_name: str
    email: str


def refresh_directory_cache() -> dict:
    people = LDAPDirectoryClient().list_people()
    redis_client.set(DIRECTORY_PEOPLE_CACHE_KEY, json.dumps(people, ensure_ascii=False))
    refreshed_at = datetime.now(timezone.utc).isoformat()
    redis_client.set(DIRECTORY_PEOPLE_REFRESHED_AT_KEY, refreshed_at)
    return {"status": "ok", "count": len(people), "refreshed_at": refreshed_at}


def get_cached_people() -> list[DirectoryPerson]:
    raw = redis_client.get(DIRECTORY_PEOPLE_CACHE_KEY)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict) and item.get("email")]


def search_cached_people(query: str, limit: int = 5) -> list[DirectoryPerson]:
    q = query.strip().lower()
    if not q:
        return []
    matches: list[DirectoryPerson] = []
    for person in get_cached_people():
        haystack = f"{person.get('email', '')} {person.get('full_name', '')}".lower()
        if q in haystack:
            matches.append(person)
        if len(matches) >= limit:
            break
    return matches


def directory_cache_status() -> dict:
    return {
        "people_count": len(get_cached_people()),
        "refreshed_at": redis_client.get(DIRECTORY_PEOPLE_REFRESHED_AT_KEY),
    }
