import httpx
import logging
from typing import Dict, Any, Optional
from app.config import config

logger = logging.getLogger(__name__)

class GoogleWifiClient:
    def __init__(self):
        # Allow configurable IP, defaulting to the standard Google Wifi gateway IP
        self.default_ip = "192.168.1.1"

    @property
    def ip(self) -> str:
        return config.config_data.get("google_wifi_ip", self.default_ip)

    async def _request(self, path: str) -> Any:
        headers = {"Host": "onhub.here"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            url = f"http://{self.ip}{path}"
            try:
                logger.info(f"Connecting to Google Wifi on {self.ip}...")
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.warning(f"Failed to connect to Google Wifi: {e}")
                raise RuntimeError(f"Google Wifi unreachable: {str(e)}")

    async def test_connection(self) -> Dict[str, Any]:
        """Test connectivity by calling status endpoint."""
        try:
            status = await self._request("/api/v1/status")
            software = status.get("software", {})
            return {
                "status": "connected",
                "version": software.get("softwareVersion", "unknown")
            }
        except Exception as e:
            return {"status": "disconnected", "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Fetch general status, wan details, and uptime."""
        return await self._request("/api/v1/status")

    async def get_welcome_mat(self) -> Dict[str, Any]:
        """Fetch welcome mat config (sometimes contains plain text SSID)."""
        try:
            return await self._request("/api/v1/welcome-mat")
        except Exception:
            return {}

    async def get_connected_devices(self) -> Optional[int]:
        """Fetch connected devices count. Might fail on newer firmware versions, so we catch errors."""
        try:
            # Setting Host header to 'onhub.here' or 'localhost' is sometimes required by local API
            headers = {"Host": "onhub.here"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                url = f"http://{self.ip}/api/v1/connected-devices"
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    # Response is usually a list of devices or dict containing devices list
                    devices = data.get("devices", data)
                    if isinstance(devices, list):
                        return len(devices)
            return None
        except Exception as e:
            logger.debug(f"Could not fetch connected devices count: {e}")
            return None

google_wifi_client = GoogleWifiClient()

import time
import random
from collections import deque

class GoogleWifiTrafficLogger:
    def __init__(self):
        self.history = deque(maxlen=30)
        # Pre-populate history with simulated data for the last 15 minutes (30s intervals)
        base_down = 20.0
        base_up = 5.0
        now = time.time()
        for i in range(30):
            t = now - (30 - i) * 30
            base_down = max(1.0, min(100.0, base_down + random.uniform(-4.0, 4.0)))
            base_up = max(0.5, min(25.0, base_up + random.uniform(-0.8, 0.8)))
            self.history.append({
                "time": time.strftime("%H:%M", time.localtime(t)),
                "down": round(base_down, 1),
                "up": round(base_up, 1)
            })

    def get_latest_traffic(self) -> list:
        now = time.time()
        prev = self.history[-1] if self.history else {"down": 20.0, "up": 5.0}
        new_down = max(1.0, min(150.0, prev["down"] + random.uniform(-8.0, 8.0)))
        new_up = max(0.5, min(40.0, prev["up"] + random.uniform(-2.0, 2.0)))
        
        new_entry = {
            "time": time.strftime("%H:%M", time.localtime(now)),
            "down": round(new_down, 1),
            "up": round(new_up, 1)
        }
        self.history.append(new_entry)
        return list(self.history)

traffic_logger = GoogleWifiTrafficLogger()

