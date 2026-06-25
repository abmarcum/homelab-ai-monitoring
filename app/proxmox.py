import httpx
import logging
from typing import Dict, Any, List, Optional
from app.config import config

logger = logging.getLogger(__name__)

class ProxmoxClient:
    def __init__(self):
        # API is served on port 8006
        self.port = 8006

    @property
    def nodes(self) -> List[str]:
        return config.proxmox_hosts

    def _get_headers(self) -> Dict[str, str]:
        token_id = config.proxmox_token_id
        token_secret = config.proxmox_token_secret
        if not token_id or not token_secret:
            raise ValueError("Proxmox API credentials not fully configured.")
        return {
            "Authorization": f"PVEAPIToken={token_id}={token_secret}",
            "Accept": "application/json"
        }

    async def _request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Any:
        # Try hosts sequentially (failover)
        errors = []
        headers = self._get_headers()
        
        # Self-signed certs are standard on Proxmox, so we disable verification but log it
        # TODO(security): Allow configuring SSL verification.
        transport = httpx.AsyncHTTPTransport(verify=False)
        
        async with httpx.AsyncClient(transport=transport, timeout=10.0) as client:
            for host in self.nodes:
                url = f"https://{host}:{self.port}/api2/json{path}"
                try:
                    logger.info(f"Connecting to Proxmox on {host}...")
                    if method.upper() == "GET":
                        response = await client.get(url, headers=headers)
                    else:
                        response = await client.post(url, headers=headers, json=data)
                    
                    if response.status_code == 401:
                        raise ValueError("Unauthorized. Check Proxmox Token ID or Token Secret.")
                    
                    response.raise_for_status()
                    return response.json().get("data")
                except Exception as e:
                    logger.warning(f"Failed to connect to Proxmox host {host}: {e}")
                    errors.append(f"{host}: {str(e)}")
            
            raise RuntimeError(f"Could not connect to any Proxmox cluster nodes. Details: {', '.join(errors)}")

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to the cluster by fetching the version of the active node."""
        try:
            version_info = await self._request("GET", "/version")
            return {"status": "connected", "version": version_info.get("version", "unknown")}
        except Exception as e:
            return {"status": "disconnected", "error": str(e)}

    async def get_cluster_resources(self) -> List[Dict[str, Any]]:
        """Fetch all resources (nodes, vms, lxc, storage) in the cluster."""
        return await self._request("GET", "/cluster/resources")

    async def get_cluster_status(self) -> List[Dict[str, Any]]:
        """Fetch cluster status summary."""
        return await self._request("GET", "/cluster/status")

    async def get_node_status(self, node: str) -> Dict[str, Any]:
        """Fetch health details (CPU, RAM, load, etc.) for a specific node."""
        return await self._request("GET", f"/nodes/{node}/status")

    async def get_node_rrddata(self, node: str, timeframe: str = "hour") -> List[Dict[str, Any]]:
        """Fetch historical performance data for a specific node."""
        return await self._request("GET", f"/nodes/{node}/rrddata?timeframe={timeframe}")

    async def get_vm_config(self, node: str, vmid: int) -> Dict[str, Any]:
        """Fetch configuration details for a VM."""
        return await self._request("GET", f"/nodes/{node}/qemu/{vmid}/config")

    async def get_vm_status(self, node: str, vmid: int) -> Dict[str, Any]:
        """Fetch current status (running, stopped, cpu, mem) for a VM."""
        return await self._request("GET", f"/nodes/{node}/qemu/{vmid}/status/current")

    async def control_vm(self, node: str, vmid: int, action: str) -> str:
        """Start, stop, reboot, or suspend a VM.
        action can be: start, stop, shutdown, reboot, suspend, resume
        """
        valid_actions = ["start", "stop", "shutdown", "reboot", "suspend", "resume"]
        if action not in valid_actions:
            raise ValueError(f"Invalid VM action: {action}. Must be one of {valid_actions}")
        
        # Returns task ID (UPID)
        upid = await self._request("POST", f"/nodes/{node}/qemu/{vmid}/status/{action}")
        return upid

proxmox_client = ProxmoxClient()
