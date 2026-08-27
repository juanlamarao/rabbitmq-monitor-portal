import httpx


class RabbitMQClient:
    def __init__(self, base_url: str, username: str, password: str, timeout: float = 30):
        self.base_url = base_url.rstrip("/")
        self.auth = (username, password)
        self.timeout = timeout

    async def get_overview(self) -> dict:
        async with httpx.AsyncClient(auth=self.auth, timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/overview")
            response.raise_for_status()
            return response.json()

    async def list_queues(self) -> list[dict]:
        async with httpx.AsyncClient(auth=self.auth, timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/queues/",
                params={"enable_queue_totals": "true", "disable_stats": "true"},
            )
            response.raise_for_status()
            return response.json()
