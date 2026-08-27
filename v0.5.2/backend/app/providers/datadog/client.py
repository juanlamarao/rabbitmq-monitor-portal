from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException


def _normalize_api_url(api_url: str) -> str:
    return api_url.rstrip("/")


def _build_headers(api_key: str, app_key: str) -> dict[str, str]:
    return {
        "DD-API-KEY": api_key,
        "DD-APPLICATION-KEY": app_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def test_datadog_credentials(api_url: str, api_key: str, app_key: str) -> dict[str, Any]:
    """Valida API key e APP key executando uma chamada leve na API de monitores."""
    base_url = _normalize_api_url(api_url)
    headers = _build_headers(api_key, app_key)
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


class DatadogApiError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class DatadogMonitorClient:
    """Cliente mínimo para criar/atualizar monitores Datadog v1.

    O portal mantém o banco como fonte da verdade. Este cliente apenas aplica o
    estado desejado já persistido em generated_monitors.
    """

    def __init__(self, *, api_url: str, api_key: str, app_key: str, org_url: str | None = None, timeout: float = 20.0):
        self.api_url = _normalize_api_url(api_url)
        self.org_url = org_url.rstrip("/") if org_url else None
        self.headers = _build_headers(api_key, app_key)
        self.timeout = timeout

    def _request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.api_url}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(method, url, headers=self.headers, json=json_body)
        except httpx.RequestError as exc:
            raise DatadogApiError(0, f"Falha ao conectar na API Datadog: {exc}") from exc

        if response.status_code in (401, 403):
            raise DatadogApiError(response.status_code, "Credenciais Datadog inválidas ou sem permissão para gerenciar monitores.")
        if response.status_code >= 400:
            detail = response.text[:1000]
            raise DatadogApiError(response.status_code, f"Erro Datadog {response.status_code}: {detail}")
        return response.json() if response.content else {}

    @staticmethod
    def build_monitor_payload(
        *,
        name: str,
        monitor_type: str,
        query: str,
        message: str,
        tags: list[str] | None = None,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": name,
            "type": monitor_type,
            "query": query,
            "message": message,
            "tags": tags or [],
        }
        if options is not None:
            payload["options"] = options
        return payload

    def create_monitor(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/v1/monitor", json_body=payload)

    def update_monitor(self, monitor_id: str | int, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("PUT", f"/api/v1/monitor/{monitor_id}", json_body=payload)

    def get_monitor(self, monitor_id: str | int) -> dict[str, Any]:
        return self._request("GET", f"/api/v1/monitor/{monitor_id}")

    def monitor_url(self, monitor_id: str | int) -> str:
        if self.org_url:
            return f"{self.org_url}/monitors/{monitor_id}"
        if "api." in self.api_url:
            return f"{self.api_url.replace('api.', 'app.', 1)}/monitors/{monitor_id}"
        return f"{self.api_url}/monitors/{monitor_id}"
