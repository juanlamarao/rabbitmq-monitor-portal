from typing import Any


def normalize_queue(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": raw.get("name"),
        "vhost": raw.get("vhost", "/"),
        "type": raw.get("type"),
        "durable": raw.get("durable"),
        "auto_delete": raw.get("auto_delete"),
        "exclusive": raw.get("exclusive"),
        "state": raw.get("state"),
        "api_raw": raw,
    }
