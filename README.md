# Homelab SRE Dashboard

A modern, glassmorphic homelab management dashboard and AI Site Reliability Engineer (SRE) assistant. It allows you to monitor infrastructure statistics, control virtual environments, configure DNS blockers, and converse with an AI agent equipped with live execution tools to manage your cluster.

<p align="center">
  <img src="static/favicon.png" width="200" alt="Homelab SRE Logo">
</p>

---

## Key Features

*   **Modular Dashboard Grid**: Toggle visible cards (Proxmox, TrueNAS, System Alerts, Google Wifi, Pi-hole) dynamically from settings. Disabled modules bypass backend API calls to optimize host resources.
*   **Multi-AI SRE Co-Pilot**:
    *   **Anthropic Claude 3.5 Sonnet** (via SDK client)
    *   **OpenAI GPT-4o / GPT-4o-mini** (via direct HTTP completions calls)
    *   **Google Gemini 1.5 Pro / Flash** (via direct HTTP content-generation calls)
*   **Proxmox Virtualization VM control**:
    *   Inspect nodes CPU load, memory utilization, and active kernel versions.
    *   Filter active/running VMs in dashboard cards, and list stopped VMs in sidebar drawers.
    *   Issue VM power commands (Start, Stop, Reboot, Shutdown, Suspend) directly from the SRE chatbot or host connection panels.
*   **TrueNAS Storage Pool Diagnostics**:
    *   ZFS pools health status, free space, and disk counts.
    *   Raw property dataset parsing to fix size rounding issues (e.g. ZFS dataset blocks).
    *   System CPU load, physical RAM capacity, active network interfaces, and un-dismissed alert warnings.
*   **Google Wifi Gateway Diagnostics**:
    *   Dynamic local router welcome-mat queries to extract active network SSIDs.
    *   WAN Gateway IP addresses and local system uptime.
    *   15-minute history traffic logger displaying download/upload network usage charts.
*   **Pi-hole v6 Ad Blocking Integration**:
    *   Total queries, gravity lists size, blocked counts, and percentage gauges.
    *   Blocking state control toggles (supporting temporary suspension timers).
    *   Cached session authentication to prevent token rate limits on FTL engines.
*   **Network Switch Telemetry**:
    *   Monitor switch system CPU utilization and memory usage stats.
    *   Inspect status for 8 interface ports, including active status dots, last throughput throughput values, and real-time mini SVG sparkline charts.
    *   Lightweight async SNMP agent integration utilizing zero-dependency UDP BER encoders/decoders.

---

## Project Structure

*   `app/`: FastAPI Python server containing provider clients, API endpoints, and SRE tools (see [app/README.md](file:///usr/local/google/home/amarcum/sre-ai/app/README.md) for architecture details).
*   `static/`: Modern glassmorphic front-end single-page application (HTML, CSS, JS).

---

## Installation & Startup

### Option A: Using `uv` (Recommended)

1. Make sure your preferred LLM key is exported in your environment:
   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-key"
   # OR
   export OPENAI_API_KEY="your-openai-key"
   # OR
   export GEMINI_API_KEY="your-gemini-key"
   ```

2. Spin up the FastAPI server:
   ```bash
   uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

---

### Option B: Using Traditional `pip` and Virtualenv

1. Initialize and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

### Option C: Using Docker

1. Build the Docker image:
   ```bash
   docker build -t homelab-sre-dashboard .
   ```

2. Run the Docker container, passing your AI provider API key as an environment variable and mapping port 8000:
   ```bash
   docker run -d \
     -p 8000:8000 \
     -e ANTHROPIC_API_KEY="your-anthropic-key" \
     --name homelab-sre \
     homelab-sre-dashboard
   ```

---

## Configuration Settings

Once the dashboard is running, open `http://<your-host-ip>:8000` (or `http://127.0.0.1:8000` locally) and click **Settings** in the sidebar footer:
1.  **AI Co-Pilot Settings**: Select your active AI provider (Claude, OpenAI, Gemini) and input API keys.
2.  **Module Sections**: Each module (Proxmox, TrueNAS, Google Wifi, Pi-hole) is grouped into its own section card, with its activation checkbox placed in the section header. 
3.  **Configurable Hosts & IPs**: Custom connection nodes and hostnames (e.g. Proxmox cluster list, TrueNAS IP, Google Wifi gateway) can be customized directly within their respective module sections.
4.  **Disabled Visual Locking**: Toggling a module off dims and locks its credential input fields to simplify configuration management.

