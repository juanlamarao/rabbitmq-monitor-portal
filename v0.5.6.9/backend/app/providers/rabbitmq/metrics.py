"""RabbitMQ Prometheus plugin reader. Does not require Management API vhost rights.

Prometheus metrics are per node and may omit some objects. Never use this
source to declare a queue removed or discover queue properties unavailable
from the metrics endpoint (exclusive, auto_delete, durable, type, state).
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit
import httpx

# Queue metric labels vary slightly by RabbitMQ version; use the low-cost family.
LABELS = re.compile(r'([A-Za-z_][A-Za-z_0-9]*)="((?:\\.|[^"\\])*)"')
SAMPLE = re.compile(r'^rabbitmq_detailed_queue_[A-Za-z_0-9]+\{([^}]*)\}\s+[-+0-9.eE]+(?:\s|$)')


def parse_detailed_queues(body: str) -> list[dict]:
    found: dict[tuple[str, str], dict] = {}
    for line in body.splitlines():
        match = SAMPLE.match(line)
        if not match:
            continue
        labels = {}
        for key, raw in LABELS.findall(match.group(1)):
            labels[key] = raw.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
        name = labels.get('queue') or labels.get('queue_name')
        if not name:
            continue
        vhost = labels.get('vhost') or '/'
        found[(vhost, name)] = {'name': name, 'vhost': vhost,
                                'type': None, 'durable': None, 'auto_delete': None,
                                'exclusive': None, 'state': None, 'api_raw': None}
    return list(found.values())


class RabbitMQMetricsClient:
    def __init__(self, endpoints: list[str], username: str = '', password: str = '', timeout: float = 45):
        self.endpoints = endpoints
        self.auth = (username, password) if username else None
        self.timeout = timeout
        if not endpoints:
            raise ValueError('Nenhum endpoint Prometheus configurado.')
        for url in endpoints:
            parsed = urlsplit(url)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('Endpoint /metrics inválido (use http[s] e credenciais nos campos próprios).')

    async def discover_queues(self) -> list[dict]:
        merged: dict[tuple[str, str], dict] = {}
        async with httpx.AsyncClient(auth=self.auth, timeout=self.timeout, follow_redirects=False) as client:
            for endpoint in self.endpoints:
                url = endpoint.rstrip('/')
                if not url.endswith('/metrics/detailed'):
                    url = url + '/metrics/detailed' if not url.endswith('/metrics') else url[:-8] + '/metrics/detailed'
                response = await client.get(url, params=[('family', 'queue_coarse_metrics'), ('family', 'queue_delivery_metrics')])
                response.raise_for_status()
                if 'rabbitmq_detailed_' not in response.text:
                    raise ValueError(f'Endpoint {url} não retornou métricas detalhadas por queue. Verifique plugin e famílias.')
                for q in parse_detailed_queues(response.text):
                    merged[(q['vhost'], q['name'])] = q
        return list(merged.values())
