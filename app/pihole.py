import httpx
import logging
from typing import Dict, Any, Optional
from app.config import config

logger = logging.getLogger(__name__)

class PiHoleClient:
    def __init__(self):
        self.default_host = "pihole.local"
        self._sid: Optional[str] = None

    @property
    def host(self) -> str:
        return config.config_data.get("pihole_host", self.default_host)

    @property
    def api_key(self) -> str:
        # This will be the Pi-hole password or App Password
        return config.config_data.get("pihole_api_key", "")

    async def _authenticate(self, client: httpx.AsyncClient) -> str:
        """Fetch a new Session ID (SID) using the password/app-token."""
        url = f"http://{self.host}/api/auth"
        logger.info(f"Authenticating with Pi-hole on {self.host}...")
        try:
            response = await client.post(url, json={"password": self.api_key}, timeout=5.0)
            response.raise_for_status()
        except Exception as primary_error:
            logger.warning(f"Pi-hole auth JSON login failed, retrying with form data: {primary_error}")
            try:
                response = await client.post(url, data={"password": self.api_key}, timeout=5.0)
                response.raise_for_status()
            except Exception as fallback_error:
                logger.error(f"Failed to authenticate with Pi-hole: {fallback_error}")
                self._sid = None
                raise RuntimeError(f"Pi-hole authentication failed: {str(fallback_error)}")

        data = response.json()
        sid = data.get("session", {}).get("sid")
        if not sid:
            raise RuntimeError("Authentication succeeded but no SID was returned in payload")
        self._sid = sid
        return sid

    async def _request(self, method: str, path: str, json_data: Any = None, retries: int = 1) -> Any:
        url = f"http://{self.host}{path}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            # If we don't have a SID yet, get one
            if not self._sid:
                await self._authenticate(client)

            headers = {"sid": self._sid}
            try:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                else:
                    response = await client.post(url, headers=headers, json=json_data)

                # If unauthorized, try logging in again once
                if response.status_code == 401 and retries > 0:
                    logger.info("Pi-hole SID expired or invalid. Re-authenticating...")
                    await self._authenticate(client)
                    headers["sid"] = self._sid
                    if method == "GET":
                        response = await client.get(url, headers=headers)
                    else:
                        response = await client.post(url, headers=headers, json=json_data)

                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.warning(f"Pi-hole request {method} {path} failed: {e}")
                raise RuntimeError(f"Pi-hole communication error: {str(e)}")

    async def test_connection(self) -> Dict[str, Any]:
        """Verify connection using cached session or re-authenticate if missing/invalid."""
        if not self.api_key:
            return {"status": "unconfigured", "error": "No password configured"}
        try:
            await self.get_blocking_status()
            return {"status": "connected"}
        except Exception as e:
            return {"status": "disconnected", "error": str(e)}

    async def get_summary(self) -> Dict[str, Any]:
        """Fetch general stats summary."""
        return await self._request("GET", "/api/stats/summary")

    async def get_blocking_status(self) -> Dict[str, Any]:
        """Check if DNS ad-blocking is enabled/disabled."""
        return await self._request("GET", "/api/dns/blocking")

    async def set_blocking(self, enabled: bool, timer_seconds: Optional[int] = None) -> Dict[str, Any]:
        """Enable or disable DNS blocking (optionally with a temporary timer)."""
        payload = {"blocking": enabled}
        if not enabled and timer_seconds:
            payload["timer"] = timer_seconds
        return await self._request("POST", "/api/dns/blocking", json_data=payload)

pihole_client = PiHoleClient()
