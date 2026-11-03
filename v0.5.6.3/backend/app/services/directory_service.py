import json
import secrets
from datetime import datetime, timezone
from typing import TypedDict

from app.core.redis import redis_client
from app.providers.ldap.client import LDAPDirectoryClient

DIRECTORY_PEOPLE_CACHE_KEY = "directory:people"
DIRECTORY_PEOPLE_REFRESHED_AT_KEY = "directory:people:refreshed_at"


class DirectoryPerson(TypedDict):
    account_name: str
    first_name: str
    last_name: str
    full_name: str
    email: str


def refresh_directory_cache() -> dict:
    # Prevent simultaneous startup/CronJob/scheduler refreshes across multiple replicas.
    lock_key='directory:refresh_lock'
    owner=secrets.token_urlsafe(20)
    if not redis_client.set(lock_key,owner,ex=600,nx=True):
        return {"status":"already_running", "count": len(get_cached_people())}
    try:
        people = LDAPDirectoryClient().list_people()
        # Atomic replacement of data: failed LDAP query must never empty the old cache.
        refreshed_at = datetime.now(timezone.utc).isoformat()
        pipe=redis_client.pipeline()
        pipe.set(DIRECTORY_PEOPLE_CACHE_KEY, json.dumps(people,ensure_ascii=False))
        pipe.set(DIRECTORY_PEOPLE_REFRESHED_AT_KEY, refreshed_at)
        pipe.execute()
        return {"status": "ok", "count": len(people), "refreshed_at": refreshed_at}
    finally:
        redis_client.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock_key,owner)


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
        haystack = f"{person.get('email', '')} {person.get('full_name', '')} {person.get('account_name', '')}".casefold()
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
