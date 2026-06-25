import httpx
import logging
from typing import Dict, Any, List, Optional
from app.config import config

logger = logging.getLogger(__name__)

class TrueNASClient:
    def __init__(self):
        self.port = 443  # Default HTTPS port

    @property
    def host(self) -> str:
        return config.truenas_host

    def _get_headers(self) -> Dict[str, str]:
        api_key = config.truenas_api_key
        if not api_key:
            raise ValueError("TrueNAS API key not configured.")
        return {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    async def _request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Any:
        headers = self._get_headers()
        
        # Self-signed certs are common on TrueNAS, so we disable verification for local deployments
        # TODO(security): Allow configuring SSL verification.
        transport = httpx.AsyncHTTPTransport(verify=False)
        
        async with httpx.AsyncClient(transport=transport, timeout=10.0) as client:
            url = f"https://{self.host}:{self.port}/api/v2.0{path}"
            try:
                logger.info(f"Connecting to TrueNAS on {self.host}...")
                if method.upper() == "GET":
                    response = await client.get(url, headers=headers)
                else:
                    response = await client.post(url, headers=headers, json=data)
                
                if response.status_code == 401:
                    raise ValueError("Unauthorized. Check your TrueNAS API Key.")
                
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Failed to connect to TrueNAS: {e}")
                raise RuntimeError(f"TrueNAS connection failed: {str(e)}")

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection by fetching system info."""
        try:
            info = await self._request("GET", "/system/info")
            return {
                "status": "connected",
                "version": info.get("version", "unknown"),
                "hostname": info.get("hostname", "unknown")
            }
        except Exception as e:
            return {"status": "disconnected", "error": str(e)}

    async def get_system_info(self) -> Dict[str, Any]:
        """Fetch system info including CPU load and memory metrics."""
        return await self._request("GET", "/system/info")

    async def get_pools(self) -> List[Dict[str, Any]]:
        """Fetch ZFS storage pools status."""
        return await self._request("GET", "/pool")

    async def get_disks(self) -> List[Dict[str, Any]]:
        """Fetch list of disks and health details."""
        return await self._request("GET", "/disk")

    async def get_datasets(self) -> List[Dict[str, Any]]:
        """Fetch list of datasets."""
        return await self._request("GET", "/pool/dataset")

    async def get_alerts(self) -> List[Dict[str, Any]]:
        """Fetch active system alerts (very important for SRE)."""
        return await self._request("GET", "/alert/list")

    async def get_interfaces(self) -> List[Dict[str, Any]]:
        """Fetch list of network interfaces configurations and states."""
        return await self._request("GET", "/interface")

    async def get_services(self) -> List[Dict[str, Any]]:
        """Fetch status of all system services (SMB, NFS, SMART, etc.)."""
        return await self._request("GET", "/service")

    async def toggle_service(self, service_name: str, action: str) -> Dict[str, Any]:
        """Start or stop a service."""
        valid_actions = ["start", "stop", "restart"]
        if action not in valid_actions:
            raise ValueError(f"Invalid service action: {action}. Must be one of {valid_actions}")
        
        # In TrueNAS v2 API, services are updated/controlled via endpoint
        # First we need to get the service ID or call /service/start or /service/stop
        return await self._request("POST", f"/service/{action}", {"service": service_name})

truenas_client = TrueNASClient()
