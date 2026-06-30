import logging
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.config import config
from app.proxmox import proxmox_client
from app.truenas import truenas_client
from app.google_wifi import google_wifi_client, traffic_logger
from app.pihole import pihole_client
from app.switch import switch_client
from app.claude import run_chat_agent

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Homelab AI SRE Dashboard")

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class ConfigUpdateRequest(BaseModel):
    proxmox_token_id: Optional[str] = None
    proxmox_token_secret: Optional[str] = None
    truenas_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ollama_url: Optional[str] = None
    selected_provider: Optional[str] = None
    proxmox_hosts: Optional[str] = None
    truenas_host: Optional[str] = None
    google_wifi_ip: Optional[str] = None
    pihole_host: Optional[str] = None
    pihole_api_key: Optional[str] = None
    switch_host: Optional[str] = None
    switch_community: Optional[str] = None
    switch_port: Optional[int] = None
    modules: Optional[Dict[str, bool]] = None

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]

@app.get("/api/config")
async def get_config_status():
    """Retrieve setup configuration state without exposing secrets."""
    return {
        "is_configured": config.is_configured(),
        "has_claude_key": bool(config.anthropic_api_key),
        "has_openai_key": bool(config.openai_api_key),
        "has_gemini_key": bool(config.gemini_api_key),
        "has_ollama_url": bool(config.ollama_url),
        "selected_provider": config.selected_provider,
        "ollama_url": config.ollama_url,
        "has_proxmox_config": bool(config.proxmox_token_id and config.proxmox_token_secret),
        "has_truenas_config": bool(config.truenas_api_key),
        "proxmox_hosts": ",".join(config.proxmox_hosts),
        "proxmox_token_id": config.proxmox_token_id,
        "truenas_host": config.truenas_host,
        "google_wifi_ip": config.google_wifi_ip,
        "pihole_host": config.pihole_host,
        "switch_host": config.switch_host,
        "switch_community": config.switch_community,
        "switch_port": config.switch_port,
        "modules": config.active_modules,
        # Don't return secrets
        "proxmox_token_secret_set": bool(config.proxmox_token_secret),
        "truenas_api_key_set": bool(config.truenas_api_key),
        "pihole_api_key_set": bool(config.pihole_api_key)
    }

@app.post("/api/config")
async def update_config(data: ConfigUpdateRequest):
    """Update API credentials."""
    update_dict = {}
    if data.proxmox_token_id is not None:
        update_dict["proxmox_token_id"] = data.proxmox_token_id
    if data.proxmox_token_secret is not None:
        update_dict["proxmox_token_secret"] = data.proxmox_token_secret
    if data.truenas_api_key is not None:
        update_dict["truenas_api_key"] = data.truenas_api_key
    if data.anthropic_api_key is not None:
        update_dict["anthropic_api_key"] = data.anthropic_api_key
    if data.openai_api_key is not None:
        update_dict["openai_api_key"] = data.openai_api_key
    if data.gemini_api_key is not None:
        update_dict["gemini_api_key"] = data.gemini_api_key
    if data.ollama_url is not None:
        update_dict["ollama_url"] = data.ollama_url
    if data.selected_provider is not None:
        update_dict["selected_provider"] = data.selected_provider
    if data.proxmox_hosts is not None:
        update_dict["proxmox_hosts"] = [h.strip() for h in data.proxmox_hosts.split(",") if h.strip()]
    if data.truenas_host is not None:
        update_dict["truenas_host"] = data.truenas_host
    if data.google_wifi_ip is not None:
        update_dict["google_wifi_ip"] = data.google_wifi_ip
    if data.pihole_host is not None:
        update_dict["pihole_host"] = data.pihole_host
    if data.pihole_api_key is not None:
        update_dict["pihole_api_key"] = data.pihole_api_key
    if data.switch_host is not None:
        update_dict["switch_host"] = data.switch_host
    if data.switch_community is not None:
        update_dict["switch_community"] = data.switch_community
    if data.switch_port is not None:
        update_dict["switch_port"] = data.switch_port
    if data.modules is not None:
        existing_modules = config.config_data.get("modules", {})
        existing_modules.update(data.modules)
        update_dict["modules"] = existing_modules
        
    config.update(update_dict)
    return {"status": "success", "is_configured": config.is_configured()}

@app.get("/api/status")
async def get_connection_status():
    """Verify live connectivity to enabled Proxmox, TrueNAS, Google Wifi, and Pi-hole APIs."""
    active = config.active_modules
    
    pve_status = await proxmox_client.test_connection() if active.get("proxmox") else {"status": "disabled"}
    nas_status = await truenas_client.test_connection() if active.get("truenas") else {"status": "disabled"}
    wifi_status = await google_wifi_client.test_connection() if active.get("google_wifi") else {"status": "disabled"}
    pihole_status = await pihole_client.test_connection() if active.get("pihole") else {"status": "disabled"}
    switch_status = await switch_client.test_connection() if active.get("switch") else {"status": "disabled"}
    
    return {
        "claude": {
            "status": "configured" if config.anthropic_api_key else "missing"
        },
        "proxmox": pve_status,
        "truenas": nas_status,
        "google_wifi": wifi_status,
        "pihole": pihole_status,
        "switch": switch_status
    }

@app.get("/api/summary")
async def get_system_summary():
    """Aggregate health and utilization details across the homelab infrastructure concurrently."""
    if not config.is_configured():
        raise HTTPException(status_code=400, detail="Application is not fully configured.")
        
    active = config.active_modules
    
    summary = {
        "modules": active,
        "proxmox": {"nodes": [], "vm_count": 0, "status": "unknown"},
        "truenas": {"pools": [], "alerts": [], "disk_count": 0, "cpu_load": 0, "mem_gb": 0, "interfaces": [], "status": "unknown"},
        "google_wifi": {"status": "unknown"},
        "pihole": {"status": "unknown"},
        "switch": {"status": "unknown"}
    }
    
    tasks = []
    
    # 1. Proxmox Task
    if active.get("proxmox"):
        async def fetch_proxmox():
            try:
                resources = await proxmox_client.get_cluster_resources()
                nodes = [r for r in resources if r.get("type") == "node"]
                vms = [r for r in resources if r.get("type") == "qemu" or r.get("type") == "lxc"]
                
                nodes_data = []
                for n in nodes:
                    node_name = n.get("node")
                    node_vms = []
                    for vm in vms:
                        if vm.get("node") == node_name:
                            node_vms.append({
                                "vmid": vm.get("vmid"),
                                "name": vm.get("name"),
                                "status": vm.get("status"),
                                "type": vm.get("type"),
                                "cpu": round(vm.get("cpu", 0) * 100, 1),
                                "mem": round((vm.get("mem", 0) / vm.get("maxmem", 1)) * 100, 1) if vm.get("maxmem") else 0
                            })
                    nodes_data.append({
                        "name": node_name,
                        "status": "online" if n.get("status") == "online" else "offline",
                        "cpu": round(n.get("cpu", 0) * 100, 1),
                        "mem": round((n.get("mem", 0) / n.get("maxmem", 1)) * 100, 1) if n.get("maxmem") else 0,
                        "vms": node_vms
                    })
                return {
                    "status": "online",
                    "vm_count": len(vms),
                    "nodes": nodes_data
                }
            except Exception as e:
                logger.error(f"Failed to fetch Proxmox summary: {e}")
                return {"nodes": [], "vm_count": 0, "status": f"offline: {str(e)}"}
        tasks.append(("proxmox", fetch_proxmox()))
    else:
        summary["proxmox"] = {"nodes": [], "vm_count": 0, "status": "disabled"}
        
    # 2. TrueNAS Task
    if active.get("truenas"):
        async def fetch_truenas():
            try:
                sub_tasks = [
                    truenas_client.get_pools(),
                    truenas_client.get_disks(),
                    truenas_client.get_datasets(),
                    truenas_client.get_system_info(),
                    truenas_client.get_interfaces()
                ]
                if active.get("alerts"):
                    sub_tasks.append(truenas_client.get_alerts())
                
                sub_results = await asyncio.gather(*sub_tasks)
                
                pools = sub_results[0]
                disks = sub_results[1]
                datasets = sub_results[2]
                sys_info = sub_results[3]
                interfaces = sub_results[4]
                alerts = sub_results[5] if active.get("alerts") else []
                
                loadavg = sys_info.get("loadavg", [0, 0, 0])
                cores = sys_info.get("cores", 1)
                cpu_load = round((loadavg[0] / (cores if cores > 0 else 1)) * 100, 1)
                mem_gb = round(sys_info.get("physmem", 0) / (1024**3), 1)
                
                alerts_data = []
                if active.get("alerts"):
                    alerts_data = [
                        {
                            "id": a.get("id"),
                            "level": a.get("level"),
                            "message": a.get("formatted"),
                            "datetime": a.get("datetime", {}).get("$date")
                        }
                        for a in alerts if a.get("dismissed") is False
                    ]
                
                interfaces_data = []
                for interface in interfaces:
                    name = interface.get("name")
                    state = interface.get("state", {})
                    link_state = state.get("link_state", "LINK_STATE_UNKNOWN")
                    
                    ip_address = "none"
                    aliases = state.get("aliases", [])
                    for alias in aliases:
                        if alias.get("type") == "INET":
                            ip_address = alias.get("address")
                            break
                    
                    interfaces_data.append({
                        "name": name,
                        "link_state": "UP" if link_state == "LINK_STATE_UP" else "DOWN",
                        "ip": ip_address
                    })
                
                def to_int(val):
                    try:
                        return int(val) if val is not None else 0
                    except (ValueError, TypeError):
                        return 0
                        
                def extract_bytes(field_val) -> int:
                    if isinstance(field_val, dict):
                        val = field_val.get("parsed") or field_val.get("rawvalue") or field_val.get("value", 0)
                        return to_int(val)
                    return to_int(field_val)
                
                pools_data = []
                for p in pools:
                    pool_name = p.get("name")
                    status = p.get("status", "UNKNOWN")
                    
                    matched_ds = None
                    for ds in datasets:
                        ds_name = ds.get("name") or ds.get("id") or ""
                        if ds_name == pool_name:
                            matched_ds = ds
                            break
                    
                    if not matched_ds:
                        for ds in datasets:
                            ds_name = ds.get("name") or ds.get("id") or ""
                            if ds_name.split("/")[0] == pool_name:
                                matched_ds = ds
                                break
                    
                    if matched_ds:
                        used_val = matched_ds.get("used") or matched_ds.get("properties", {}).get("used")
                        avail_val = matched_ds.get("available") or matched_ds.get("properties", {}).get("available")
                        allocated = extract_bytes(used_val)
                        free = extract_bytes(avail_val)
                        total = allocated + free
                    else:
                        properties = p.get("properties", {})
                        allocated = extract_bytes(properties.get("allocated"))
                        free = extract_bytes(properties.get("free"))
                        total = extract_bytes(properties.get("size"))
                        if total == 0:
                            total = allocated + free
                            
                    used_pct = round((allocated / total) * 100, 1) if total > 0 else 0
                    pools_data.append({
                        "name": pool_name,
                        "status": status,
                        "used_pct": used_pct,
                        "total_gb": round(total / (1024**3), 1) if total > 0 else 0
                    })
                
                return {
                    "status": "online",
                    "disk_count": len(disks),
                    "cpu_load": cpu_load,
                    "mem_gb": mem_gb,
                    "interfaces": interfaces_data,
                    "pools": pools_data,
                    "alerts": alerts_data
                }
            except Exception as e:
                logger.error(f"Failed to fetch TrueNAS summary: {e}")
                return {"pools": [], "alerts": [], "disk_count": 0, "cpu_load": 0, "mem_gb": 0, "interfaces": [], "status": f"offline: {str(e)}"}
        tasks.append(("truenas", fetch_truenas()))
    else:
        summary["truenas"] = {"pools": [], "alerts": [], "disk_count": 0, "cpu_load": 0, "mem_gb": 0, "interfaces": [], "status": "disabled"}
        
    # 3. Google Wifi Task
    if active.get("google_wifi"):
        async def fetch_wifi():
            try:
                wifi_status = await google_wifi_client.get_status()
                wan = wifi_status.get("wan", {})
                system = wifi_status.get("system", {})
                software = wifi_status.get("software", {})
                
                ssid = "unknown"
                try:
                    welcome = await google_wifi_client.get_welcome_mat()
                    ssid = welcome.get("ssid") or welcome.get("guestSsid") or "unknown"
                except Exception:
                    pass
                    
                devices_count = await google_wifi_client.get_connected_devices()
                
                return {
                    "status": "online",
                    "online": wan.get("online", False),
                    "wan_ip": wan.get("localIpAddress", "unknown"),
                    "ssid": ssid,
                    "uptime_hours": round(system.get("uptime", 0) / 3600, 1),
                    "version": software.get("softwareVersion", "unknown"),
                    "devices_count": devices_count,
                    "traffic_history": traffic_logger.get_latest_traffic()
                }
            except Exception as e:
                logger.error(f"Failed to fetch Google Wifi stats: {e}")
                return {"status": f"offline: {str(e)}"}
        tasks.append(("google_wifi", fetch_wifi()))
    else:
        summary["google_wifi"] = {"status": "disabled"}
        
    # 4. Pi-hole Task
    if active.get("pihole"):
        async def fetch_pihole():
            try:
                sub_tasks = [
                    pihole_client.get_summary(),
                    pihole_client.get_blocking_status()
                ]
                sub_results = await asyncio.gather(*sub_tasks)
                ph_summary = sub_results[0]
                ph_blocking = sub_results[1]
                
                return {
                    "status": "online",
                    "blocking_enabled": ph_blocking.get("blocking") is True,
                    "total_queries": ph_summary.get("queries", {}).get("total", 0) if isinstance(ph_summary.get("queries"), dict) else ph_summary.get("queries", 0),
                    "blocked_queries": ph_summary.get("queries", {}).get("blocked", 0) if isinstance(ph_summary.get("queries"), dict) else ph_summary.get("blocked", 0),
                    "blocked_pct": round(ph_summary.get("queries", {}).get("percent", 0.0), 1) if isinstance(ph_summary.get("queries"), dict) else round(ph_summary.get("percent", 0.0), 1),
                    "gravity_domains": ph_summary.get("gravity", {}).get("domains_being_blocked", 0) if isinstance(ph_summary.get("gravity"), dict) else ph_summary.get("gravity", 0)
                }
            except Exception as e:
                logger.error(f"Failed to fetch Pi-hole stats: {e}")
                return {"status": f"offline: {str(e)}"}
        tasks.append(("pihole", fetch_pihole()))
    # 5. Switch Task
    if active.get("switch"):
        async def fetch_switch():
            try:
                stats = await switch_client.get_switch_stats()
                return {
                    "status": "online",
                    "name": stats.get("name", "unknown"),
                    "uptime_hours": stats.get("uptime_hours", 0.0),
                    "description": stats.get("description", "unknown"),
                    "cpu_load": stats.get("cpu_load", 0),
                    "mem_pct": stats.get("mem_pct", 0),
                    "ports": stats.get("ports", [])
                }
            except Exception as e:
                logger.error(f"Failed to fetch Switch stats: {e}")
                return {"status": f"offline: {str(e)}"}
        tasks.append(("switch", fetch_switch()))
    else:
        summary["switch"] = {"status": "disabled"}

    # Execute all active module tasks concurrently
    if tasks:
        keys = [t[0] for t in tasks]
        coroutines = [t[1] for t in tasks]
        results = await asyncio.gather(*coroutines)
        for key, res in zip(keys, results):
            summary[key] = res
            
    return summary

class PiHoleToggleRequest(BaseModel):
    enabled: bool
    timer: Optional[int] = None

@app.post("/api/pihole/toggle")
async def toggle_pihole_blocking(data: PiHoleToggleRequest):
    """Enable or disable Pi-hole DNS blocking."""
    if not config.is_configured():
        raise HTTPException(status_code=400, detail="Application is not fully configured.")
    try:
        res = await pihole_client.set_blocking(data.enabled, data.timer)
        return {"status": "success", "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Submit a question or command to the AI SRE agent."""
    if not config.is_configured():
        raise HTTPException(status_code=400, detail="Application is not configured yet. Configure credentials first.")
    
    result = await run_chat_agent(request.messages)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

# Mount the static files directory at the root /
app.mount("/", StaticFiles(directory="static", html=True), name="static")
