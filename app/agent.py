import json
import logging
from typing import List, Dict, Any
import httpx
from anthropic import AsyncAnthropic
from app.config import config
from app.proxmox import proxmox_client
from app.truenas import truenas_client
from app.google_wifi import google_wifi_client
from app.pihole import pihole_client
from app.switch import switch_client

logger = logging.getLogger(__name__)

# List of tools SRE Agent has access to
TOOLS = [
    {
        "name": "get_proxmox_cluster_status",
        "description": "Fetch the general status of the Proxmox cluster, including node health and active versions.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_proxmox_resources",
        "description": "Fetch a list of all resources (VMs, LXC containers, Storage, Nodes) across the Proxmox cluster.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_proxmox_node_status",
        "description": "Fetch CPU, memory, load, uptime, and kernel info for a specific Proxmox node.",
        "input_schema": {
            "type": "object",
            "properties": {
                "node": {
                    "type": "string",
                    "description": "The hostname of the node (e.g., 'pve-01' or 'pve-02')"
                }
            },
            "required": ["node"]
        }
    },
    {
        "name": "get_proxmox_vm_status",
        "description": "Fetch the current status (running/stopped, cpu, memory, uptime) of a Qemu Virtual Machine.",
        "input_schema": {
            "type": "object",
            "properties": {
                "node": {
                    "type": "string",
                    "description": "The node where the VM resides (e.g., 'pve-01')"
                },
                "vmid": {
                    "type": "integer",
                    "description": "The unique numerical ID of the VM (e.g., 100)"
                }
            },
            "required": ["node", "vmid"]
        }
    },
    {
        "name": "control_proxmox_vm",
        "description": "Start, stop, reboot, shutdown, suspend, or resume a specific VM.",
        "input_schema": {
            "type": "object",
            "properties": {
                "node": {
                    "type": "string",
                    "description": "The node where the VM resides"
                },
                "vmid": {
                    "type": "integer",
                    "description": "The VM ID"
                },
                "action": {
                    "type": "string",
                    "enum": ["start", "stop", "shutdown", "reboot", "suspend", "resume"],
                    "description": "The operation to perform"
                }
            },
            "required": ["node", "vmid", "action"]
        }
    },
    {
        "name": "get_truenas_pools",
        "description": "Fetch information about TrueNAS ZFS storage pools, including sizes, status (ONLINE, DEGRADED), and free space.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_truenas_disks",
        "description": "Fetch list of disks connected to the NAS and their model, size, serial, and health parameters.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_truenas_alerts",
        "description": "Fetch the list of active alerts, warnings, and errors currently triggered on the TrueNAS storage.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_truenas_services",
        "description": "Fetch status (running/stopped) of storage services like SMB, NFS, iSCSI, SMART, etc.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_google_wifi_status",
        "description": "Fetch status details (WAN IP, software version, uptime) from the Google Wifi router.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_google_wifi_connected_devices",
        "description": "Fetch count of connected devices on the Google Wifi router.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_pihole_dns_stats",
        "description": "Fetch Pi-hole DNS metrics summary (queries, blocks, percentage).",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "toggle_pihole_blocking",
        "description": "Enable or disable ad-blocking DNS filter on the Pi-hole.",
        "input_schema": {
            "type": "object",
            "properties": {
                "enabled": {
                    "type": "boolean",
                    "description": "True to enable ad blocking, False to disable."
                },
                "timer": {
                    "type": "integer",
                    "description": "Optional duration in seconds to keep blocking disabled."
                }
            },
            "required": ["enabled"]
        }
    },
    {
        "name": "get_switch_status",
        "description": "Fetch Network Switch uptime, hostname, description, and SNMP statistics.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]

SYSTEM_PROMPT = """You are Homelab-SRE, an AI Site Reliability Engineer assistant running in a homelab environment.
You monitor and manage a Proxmox VE cluster (pve-01.local and pve-02.local), a TrueNAS storage server (nas.local), a Google Wifi network router, and a Pi-hole DNS server.
You have access to live APIs of these systems via the provided tools.

Your responsibilities:
1. Help the user diagnose issues, check node resources, verify pool health, and manage virtual machines.
2. Provide details about active warnings or alerts on the systems.
3. Keep explanation brief, clear, and action-oriented. Use Markdown tables to display tabular data where applicable.
4. When asked to check the system, proactively inspect BOTH Proxmox (cluster status, resources) and TrueNAS (pools, active alerts) to give a comprehensive overview.
5. If the user asks you to perform a command (like rebooting or starting/stopping a VM), execute the tool and report the result.

Important Rules:
- If a tool fails (e.g. timeout or auth error), explain the error to the user and suggest checking credentials.
- When referencing VM IDs, always include the node name they are on.
- Do NOT make assumptions about system state; always call the appropriate tool to fetch fresh status if needed.
"""

async def execute_tool(name: str, arguments: Dict[str, Any]) -> Any:
    """Execute local SRE tools based on LLM tool call requests."""
    logger.info(f"Executing tool {name} with args: {arguments}")
    try:
        if name == "get_proxmox_cluster_status":
            return await proxmox_client.get_cluster_status()
        elif name == "get_proxmox_resources":
            return await proxmox_client.get_cluster_resources()
        elif name == "get_proxmox_node_status":
            return await proxmox_client.get_node_status(arguments["node"])
        elif name == "get_proxmox_vm_status":
            return await proxmox_client.get_vm_status(arguments["node"], arguments["vmid"])
        elif name == "control_proxmox_vm":
            return await proxmox_client.control_vm(
                arguments["node"], arguments["vmid"], arguments["action"]
            )
        elif name == "get_truenas_pools":
            return await truenas_client.get_pools()
        elif name == "get_truenas_disks":
            return await truenas_client.get_disks()
        elif name == "get_truenas_alerts":
            return await truenas_client.get_alerts()
        elif name == "get_truenas_services":
            return await truenas_client.get_services()
        elif name == "get_google_wifi_status":
            return await google_wifi_client.get_status()
        elif name == "get_google_wifi_connected_devices":
            return await google_wifi_client.get_connected_devices()
        elif name == "get_pihole_dns_stats":
            summary = await pihole_client.get_summary()
            blocking = await pihole_client.get_blocking_status()
            return {"summary": summary, "blocking": blocking}
        elif name == "toggle_pihole_blocking":
            return await pihole_client.set_blocking(
                arguments["enabled"], arguments.get("timer")
            )
        elif name == "get_switch_status":
            return await switch_client.get_switch_stats()
        else:
            raise ValueError(f"Unknown tool name: {name}")
    except Exception as e:
        logger.error(f"Error in tool execution: {e}")
        return {"error": str(e)}

async def run_claude_agent(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs the Claude agent conversation loop, executing tools as needed."""
    api_key = config.anthropic_api_key
    if not api_key:
        return {"error": "Claude API key is not configured. Please check environment variables or system settings."}

    client = AsyncAnthropic(api_key=api_key)
    
    formatted_messages = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")
        formatted_messages.append({"role": role, "content": content})

    for _ in range(5):
        try:
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=formatted_messages,
                tools=TOOLS
            )
        except Exception as e:
            logger.error(f"Error calling Anthropic API: {e}")
            return {"error": f"Anthropic API Error: {str(e)}"}

        assistant_content = []
        has_tool_use = False
        
        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                has_tool_use = True
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input
                })

        formatted_messages.append({
            "role": "assistant",
            "content": assistant_content
        })

        if not has_tool_use:
            text_response = "".join([b.text for b in response.content if b.type == "text"])
            return {"role": "assistant", "content": text_response, "history": formatted_messages}

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                tool_result_data = await execute_tool(block.name, block.input)
                tool_results.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(tool_result_data)
                        }
                    ]
                })

        for result in tool_results:
            formatted_messages.append(result)
            
    return {
        "role": "assistant",
        "content": "I apologize, but I reached my maximum reasoning steps without finishing. Please try again.",
        "history": formatted_messages
    }

async def run_openai_agent(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs the OpenAI agent conversation loop, executing tools as needed."""
    api_key = config.openai_api_key
    if not api_key:
        return {"error": "OpenAI API key is not configured. Please check environment variables or system settings."}

    openai_tools = []
    for tool in TOOLS:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"]
            }
        })

    openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")
        # Standard user/assistant mapping. OpenAI supports system messages too.
        openai_messages.append({"role": role, "content": content})

    async with httpx.AsyncClient(timeout=30.0) as client:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        for _ in range(5):
            payload = {
                "model": "gpt-4o-mini",
                "messages": openai_messages,
                "tools": openai_tools,
                "tool_choice": "auto"
            }
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                res_data = response.json()
            except Exception as e:
                logger.error(f"Error calling OpenAI API: {e}")
                return {"error": f"OpenAI API Error: {str(e)}"}

            choice = res_data.get("choices", [{}])[0]
            assistant_msg = choice.get("message", {})
            
            openai_messages.append(assistant_msg)
            
            tool_calls = assistant_msg.get("tool_calls")
            if not tool_calls:
                return {
                    "role": "assistant",
                    "content": assistant_msg.get("content") or "",
                    "history": messages + [{"role": "assistant", "content": assistant_msg.get("content") or ""}]
                }

            for tool_call in tool_calls:
                call_id = tool_call.get("id")
                func = tool_call.get("function", {})
                name = func.get("name")
                args_str = func.get("arguments", "{}")
                try:
                    args = json.loads(args_str)
                except Exception:
                    args = {}
                
                tool_res = await execute_tool(name, args)
                
                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": name,
                    "content": json.dumps(tool_res)
                })

        return {
            "role": "assistant",
            "content": "I apologize, but I reached my maximum reasoning steps without finishing. Please try again.",
            "history": messages
        }

async def run_gemini_agent(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs the Google Gemini agent conversation loop, executing tools as needed."""
    api_key = config.gemini_api_key
    if not api_key:
        return {"error": "Google Gemini API key is not configured. Please check environment variables or system settings."}

    gemini_tools = [{
        "functionDeclarations": [
            {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"]
            } for tool in TOOLS
        ]
    }]

    gemini_contents = []
    for msg in messages:
        role = "user" if msg.get("role") == "user" else "model"
        content = msg.get("content")
        gemini_contents.append({
            "role": role,
            "parts": [{"text": content}]
        })

    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        
        for _ in range(5):
            payload = {
                "contents": gemini_contents,
                "systemInstruction": {
                    "parts": [{"text": SYSTEM_PROMPT}]
                },
                "tools": gemini_tools
            }
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                res_data = response.json()
            except Exception as e:
                logger.error(f"Error calling Gemini API: {e}")
                return {"error": f"Gemini API Error: {str(e)}"}

            candidates = res_data.get("candidates", [])
            if not candidates:
                return {"error": "Gemini API returned no candidates or block warning."}
                
            candidate = candidates[0]
            content_msg = candidate.get("content", {})
            parts = content_msg.get("parts", [])
            
            has_function_calls = False
            model_parts = []
            function_calls = []
            
            for part in parts:
                if "text" in part:
                    model_parts.append({"text": part["text"]})
                elif "functionCall" in part:
                    has_function_calls = True
                    fn_call = part["functionCall"]
                    function_calls.append(fn_call)
                    model_parts.append({
                        "functionCall": {
                            "name": fn_call.get("name"),
                            "args": fn_call.get("args", {})
                        }
                    })

            gemini_contents.append({
                "role": "model",
                "parts": model_parts
            })

            if not has_function_calls:
                text_response = "".join([p.get("text", "") for p in model_parts if "text" in p])
                return {
                    "role": "assistant",
                    "content": text_response,
                    "history": messages + [{"role": "assistant", "content": text_response}]
                }

            tool_response_parts = []
            for fn in function_calls:
                name = fn.get("name")
                args = fn.get("args", {})
                
                tool_res = await execute_tool(name, args)
                tool_response_parts.append({
                    "functionResponse": {
                        "name": name,
                        "response": {"result": tool_res}
                    }
                })

            gemini_contents.append({
                "role": "user",
                "parts": tool_response_parts
            })

        return {
            "role": "assistant",
            "content": "I apologize, but I reached my maximum reasoning steps without finishing. Please try again.",
            "history": messages
        }

async def run_ollama_agent(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Runs the Ollama chat loop against a local Ollama server with qwen3-coder and tool support."""
    ollama_url = config.ollama_url
    if not ollama_url:
        return {"error": "Ollama server URL is not configured. Please check settings."}

    ollama_tools = []
    for tool in TOOLS:
        ollama_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"]
            }
        })

    openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in messages:
        openai_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    async with httpx.AsyncClient(timeout=30.0) as client:
        for _ in range(5):
            payload = {
                "model": "qwen3-coder",
                "messages": openai_messages,
                "tools": ollama_tools,
                "tool_call": "auto"
            }

            try:
                response = await client.post(f"{ollama_url.rstrip('/')}/v1/chat/completions", json=payload)
                response.raise_for_status()
                res_data = response.json()
            except Exception as e:
                logger.error(f"Error calling Ollama server: {e}")
                return {"error": f"Ollama Error: {str(e)}"}

            choice = res_data.get("choices", [{}])[0]
            assistant_msg = choice.get("message") or {}
            content = assistant_msg.get("content")
            tool_calls = (
                assistant_msg.get("tool_calls") or
                assistant_msg.get("tool_call") or
                assistant_msg.get("function_call") or
                assistant_msg.get("tool")
            )

            if assistant_msg:
                openai_messages.append(assistant_msg)

            if not tool_calls:
                if isinstance(content, list):
                    content = "".join([item.get("text", "") for item in content if isinstance(item, dict)])
                elif content is None:
                    content = ""
                return {
                    "role": "assistant",
                    "content": content,
                    "history": messages + [{"role": "assistant", "content": content}]
                }

            if isinstance(tool_calls, dict):
                tool_calls = [tool_calls]

            tool_calls = tool_calls or []
            for tool_call in tool_calls:
                name = (
                    tool_call.get("name") or
                    (tool_call.get("tool") or {}).get("name") or
                    (tool_call.get("function") or {}).get("name") or
                    tool_call.get("tool_name") or
                    tool_call.get("function_name")
                )
                args = (
                    tool_call.get("arguments") or
                    tool_call.get("args") or
                    (tool_call.get("tool") or {}).get("arguments") or
                    (tool_call.get("function") or {}).get("arguments") or
                    {}
                )

                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}

                if not name:
                    logger.warning("Ollama tool call missing name; logging full call payload and assistant message.")
                    logger.debug(f"Ollama choice payload: {choice}")
                    logger.debug(f"Ollama tool_call entry: {tool_call}")
                    continue

                tool_res = await execute_tool(name, args)
                openai_messages.append({
                    "role": "tool",
                    "name": name,
                    "content": json.dumps(tool_res)
                })

    return {
        "role": "assistant",
        "content": "I apologize, but I reached my maximum reasoning steps without finishing. Please try again.",
        "history": messages
    }

async def run_chat_agent(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Orchestrates Chat SRE reasoning queries across selected AI providers."""
    provider = config.selected_provider
    logger.info(f"Routing chat query to selected AI provider: {provider}")
    
    if provider == "claude":
        return await run_claude_agent(messages)
    elif provider == "openai":
        return await run_openai_agent(messages)
    elif provider == "gemini":
        return await run_gemini_agent(messages)
    elif provider == "ollama":
        return await run_ollama_agent(messages)
    else:
        return {"error": f"Unsupported or unknown AI provider: {provider}"}
