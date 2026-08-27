from typing import Any

import httpx
from fastapi import HTTPException


def _normalize_api_url(api_url: str) -> str:
    return api_url.rstrip("/")


async def test_datadog_credentials(api_url: str, api_key: str, app_key: str) -> dict[str, Any]:
    """Valida API key e APP key executando uma chamada leve na API de monitores."""
    base_url = _normalize_api_url(api_url)
    headers = {
        "DD-API-KEY": api_key,
        "DD-APPLICATION-KEY": app_key,
        "Accept": "application/json",
    }
    url = f"{base_url}/api/v1/monitor/search"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params={"query": "", "per_page": 1, "page": 0})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao conectar na API Datadog: {exc}") from exc

    if response.status_code in (401, 403):
        raise HTTPException(status_code=400, detail="Credenciais Datadog inválidas ou sem permissão para consultar monitores.")
    if response.status_code >= 400:
        detail = response.text[:500]
        raise HTTPException(status_code=400, detail=f"Erro ao validar Datadog ({response.status_code}): {detail}")

    body = response.json() if response.content else {}
    return {
        "status": "ok",
        "api_url": base_url,
        "monitors_total": body.get("metadata", {}).get("total_count"),
    }
