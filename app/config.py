import os
import json
from typing import Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

class Config:
    def __init__(self):
        self.config_data: Dict[str, Any] = {}
        self.load()

    def load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    self.config_data = json.load(f)
            except Exception as e:
                print(f"Error loading config.json: {e}")
                self.config_data = {}
        else:
            self.config_data = {}

    def save(self):
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump(self.config_data, f, indent=4)
        except Exception as e:
            print(f"Error saving config.json: {e}")

    @property
    def anthropic_api_key(self) -> Optional[str]:
        # Priority: Environment variable then config file
        return os.environ.get("ANTHROPIC_API_KEY") or self.config_data.get("anthropic_api_key")

    @property
    def openai_api_key(self) -> Optional[str]:
        return os.environ.get("OPENAI_API_KEY") or self.config_data.get("openai_api_key")

    @property
    def gemini_api_key(self) -> Optional[str]:
        return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or self.config_data.get("gemini_api_key")

    @property
    def selected_provider(self) -> str:
        return self.config_data.get("selected_provider", "claude")

    @property
    def ollama_url(self) -> str:
        return self.config_data.get("ollama_url", "http://127.0.0.1:11434")

    @property
    def proxmox_user(self) -> str:
        return self.config_data.get("proxmox_user", "")

    @property
    def proxmox_token_id(self) -> str:
        return self.config_data.get("proxmox_token_id", "")

    @property
    def proxmox_token_secret(self) -> str:
        return self.config_data.get("proxmox_token_secret", "")

    @property
    def proxmox_hosts(self) -> list[str]:
        val = self.config_data.get("proxmox_hosts")
        if isinstance(val, list):
            return val
        if isinstance(val, str) and val.strip():
            return [h.strip() for h in val.split(",") if h.strip()]
        return ["pve-01.local", "pve-02.local"]

    @property
    def truenas_host(self) -> str:
        return self.config_data.get("truenas_host", "nas.local")

    @property
    def truenas_api_key(self) -> str:
        return self.config_data.get("truenas_api_key", "")

    @property
    def google_wifi_ip(self) -> str:
        return self.config_data.get("google_wifi_ip", "192.168.1.1")

    @property
    def pihole_host(self) -> str:
        return self.config_data.get("pihole_host", "pihole.local")

    @property
    def pihole_api_key(self) -> str:
        return self.config_data.get("pihole_api_key", "")

    @property
    def switch_host(self) -> str:
        return self.config_data.get("switch_host", "192.168.1.10")

    @property
    def switch_community(self) -> str:
        return self.config_data.get("switch_community", "public")

    @property
    def switch_port(self) -> int:
        try:
            return int(self.config_data.get("switch_port", 161))
        except (ValueError, TypeError):
            return 161

    def update(self, new_config: Dict[str, Any]):
        self.config_data.update(new_config)
        self.save()

    @property
    def active_modules(self) -> Dict[str, bool]:
        defaults = {
            "proxmox": True,
            "truenas": True,
            "alerts": True,
            "google_wifi": True,
            "pihole": True,
            "switch": True
        }
        user_modules = self.config_data.get("modules", {})
        defaults.update(user_modules)
        return defaults

    def is_configured(self) -> bool:
        provider = self.selected_provider
        if provider == "claude":
            return bool(self.anthropic_api_key)
        elif provider == "openai":
            return bool(self.openai_api_key)
        elif provider == "gemini":
            return bool(self.gemini_api_key)
        elif provider == "ollama":
            return bool(self.ollama_url)
        return False

config = Config()
