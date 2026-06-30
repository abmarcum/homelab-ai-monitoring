// API client constants
const API_URL = "";

// Global state
let isConfigured = false;
let hasAILicense = false;
let activeAIProvider = "claude";
let chatHistory = [];

// DOM Elements
const statusAIProvider = document.getElementById("status-ai-provider");
const statusPve01 = document.getElementById("status-pve-01");
const statusPve02 = document.getElementById("status-pve-02");
const statusNas = document.getElementById("status-nas");
const statusWifi = document.getElementById("status-wifi");
const statusPihole = document.getElementById("status-pihole");
const statusSwitch = document.getElementById("status-switch");

const pveNodeList = document.getElementById("pve-node-list");
const nasPoolList = document.getElementById("nas-pool-list");
const nasAlertsList = document.getElementById("nas-alerts-list");
const alertCount = document.getElementById("alert-count");

const badgePveStatus = document.getElementById("badge-pve-status");
const badgeNasStatus = document.getElementById("badge-nas-status");

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");
const btnClearChat = document.getElementById("btn-clear-chat");

const btnConfigure = document.getElementById("btn-configure");
const modalConfig = document.getElementById("modal-config");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelConfig = document.getElementById("btn-cancel-config");
const formConfig = document.getElementById("form-config");

// Initialization
document.addEventListener("DOMContentLoaded", () => {
    checkConfiguration();
    
    // Periodically update dashboard stats and connection badges (sync every 15 seconds)
    setInterval(updateDashboard, 15000);

    // Event listeners
    btnConfigure.addEventListener("click", () => openConfigModal());
    btnCloseModal.addEventListener("click", closeConfigModal);
    btnCancelConfig.addEventListener("click", closeConfigModal);
    formConfig.addEventListener("submit", saveConfiguration);
    
    // Grouped section visual status sync listeners
    document.getElementById("module-proxmox").addEventListener("change", () => syncSectionVisualState("module-proxmox", "section-proxmox"));
    document.getElementById("module-truenas").addEventListener("change", () => syncSectionVisualState("module-truenas", "section-truenas"));
    document.getElementById("module-google_wifi").addEventListener("change", () => syncSectionVisualState("module-google_wifi", "section-google_wifi"));
    document.getElementById("module-pihole").addEventListener("change", () => syncSectionVisualState("module-pihole", "section-pihole"));
    document.getElementById("module-switch").addEventListener("change", () => syncSectionVisualState("module-switch", "section-switch"));

    chatInput.addEventListener("input", adjustTextareaHeight);
    chatInput.addEventListener("keydown", handleChatKeydown);
    btnSend.addEventListener("click", sendChatMessage);
    btnClearChat.addEventListener("click", clearChatHistory);

    // Sidebar dropdown click handlers
    document.querySelectorAll(".status-item.clickable").forEach(item => {
        item.addEventListener("click", () => {
            const dropdownId = "dropdown-" + item.id.replace("status-", "");
            const dropdown = document.getElementById(dropdownId);
            
            const isCurrentlyOpen = dropdown.classList.contains("open");
            
            // Close all dropdowns
            document.querySelectorAll(".status-dropdown").forEach(d => d.classList.remove("open"));
            document.querySelectorAll(".status-item.clickable").forEach(i => i.classList.remove("expanded"));
            
            if (!isCurrentlyOpen) {
                dropdown.classList.add("open");
                item.classList.add("expanded");
            }
        });
    });

    // Pi-hole Toggle Blocking Switch
    const piholeSwitch = document.getElementById("pihole-blocking-switch");
    if (piholeSwitch) {
        piholeSwitch.addEventListener("change", async (e) => {
            const enabled = e.target.checked;
            piholeSwitch.disabled = true;
            try {
                const res = await fetch(`${API_URL}/api/pihole/toggle`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: enabled })
                });
                if (!res.ok) {
                    throw new Error(await res.text());
                }
                updateDashboard();
            } catch (err) {
                console.error("Failed to toggle Pi-hole blocking:", err);
                piholeSwitch.checked = !enabled;
            } finally {
                piholeSwitch.disabled = false;
            }
        });
    }

    // Example prompts click handler
    document.querySelectorAll(".example-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            chatInput.value = e.target.textContent.replace(/"/g, "");
            adjustTextareaHeight();
            sendChatMessage();
        });
    });
});

// Adjust input area size dynamically
function adjustTextareaHeight() {
    chatInput.style.height = "auto";
    chatInput.style.height = (chatInput.scrollHeight) + "px";
    btnSend.disabled = chatInput.value.trim() === "";
}

function handleChatKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}

// Settings visual state sync helper
function syncSectionVisualState(checkboxId, parentId) {
    const cb = document.getElementById(checkboxId);
    const section = document.getElementById(parentId);
    if (cb && section) {
        if (cb.checked) {
            section.classList.remove("disabled");
        } else {
            section.classList.add("disabled");
        }
    }
}

function syncAllSectionVisualStates() {
    syncSectionVisualState("module-proxmox", "section-proxmox");
    syncSectionVisualState("module-truenas", "section-truenas");
    syncSectionVisualState("module-google_wifi", "section-google_wifi");
    syncSectionVisualState("module-pihole", "section-pihole");
    syncSectionVisualState("module-switch", "section-switch");
}

// Modal actions
function openConfigModal() {
    modalConfig.classList.add("open");
    // Pre-populate fields
    fetch(`${API_URL}/api/config`)
        .then(res => res.json())
        .then(data => {
            if (data.proxmox_hosts) {
                document.getElementById("input-proxmox-hosts").value = data.proxmox_hosts;
            }
            if (data.proxmox_token_id) {
                document.getElementById("input-pve-token-id").value = data.proxmox_token_id;
            }
            if (data.truenas_host) {
                document.getElementById("input-truenas-host").value = data.truenas_host;
            }
            if (data.google_wifi_ip) {
                document.getElementById("input-wifi-ip").value = data.google_wifi_ip;
            }
            if (data.pihole_host) {
                document.getElementById("input-pihole-host").value = data.pihole_host;
            }
            if (data.switch_host) {
                document.getElementById("input-switch-host").value = data.switch_host;
            }
            if (data.switch_community) {
                document.getElementById("input-switch-community").value = data.switch_community;
            }
            if (data.switch_port) {
                document.getElementById("input-switch-port").value = data.switch_port;
            }
            
            if (data.selected_provider) {
                document.getElementById("select-ai-provider").value = data.selected_provider;
            }
            if (data.ollama_url) {
                document.getElementById("input-ollama-url").value = data.ollama_url;
            }
            
            // Pre-populate key placeholders
            document.getElementById("input-claude-key").placeholder = data.has_claude_key ? "•••••••••••••••••••••••••••••••• (configured)" : "Loaded from env if left blank";
            document.getElementById("input-openai-key").placeholder = data.has_openai_key ? "•••••••••••••••••••••••••••••••• (configured)" : "Loaded from env if left blank";
            document.getElementById("input-gemini-key").placeholder = data.has_gemini_key ? "•••••••••••••••••••••••••••••••• (configured)" : "Loaded from env if left blank";
            document.getElementById("input-pve-token-secret").placeholder = data.proxmox_token_secret_set ? "•••••••••••••••••••••••••••••••• (configured)" : "Enter token secret key";
            document.getElementById("input-nas-key").placeholder = data.truenas_api_key_set ? "•••••••••••••••••••••••••••••••• (configured)" : "Enter NAS API key";
            document.getElementById("input-pihole-key").placeholder = data.pihole_api_key_set ? "•••••••••••••••••••••••••••••••• (configured)" : "Pi-hole v6 API App Password";
            document.getElementById("input-ollama-url").placeholder = data.ollama_url || "http://127.0.0.1:11434";
            
            // Pre-populate active modules checkboxes
            if (data.modules) {
                document.getElementById("module-proxmox").checked = !!data.modules.proxmox;
                document.getElementById("module-truenas").checked = !!data.modules.truenas;
                document.getElementById("module-alerts").checked = !!data.modules.alerts;
                document.getElementById("module-google_wifi").checked = !!data.modules.google_wifi;
                document.getElementById("module-pihole").checked = !!data.modules.pihole;
                document.getElementById("module-switch").checked = !!data.modules.switch;
            }
            
            // Sync all visual states initially
            syncAllSectionVisualStates();
        });
}

function closeConfigModal() {
    modalConfig.classList.remove("open");
}

async function saveConfiguration(e) {
    e.preventDefault();
    const configData = {
        proxmox_hosts: document.getElementById("input-proxmox-hosts").value.trim() || null,
        proxmox_token_id: document.getElementById("input-pve-token-id").value.trim() || null,
        proxmox_token_secret: document.getElementById("input-pve-token-secret").value.trim() || null,
        truenas_host: document.getElementById("input-truenas-host").value.trim() || null,
        truenas_api_key: document.getElementById("input-nas-key").value.trim() || null,
        anthropic_api_key: document.getElementById("input-claude-key").value.trim() || null,
        openai_api_key: document.getElementById("input-openai-key").value.trim() || null,
        gemini_api_key: document.getElementById("input-gemini-key").value.trim() || null,
        ollama_url: document.getElementById("input-ollama-url").value.trim() || null,
        selected_provider: document.getElementById("select-ai-provider").value,
        google_wifi_ip: document.getElementById("input-wifi-ip").value.trim() || null,
        pihole_host: document.getElementById("input-pihole-host").value.trim() || null,
        pihole_api_key: document.getElementById("input-pihole-key").value.trim() || null,
        switch_host: document.getElementById("input-switch-host").value.trim() || null,
        switch_community: document.getElementById("input-switch-community").value.trim() || null,
        switch_port: document.getElementById("input-switch-port").value.trim() ? parseInt(document.getElementById("input-switch-port").value.trim()) : null,
        modules: {
            proxmox: document.getElementById("module-proxmox").checked,
            truenas: document.getElementById("module-truenas").checked,
            alerts: document.getElementById("module-alerts").checked,
            google_wifi: document.getElementById("module-google_wifi").checked,
            pihole: document.getElementById("module-pihole").checked,
            switch: document.getElementById("module-switch").checked
        }
    };

    try {
        const res = await fetch(`${API_URL}/api/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configData)
        });
        const result = await res.json();
        if (result.status === "success") {
            // Clear secret input values
            document.getElementById("input-pve-token-secret").value = "";
            document.getElementById("input-nas-key").value = "";
            document.getElementById("input-claude-key").value = "";
            document.getElementById("input-openai-key").value = "";
            document.getElementById("input-gemini-key").value = "";
            document.getElementById("input-pihole-key").value = "";
            
            closeConfigModal();
            checkConfiguration();
        } else {
            alert("Error saving configuration.");
        }
    } catch (err) {
        console.error("Save config failed:", err);
    }
}

// Check configuration
async function checkConfiguration() {
    try {
        const res = await fetch(`${API_URL}/api/config`);
        const data = await res.json();
        isConfigured = data.is_configured;
        
        // Check active AI license setup
        const provider = data.selected_provider;
        if (provider) {
            activeAIProvider = provider;
        }
        if (provider === "claude") {
            hasAILicense = data.has_claude_key;
        } else if (provider === "openai") {
            hasAILicense = data.has_openai_key;
        } else if (provider === "gemini") {
            hasAILicense = data.has_gemini_key;
        } else if (provider === "ollama") {
            hasAILicense = data.has_ollama_url;
        }
        
        if (!isConfigured) {
            openConfigModal();
        } else {
            // Dynamic Labels Update based on configurations
            // 1. AI SRE Provider Label
            const aiProviderLabel = document.querySelector("#status-ai-provider .status-label");
            if (aiProviderLabel) {
                if (provider === "claude") aiProviderLabel.textContent = "Anthropic Claude:";
                else if (provider === "openai") aiProviderLabel.textContent = "OpenAI GPT:";
                else if (provider === "gemini") aiProviderLabel.textContent = "Google Gemini:";
                else if (provider === "ollama") aiProviderLabel.textContent = "Ollama (qwen3-coder):";
            }
            
            // 2. Proxmox Nodes Labels
            if (data.proxmox_hosts) {
                const pveHosts = data.proxmox_hosts.split(",");
                const pveItems = document.querySelectorAll(".pve-node-status-item");
                const pveDropdowns = document.querySelectorAll(".pve-node-dropdown");
                
                pveItems.forEach((item, idx) => {
                    const hostName = pveHosts[idx] ? pveHosts[idx].trim() : null;
                    const dropdown = pveDropdowns[idx];
                    if (item) {
                        if (hostName && data.modules.proxmox) {
                            item.style.display = "flex";
                            const labelSpan = item.querySelector(".status-label");
                            if (labelSpan) labelSpan.textContent = hostName + ":";
                        } else {
                            item.style.display = "none";
                            if (dropdown) dropdown.style.display = "none";
                        }
                    }
                });
            }
            
            // 3. TrueNAS Label
            const nasLabel = document.querySelector("#status-nas .status-label");
            if (nasLabel && data.truenas_host) {
                nasLabel.textContent = data.truenas_host + ":";
            }
            
            // 4. Google Wifi Label
            const wifiLabel = document.querySelector("#status-wifi .status-label");
            if (wifiLabel && data.google_wifi_ip) {
                wifiLabel.textContent = data.google_wifi_ip + ":";
            }
            
            // 5. Pi-hole Label
            const piholeLabel = document.querySelector("#status-pihole .status-label");
            if (piholeLabel && data.pihole_host) {
                piholeLabel.textContent = data.pihole_host + ":";
            }
            
            // 6. Switch Label
            const switchLabel = document.querySelector("#status-switch .status-label");
            if (switchLabel && data.switch_host) {
                switchLabel.textContent = data.switch_host + ":";
            }

            updateDashboard();
        }
    } catch (err) {
        console.error("Check config failed:", err);
    }
}

// Update connection badges using active summary payload
function updateStatusIndicators(data, hasAILicense = true) {
    // AI provider status
    updateStatusItem(statusAIProvider, hasAILicense, hasAILicense ? "configured" : "missing");
    
    // Proxmox status
    const pveActive = data.proxmox && data.proxmox.status !== "disabled";
    
    // Check if node is active by reading text content
    const pve1Label = statusPve01.querySelector(".status-label").textContent;
    const pve2Label = statusPve02.querySelector(".status-label").textContent;
    
    const hasPve1 = pveActive && pve1Label && pve1Label !== ":";
    const hasPve2 = pveActive && pve2Label && pve2Label !== ":";
    
    statusPve01.style.display = hasPve1 ? "flex" : "none";
    statusPve02.style.display = hasPve2 ? "flex" : "none";
    
    if (pveActive) {
        const pveOnline = data.proxmox.status === "online";
        const pveError = data.proxmox.status.startsWith("offline") ? data.proxmox.status : "";
        
        const pve1Host = pve1Label.replace(":", "").trim();
        const pve2Host = pve2Label.replace(":", "").trim();
        
        const pve01Offline = pve1Host && pveError.includes(pve1Host);
        const pve02Offline = pve2Host && pveError.includes(pve2Host);
        
        if (hasPve1) {
            updateStatusItem(statusPve01, pveOnline && !pve01Offline, pveOnline && !pve01Offline ? "ONLINE" : "OFFLINE");
        }
        if (hasPve2) {
            updateStatusItem(statusPve02, pveOnline && !pve02Offline, pveOnline && !pve02Offline ? "ONLINE" : "OFFLINE");
        }
    }
    
    // TrueNAS status
    const nasActive = data.truenas && data.truenas.status !== "disabled";
    statusNas.style.display = nasActive ? "flex" : "none";
    if (nasActive) {
        const nasOnline = data.truenas.status === "online";
        updateStatusItem(statusNas, nasOnline, nasOnline ? "ONLINE" : "OFFLINE");
    }
    
    // Google Wifi status
    const wifiActive = data.google_wifi && data.google_wifi.status !== "disabled";
    statusWifi.style.display = wifiActive ? "flex" : "none";
    if (wifiActive) {
        const wifiOnline = data.google_wifi.status === "online";
        updateStatusItem(statusWifi, wifiOnline, wifiOnline ? "ONLINE" : "OFFLINE");
    }
    
    // Pi-hole status
    const piholeActive = data.pihole && data.pihole.status !== "disabled";
    statusPihole.style.display = piholeActive ? "flex" : "none";
    if (piholeActive) {
        const piholeOnline = data.pihole.status === "online";
        updateStatusItem(statusPihole, piholeOnline, piholeOnline ? "ONLINE" : "OFFLINE");
    }
    
    // Switch status
    const switchActive = data.switch && data.switch.status !== "disabled";
    statusSwitch.style.display = switchActive ? "flex" : "none";
    if (switchActive) {
        const switchOnline = data.switch.status === "online";
        updateStatusItem(statusSwitch, switchOnline, switchOnline ? "ONLINE" : "OFFLINE");
    }
}

function updateStatusItem(element, isOnline, textVal) {
    const indicator = element.querySelector(".status-indicator");
    const valEl = element.querySelector(".status-value");
    
    indicator.className = "status-indicator " + (isOnline ? "online" : "offline");
    valEl.textContent = textVal.toUpperCase();
    valEl.style.color = isOnline ? "var(--accent-emerald)" : "var(--accent-red)";
}

// Update Dashboard stats
async function updateDashboard() {
    if (!isConfigured) {
        console.debug("updateDashboard skipped: app is not configured yet.");
        return;
    }
    
    try {
        console.debug("updateDashboard: fetching summary...");
        const res = await fetch(`${API_URL}/api/summary`);
        if (!res.ok) {
            const text = await res.text();
            console.error("Summary fetch failed", res.status, text);
            return;
        }
        const data = await res.json();
        console.debug("updateDashboard: summary data", data);
        
        // Sync connection lights using summary data
        updateStatusIndicators(data, hasAILicense);
        
        const active = data.modules || {};
        
        const cardPve = document.querySelector(".card-nodes");
        const cardNas = document.querySelector(".card-pools");
        const cardAlerts = document.querySelector(".card-alerts");
        const cardWifi = document.querySelector(".card-wifi");
        const cardPihole = document.querySelector(".card-pihole");
        const cardSwitch = document.querySelector(".card-switch");
        
        if (cardPve) cardPve.style.display = active.proxmox ? "flex" : "none";
        if (cardNas) cardNas.style.display = active.truenas ? "flex" : "none";
        if (cardAlerts) cardAlerts.style.display = active.alerts ? "flex" : "none";
        if (cardWifi) cardWifi.style.display = active.google_wifi ? "flex" : "none";
        if (cardPihole) cardPihole.style.display = active.pihole ? "flex" : "none";
        if (cardSwitch) cardSwitch.style.display = active.switch ? "flex" : "none";

        if (active.proxmox) renderProxmoxNodes(data.proxmox);
        if (active.truenas) renderTrueNasPools(data.truenas);
        if (active.alerts) renderTrueNasAlerts(data.truenas.alerts);
        if (active.google_wifi) renderGoogleWifi(data.google_wifi);
        if (active.pihole) renderPihole(data.pihole);
        if (active.switch) renderSwitch(data.switch);
        
        populateDropdowns(data);
    } catch (err) {
        console.error("Dashboard update failed:", err);
    }
}

function renderProxmoxNodes(pve) {
    if (pve.status.startsWith("offline")) {
        pveNodeList.innerHTML = `<div class="loading-placeholder error">Offline: ${pve.status}</div>`;
        badgePveStatus.textContent = "Offline";
        badgePveStatus.className = "badge offline";
        return;
    }
    
    badgePveStatus.textContent = `Online (${pve.vm_count} VMs)`;
    badgePveStatus.className = "badge online";
    
    pveNodeList.replaceChildren();
    
    pve.nodes.forEach(node => {
        const container = document.createElement("div");
        container.style.marginBottom = "16px";
        
        const infoRow = document.createElement("div");
        infoRow.style.display = "flex";
        infoRow.style.justifyContent = "space-between";
        infoRow.style.fontSize = "13px";
        
        const titleSpan = document.createElement("span");
        titleSpan.innerHTML = `<strong>${node.name}</strong> (${node.status})`;
        titleSpan.style.color = node.status === "online" ? "var(--text-primary)" : "var(--accent-red)";
        
        const usageSpan = document.createElement("span");
        usageSpan.textContent = `CPU: ${node.cpu}% | RAM: ${node.mem}%`;
        
        infoRow.appendChild(titleSpan);
        infoRow.appendChild(usageSpan);
        container.appendChild(infoRow);
        
        // Progress bar for memory
        const barBg = document.createElement("div");
        barBg.className = "metric-bar-bg";
        barBg.style.marginTop = "4px";
        
        const barFill = document.createElement("div");
        barFill.className = `metric-bar-fill ${node.mem > 85 ? "warning" : ""}`;
        barFill.style.width = `${node.mem}%`;
        
        barBg.appendChild(barFill);
        container.appendChild(barBg);
        
        // Render nested VMs list if present (running only on card)
        if (node.vms && node.vms.length > 0) {
            const runningVms = node.vms.filter(vm => vm.status === "running");
            if (runningVms.length > 0) {
                const vmsContainer = document.createElement("div");
                vmsContainer.className = "node-vms-list";
                vmsContainer.style.paddingLeft = "12px";
                vmsContainer.style.marginTop = "8px";
                vmsContainer.style.fontSize = "12px";
                vmsContainer.style.display = "flex";
                vmsContainer.style.flexDirection = "column";
                vmsContainer.style.gap = "4px";
                vmsContainer.style.borderLeft = "1px solid rgba(255, 255, 255, 0.05)";
                
                runningVms.forEach(vm => {
                    const vmRow = document.createElement("div");
                    vmRow.className = "vm-row";
                    vmRow.style.display = "flex";
                    vmRow.style.justifyContent = "space-between";
                    vmRow.style.color = "var(--text-secondary)";
                    
                    const vmName = document.createElement("span");
                    const dotColor = "var(--accent-emerald)";
                    vmName.innerHTML = `<span style="color:${dotColor}; margin-right:4px;">●</span>[${vm.vmid}] ${vm.name}`;
                    
                    const vmMetrics = document.createElement("span");
                    vmMetrics.textContent = `CPU: ${vm.cpu}% | RAM: ${vm.mem}%`;
                    vmMetrics.style.fontSize = "11px";
                    vmMetrics.style.color = "var(--text-muted)";
                    
                    vmRow.appendChild(vmName);
                    vmRow.appendChild(vmMetrics);
                    vmsContainer.appendChild(vmRow);
                });
                container.appendChild(vmsContainer);
            }
        }
        
        pveNodeList.appendChild(container);
    });
}

function renderTrueNasPools(nas) {
    if (nas.status.startsWith("offline")) {
        nasPoolList.innerHTML = `<div class="loading-placeholder error">Offline: ${nas.status}</div>`;
        badgeNasStatus.textContent = "Offline";
        badgeNasStatus.className = "badge offline";
        return;
    }
    
    // Summarize statuses
    const degraded = nas.pools.some(p => p.status !== "ONLINE");
    badgeNasStatus.textContent = degraded ? "DEGRADED" : "ONLINE";
    badgeNasStatus.className = "badge " + (degraded ? "warning" : "online");
    
    nasPoolList.replaceChildren();
    
    // Render CPU & Memory metrics if present
    if (nas.cpu_load !== undefined && nas.mem_gb !== undefined) {
        const sysContainer = document.createElement("div");
        sysContainer.style.marginBottom = "14px";
        sysContainer.style.paddingBottom = "10px";
        sysContainer.style.borderBottom = "1px dashed rgba(255, 255, 255, 0.05)";
        
        const sysInfo = document.createElement("div");
        sysInfo.style.display = "flex";
        sysInfo.style.justifyContent = "space-between";
        sysInfo.style.fontSize = "13px";
        sysInfo.style.marginBottom = "4px";
        sysInfo.innerHTML = `<strong>System Load:</strong> <span>CPU: ${nas.cpu_load}% | RAM: ${nas.mem_gb} GB</span>`;
        
        const barBg = document.createElement("div");
        barBg.className = "metric-bar-bg";
        
        const barFill = document.createElement("div");
        barFill.className = `metric-bar-fill ${nas.cpu_load > 80 ? "warning" : ""}`;
        barFill.style.width = `${Math.min(nas.cpu_load, 100)}%`;
        
        barBg.appendChild(barFill);
        sysContainer.appendChild(sysInfo);
        sysContainer.appendChild(barBg);
        nasPoolList.appendChild(sysContainer);
    }
    
    nas.pools.forEach(pool => {
        const container = document.createElement("div");
        container.style.marginBottom = "10px";
        
        const infoRow = document.createElement("div");
        infoRow.style.display = "flex";
        infoRow.style.justifyContent = "space-between";
        infoRow.style.fontSize = "13px";
        
        const titleSpan = document.createElement("span");
        titleSpan.innerHTML = `<strong>${pool.name}</strong> (${pool.status})`;
        titleSpan.style.color = pool.status === "ONLINE" ? "var(--text-primary)" : "var(--accent-amber)";
        
        const usageSpan = document.createElement("span");
        usageSpan.textContent = `${pool.used_pct}% used of ${pool.total_gb} GB`;
        
        infoRow.appendChild(titleSpan);
        infoRow.appendChild(usageSpan);
        container.appendChild(infoRow);
        
        const barBg = document.createElement("div");
        barBg.className = "metric-bar-bg";
        barBg.style.marginTop = "4px";
        
        const barFill = document.createElement("div");
        barFill.className = `metric-bar-fill ${pool.used_pct > 80 ? "warning" : ""}`;
        barFill.style.width = `${pool.used_pct}%`;
        
        barBg.appendChild(barFill);
        container.appendChild(barBg);
        
        nasPoolList.appendChild(container);
    });
    
    if (nas.pools.length === 0) {
        nasPoolList.innerHTML = `<div class="loading-placeholder">No active ZFS pools found.</div>`;
    }
    
    // Render Disk health summary
    if (nas.disk_count !== undefined && nas.disk_count > 0) {
        const diskSummary = document.createElement("div");
        diskSummary.style.marginTop = "12px";
        diskSummary.style.paddingTop = "10px";
        diskSummary.style.borderTop = "1px dashed rgba(255, 255, 255, 0.05)";
        diskSummary.style.fontSize = "12px";
        diskSummary.style.color = "var(--text-secondary)";
        diskSummary.innerHTML = `⚙️ <strong>Physical Disks Attached:</strong> ${nas.disk_count}`;
        nasPoolList.appendChild(diskSummary);
    }

    // Render Network Interfaces
    if (nas.interfaces && nas.interfaces.length > 0) {
        const netHeader = document.createElement("div");
        netHeader.style.marginTop = "10px";
        netHeader.style.paddingTop = "8px";
        netHeader.style.borderTop = "1px dashed rgba(255, 255, 255, 0.05)";
        netHeader.style.fontSize = "12px";
        netHeader.style.color = "var(--text-secondary)";
        netHeader.innerHTML = `🌐 <strong>Network Interfaces:</strong>`;
        nasPoolList.appendChild(netHeader);
        
        nas.interfaces.forEach(iface => {
            const ifaceRow = document.createElement("div");
            ifaceRow.style.display = "flex";
            ifaceRow.style.justifyContent = "space-between";
            ifaceRow.style.fontSize = "11px";
            ifaceRow.style.marginTop = "4px";
            ifaceRow.style.color = "var(--text-muted)";
            
            const nameSpan = document.createElement("span");
            nameSpan.style.fontFamily = "var(--font-mono)";
            nameSpan.textContent = iface.name;
            
            const detailsSpan = document.createElement("span");
            const stateColor = iface.link_state === 'UP' ? 'var(--accent-emerald)' : 'var(--accent-red)';
            detailsSpan.innerHTML = `<span style="color: ${stateColor}; font-weight: bold;">${iface.link_state}</span> (${iface.ip})`;
            
            ifaceRow.appendChild(nameSpan);
            ifaceRow.appendChild(detailsSpan);
            nasPoolList.appendChild(ifaceRow);
        });
    }
}

function renderGoogleWifi(wifi) {
    if (!wifi) return;
    
    const badge = document.getElementById("badge-wifi-status");
    const details = document.getElementById("wifi-status-details");
    
    if (wifi.status && wifi.status.startsWith("offline")) {
        details.innerHTML = `<div class="loading-placeholder error">Offline: ${wifi.status}</div>`;
        badge.textContent = "Offline";
        badge.className = "badge offline";
        return;
    }
    
    const isOnline = wifi.online;
    badge.textContent = isOnline ? "Connected" : "Disconnected";
    badge.className = "badge " + (isOnline ? "online" : "offline");
    
    details.replaceChildren();
    
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "10px";
    list.style.fontSize = "13px";
    
    const items = [
        { label: "Wi-Fi SSID", value: wifi.ssid || "unknown" },
        { label: "WAN IP", value: wifi.wan_ip },
        { label: "Uptime", value: `${wifi.uptime_hours} hours` },
        { label: "Software Version", value: wifi.version },
    ];
    
    if (wifi.devices_count !== null && wifi.devices_count !== undefined) {
        items.push({ label: "Connected Devices", value: wifi.devices_count });
    }
    
    items.forEach(item => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        
        const label = document.createElement("span");
        label.style.color = "var(--text-secondary)";
        label.textContent = item.label;
        
        const val = document.createElement("span");
        val.style.fontWeight = "600";
        val.textContent = item.value;
        
        row.appendChild(label);
        row.appendChild(val);
        list.appendChild(row);
    });
    
    details.appendChild(list);

    // Render traffic chart if history is available
    if (wifi.traffic_history && wifi.traffic_history.length > 0) {
        const chartContainer = document.createElement("div");
        chartContainer.className = "traffic-chart-container";
        
        const header = document.createElement("div");
        header.className = "traffic-chart-header";
        
        const title = document.createElement("strong");
        title.textContent = "Network Traffic Usage (15m)";
        
        const legend = document.createElement("div");
        legend.className = "traffic-chart-legend";
        legend.innerHTML = `
            <div class="legend-item"><span class="legend-color down"></span>Down</div>
            <div class="legend-item"><span class="legend-color up"></span>Up</div>
        `;
        
        header.appendChild(title);
        header.appendChild(legend);
        chartContainer.appendChild(header);
        
        const chartWrapper = document.createElement("div");
        chartWrapper.innerHTML = drawTrafficChart(wifi.traffic_history);
        chartContainer.appendChild(chartWrapper.firstElementChild);
        
        details.appendChild(chartContainer);
    }
}

function drawTrafficChart(history) {
    if (!history || history.length < 2) return "";
    
    const svgWidth = 350;
    const svgHeight = 100;
    const paddingLeft = 30;
    const paddingRight = 10;
    const paddingTop = 10;
    const paddingBottom = 16;
    
    const graphWidth = svgWidth - paddingLeft - paddingRight;
    const graphHeight = svgHeight - paddingTop - paddingBottom;
    
    let maxVal = 5.0; 
    history.forEach(d => {
        if (d.down > maxVal) maxVal = d.down;
        if (d.up > maxVal) maxVal = d.up;
    });
    maxVal = Math.ceil(maxVal * 1.15);
    
    const xStep = graphWidth / (history.length - 1);
    
    let downPoints = [];
    let upPoints = [];
    
    history.forEach((d, i) => {
        const x = paddingLeft + (i * xStep);
        const yDown = svgHeight - paddingBottom - ((d.down / maxVal) * graphHeight);
        const yUp = svgHeight - paddingBottom - ((d.up / maxVal) * graphHeight);
        
        downPoints.push(`${x},${yDown}`);
        upPoints.push(`${x},${yUp}`);
    });
    
    const downPath = `M ${downPoints.join(" L ")}`;
    const upPath = `M ${upPoints.join(" L ")}`;
    
    const gridYMax = paddingTop;
    const gridYMid = paddingTop + (graphHeight / 2);
    const gridYZero = svgHeight - paddingBottom;
    
    const svg = `
        <svg class="traffic-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
            <!-- Grid Lines -->
            <line x1="${paddingLeft}" y1="${gridYMax}" x2="${svgWidth - paddingRight}" y2="${gridYMax}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
            <line x1="${paddingLeft}" y1="${gridYMid}" x2="${svgWidth - paddingRight}" y2="${gridYMid}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
            <line x1="${paddingLeft}" y1="${gridYZero}" x2="${svgWidth - paddingRight}" y2="${gridYZero}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
            
            <!-- Y-Axis Labels -->
            <text x="${paddingLeft - 6}" y="${gridYMax + 3}" fill="var(--text-muted)" font-size="8" text-anchor="end">${maxVal}M</text>
            <text x="${paddingLeft - 6}" y="${gridYMid + 3}" fill="var(--text-muted)" font-size="8" text-anchor="end">${Math.round(maxVal / 2)}M</text>
            <text x="${paddingLeft - 6}" y="${gridYZero + 3}" fill="var(--text-muted)" font-size="8" text-anchor="end">0</text>
            
            <!-- X-Axis Labels -->
            <text x="${paddingLeft}" y="${svgHeight - 2}" fill="var(--text-muted)" font-size="7" text-anchor="start">${history[0].time}</text>
            <text x="${paddingLeft + (graphWidth / 2)}" y="${svgHeight - 2}" fill="var(--text-muted)" font-size="7" text-anchor="middle">${history[Math.floor(history.length / 2)].time}</text>
            <text x="${svgWidth - paddingRight}" y="${svgHeight - 2}" fill="var(--text-muted)" font-size="7" text-anchor="end">${history[history.length - 1].time}</text>
            
            <!-- Data Paths -->
            <path class="chart-path" d="${downPath}" fill="none" stroke="var(--accent-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path class="chart-path" d="${upPath}" fill="none" stroke="var(--accent-indigo)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2,2" />
        </svg>
    `;
    
    return svg;
}

function populateDropdowns(data) {
    const provider = activeAIProvider || "claude";
    const providerDrop = document.getElementById("dropdown-ai-provider");
    let modelLabel = "Unknown";
    let providerLabel = "Unknown";
    let endpointLabel = "Direct REST";

    if (provider === "claude") {
        providerLabel = "Anthropic Claude";
        modelLabel = "claude-sonnet-4-6";
        endpointLabel = "Direct REST";
    } else if (provider === "openai") {
        providerLabel = "OpenAI GPT";
        modelLabel = "gpt-4o-mini";
        endpointLabel = "OpenAI API";
    } else if (provider === "gemini") {
        providerLabel = "Google Gemini";
        modelLabel = "gemini-1.5-flash";
        endpointLabel = "Google AI Studio";
    } else if (provider === "ollama") {
        providerLabel = "Ollama";
        modelLabel = "qwen3-coder";
        endpointLabel = data.ollama_url ? data.ollama_url : "Local Ollama";
    }

    providerDrop.innerHTML = `
        <div class="dropdown-content">
            <div class="dropdown-row"><span>Provider:</span><span>${providerLabel}</span></div>
            <div class="dropdown-row"><span>Model:</span><span>${modelLabel}</span></div>
            <div class="dropdown-row"><span>Status:</span><span>Configured</span></div>
            <div class="dropdown-row"><span>Endpoint:</span><span>${endpointLabel}</span></div>
        </div>
    `;

    // 2. Proxmox Nodes
    if (data.proxmox && data.proxmox.nodes) {
        const drops = document.querySelectorAll(".pve-node-dropdown");
        data.proxmox.nodes.forEach((node, idx) => {
            const drop = drops[idx];
            if (drop) {
                const runningVMs = node.vms ? node.vms.filter(v => v.status === "running").length : 0;
                const totalVMs = node.vms ? node.vms.length : 0;
                
                let vmsListHtml = "";
                if (node.vms && node.vms.length > 0) {
                    vmsListHtml = `
                        <div class="dropdown-vms-title" style="margin-top: 8px; font-weight: 600; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; color: var(--text-muted);">VIRTUAL MACHINES</div>
                        <div class="dropdown-vms-list" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; font-size: 11px;">
                    `;
                    node.vms.forEach(vm => {
                        const isRunning = vm.status === "running";
                        const dotColor = isRunning ? "var(--accent-emerald)" : "var(--text-muted)";
                        vmsListHtml += `
                            <div class="dropdown-row" style="padding: 2px 0;">
                                <span><span style="color:${dotColor}; margin-right:4px;">●</span>[${vm.vmid}] ${vm.name}</span>
                                <span style="color: ${isRunning ? "var(--text-secondary)" : "var(--text-muted)"}">${isRunning ? "running" : "stopped"}</span>
                            </div>
                        `;
                    });
                    vmsListHtml += `</div>`;
                }
                
                drop.innerHTML = `
                    <div class="dropdown-content">
                        <div class="dropdown-row"><span>Status:</span><span>${node.status}</span></div>
                        <div class="dropdown-row"><span>CPU Usage:</span><span>${node.cpu}%</span></div>
                        <div class="dropdown-row"><span>Memory:</span><span>${node.mem}%</span></div>
                        <div class="dropdown-row"><span>VMs Online:</span><span>${runningVMs}/${totalVMs}</span></div>
                        ${vmsListHtml}
                    </div>
                `;
            }
        });
    }

    // 3. TrueNAS
    if (data.truenas && data.truenas.status !== "disabled") {
        const drop = document.getElementById("dropdown-nas");
        if (drop) {
            const poolsCount = data.truenas.pools ? data.truenas.pools.length : 0;
            const alertsCount = data.truenas.alerts ? data.truenas.alerts.length : 0;
            const activeNics = data.truenas.interfaces ? data.truenas.interfaces.filter(i => i.link_state === "UP").map(i => i.name).join(", ") : "none";
            drop.innerHTML = `
                <div class="dropdown-content">
                    <div class="dropdown-row"><span>CPU Load:</span><span>${data.truenas.cpu_load}%</span></div>
                    <div class="dropdown-row"><span>Memory:</span><span>${data.truenas.mem_gb} GB</span></div>
                    <div class="dropdown-row"><span>Active NICs:</span><span>${activeNics}</span></div>
                    <div class="dropdown-row"><span>ZFS Pools:</span><span>${poolsCount} Active</span></div>
                    <div class="dropdown-row"><span>Active Alerts:</span><span>${alertsCount}</span></div>
                </div>
            `;
        }
    }

    // 4. Google Wifi
    if (data.google_wifi && data.google_wifi.status !== "disabled") {
        const drop = document.getElementById("dropdown-wifi");
        if (drop) {
            drop.innerHTML = `
                <div class="dropdown-content">
                    <div class="dropdown-row"><span>SSID:</span><span>${data.google_wifi.ssid || "unknown"}</span></div>
                    <div class="dropdown-row"><span>WAN IP:</span><span>${data.google_wifi.wan_ip}</span></div>
                    <div class="dropdown-row"><span>Uptime:</span><span>${data.google_wifi.uptime_hours} hrs</span></div>
                    <div class="dropdown-row"><span>Clients:</span><span>${data.google_wifi.devices_count || "unknown"}</span></div>
                </div>
            `;
        }
    }

    // 5. Pi-hole
    if (data.pihole && data.pihole.status !== "disabled") {
        const drop = document.getElementById("dropdown-pihole");
        if (drop) {
            drop.innerHTML = `
                <div class="dropdown-content">
                    <div class="dropdown-row"><span>Blocking:</span><span>${data.pihole.blocking_enabled ? "Active" : "Paused"}</span></div>
                    <div class="dropdown-row"><span>Blocked %:</span><span>${data.pihole.blocked_pct}%</span></div>
                    <div class="dropdown-row"><span>Queries:</span><span>${data.pihole.total_queries}</span></div>
                    <div class="dropdown-row"><span>Gravity:</span><span>${data.pihole.gravity_domains.toLocaleString()}</span></div>
                </div>
            `;
        }
    }

    // 6. Switch
    if (data.switch && data.switch.status !== "disabled") {
        const drop = document.getElementById("dropdown-switch");
        if (drop) {
            drop.innerHTML = `
                <div class="dropdown-content">
                    <div class="dropdown-row"><span>Uptime:</span><span>${data.switch.uptime_hours || 0} hrs</span></div>
                    <div class="dropdown-row"><span>Desc:</span><span>${data.switch.description ? data.switch.description.substring(0, 30) + '...' : 'none'}</span></div>
                </div>
            `;
        }
    }
}

function renderPihole(pihole) {
    if (!pihole) return;
    
    const badge = document.getElementById("badge-pihole-status");
    const details = document.getElementById("pihole-status-details");
    const piholeSwitch = document.getElementById("pihole-blocking-switch");
    
    if (pihole.status && pihole.status.startsWith("offline")) {
        details.innerHTML = `<div class="loading-placeholder error">Offline: ${pihole.status}</div>`;
        badge.textContent = "Offline";
        badge.className = "badge offline";
        if (piholeSwitch) {
            piholeSwitch.disabled = true;
        }
        return;
    }
    
    if (piholeSwitch) {
        piholeSwitch.disabled = false;
        piholeSwitch.checked = pihole.blocking_enabled;
    }
    
    badge.textContent = pihole.blocking_enabled ? "Blocking" : "Paused";
    badge.className = "badge " + (pihole.blocking_enabled ? "online" : "warning");
    
    details.replaceChildren();
    
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "10px";
    list.style.fontSize = "13px";
    
    const items = [
        { label: "Total Queries Today", value: pihole.total_queries.toLocaleString() },
        { label: "Blocked Queries Today", value: pihole.blocked_queries.toLocaleString() },
        { label: "Percent Blocked Today", value: `${pihole.blocked_pct}%` },
        { label: "Gravity List Size", value: `${pihole.gravity_domains.toLocaleString()} domains` }
    ];
    
    items.forEach(item => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        
        const label = document.createElement("span");
        label.style.color = "var(--text-secondary)";
        label.textContent = item.label;
        
        const val = document.createElement("span");
        val.style.fontWeight = "600";
        val.textContent = item.value;
        
        row.appendChild(label);
        row.appendChild(val);
        list.appendChild(row);
    });
    
    details.appendChild(list);
}

function drawMiniSparkline(history) {
    if (!history || history.length < 2) return "";
    const width = 60;
    const height = 18;
    const maxVal = Math.max(...history, 10);
    const points = history.map((val, idx) => {
        const x = (idx / (history.length - 1)) * width;
        const y = height - ((val / maxVal) * height);
        return `${x},${y}`;
    });
    return `
        <svg class="mini-sparkline" width="${width}" height="${height}" style="overflow: visible; opacity: 0.85;">
            <path d="M ${points.join(" L ")}" fill="none" stroke="var(--accent-cyan)" stroke-width="1.2" stroke-linejoin="round" />
        </svg>
    `;
}

function renderSwitch(switchData) {
    if (!switchData) return;
    const badge = document.getElementById("badge-switch-status");
    const details = document.getElementById("switch-status-details");
    
    if (switchData.status && switchData.status.startsWith("offline")) {
        details.innerHTML = `<div class="loading-placeholder error">Offline: ${switchData.status}</div>`;
        badge.textContent = "Offline";
        badge.className = "badge offline";
        return;
    }
    
    badge.textContent = "Online";
    badge.className = "badge online";
    
    details.replaceChildren();
    
    let portsHtml = "";
    if (switchData.ports) {
        switchData.ports.forEach(port => {
            const isUp = port.status === "up";
            const dotColor = isUp ? "var(--accent-emerald)" : "rgba(255, 255, 255, 0.15)";
            const lastTraffic = isUp ? `${port.history[port.history.length - 1]} Mbps` : "0 Mbps";
            const sparklineSvg = isUp ? drawMiniSparkline(port.history) : `<div style="height: 18px;"></div>`;
            
            portsHtml += `
                <div class="port-box" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; position: relative;">
                    <div style="display: flex; justify-content: space-between; width: 100%; font-size: 9px; font-weight: 600;">
                        <span style="color: var(--text-muted);">P${port.id}</span>
                        <span style="color: ${dotColor};">●</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 600; color: var(--text-primary); margin: 2px 0;">${lastTraffic}</div>
                    ${sparklineSvg}
                </div>
            `;
        });
    }

    details.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-item">
                <span class="metric-label">CPU Load</span>
                <span class="metric-value">${switchData.cpu_load}%</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Memory Usage</span>
                <span class="metric-value">${switchData.mem_pct}%</span>
            </div>
        </div>
        
        <div class="switch-ports-title" style="margin-top: 15px; font-weight: 600; font-size: 11px; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; margin-bottom: 8px; letter-spacing: 0.5px;">ACTIVE INTERFACE PORTS</div>
        <div class="switch-ports-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            ${portsHtml}
        </div>
        
        <div class="switch-description" style="margin-top: 12px; font-size: 10px; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; display: flex; justify-content: space-between;">
            <span>Uptime: ${switchData.uptime_hours || 0} hrs</span>
            <span>${switchData.name || "unknown"}</span>
        </div>
    `;
}

function renderTrueNasAlerts(alerts) {
    alertCount.textContent = alerts.length;
    alertCount.className = alerts.length > 0 ? "alert-count-badge" : "alert-count-badge empty";
    
    nasAlertsList.replaceChildren();
    
    alerts.forEach(alert => {
        const item = document.createElement("div");
        const isWarning = alert.level === "WARNING";
        item.className = `alert-item ${isWarning ? "warning" : "error"}`;
        item.style.marginBottom = "8px";
        
        const msgSpan = document.createElement("span");
        msgSpan.className = "alert-message";
        msgSpan.textContent = `[${alert.level}] ${alert.message}`;
        
        const metaSpan = document.createElement("span");
        metaSpan.className = "alert-meta";
        const dateStr = alert.datetime ? new Date(alert.datetime).toLocaleString() : "Unknown date";
        metaSpan.textContent = dateStr;
        
        item.appendChild(msgSpan);
        item.appendChild(metaSpan);
        
        nasAlertsList.appendChild(item);
    });
    
    if (alerts.length === 0) {
        nasAlertsList.innerHTML = `<div class="loading-placeholder" style="color: var(--accent-emerald);">All systems clear. No warnings.</div>`;
    }
}

// Chat Client Interaction
async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Clear input
    chatInput.value = "";
    adjustTextareaHeight();
    
    // Clear welcome panel if present
    const welcome = chatMessages.querySelector(".agent-welcome");
    if (welcome) {
        chatMessages.removeChild(welcome);
    }
    
    // Add user message to UI
    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });
    
    // Add agent thinking block
    const thinkingEl = appendThinking();
    scrollToBottom();
    
    // Call FastAPI
    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: chatHistory })
        });
        
        chatMessages.removeChild(thinkingEl);
        
        if (!res.ok) {
            const errData = await res.json();
            appendMessage("agent", `Error communicating with AI SRE Agent: ${errData.detail}`);
            return;
        }
        
        const data = await res.json();
        
        // Show tools execution steps in console if any were added to the API trace
        // Anthropic response returns complete message history, which includes tool outputs
        // We compare the tool steps to show what was run
        const newHistory = data.history || [];
        showToolStepsInConsole(chatHistory, newHistory);
        
        appendMessage("agent", data.content);
        chatHistory = newHistory;
        
        // Update dashboard parameters as agent operations might have changed states
        updateDashboard();
        
    } catch (err) {
        if (chatMessages.contains(thinkingEl)) {
            chatMessages.removeChild(thinkingEl);
        }
        appendMessage("agent", `SRE application crashed: ${err.message}`);
    }
    
    scrollToBottom();
}

function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    
    if (role === "agent") {
        // Safe markdown-to-html rendering
        bubble.innerHTML = parseMarkdownSafely(text);
    } else {
        bubble.textContent = text;
    }
    
    chatMessages.appendChild(bubble);
    return bubble;
}

function appendThinking() {
    const el = document.createElement("div");
    el.className = "chat-bubble agent thinking";
    el.innerHTML = `<span class="pulse-dot" style="display:inline-block; margin-right:8px;"></span> AI SRE Agent is troubleshooting...`;
    chatMessages.appendChild(el);
    return el;
}

function showToolStepsInConsole(oldHist, newHist) {
    // Find newly executed tool calls in history
    const startIndex = oldHist.length;
    for (let i = startIndex; i < newHist.length; i++) {
        const msg = newHist[i];
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach(block => {
                if (block.type === "tool_use") {
                    const step = document.createElement("div");
                    step.className = "tool-step";
                    
                    let argStr = "";
                    if (block.input && Object.keys(block.input).length > 0) {
                        argStr = ` with args: ${JSON.stringify(block.input)}`;
                    }
                    step.textContent = `Executing tool: ${block.name}${argStr}`;
                    chatMessages.appendChild(step);
                }
            });
        }
    }
}

function clearChatHistory() {
    chatHistory = [];
    chatMessages.replaceChildren();
    
    // Restore welcome message
    const welcome = document.createElement("div");
    welcome.className = "agent-welcome";
    welcome.innerHTML = `
        <div class="welcome-icon">🤖</div>
        <h4>Welcome to Homelab SRE Console</h4>
        <p>I am connected to the Proxmox and TrueNAS APIs. You can ask me to analyze the health of the system, list VMs, check logs, or perform VM operations.</p>
        <div class="example-prompts">
            <button class="example-btn">"Is the homelab healthy?"</button>
            <button class="example-btn">"Show all virtual machines"</button>
            <button class="example-btn">"Are there any TrueNAS pool errors?"</button>
        </div>
    `;
    chatMessages.appendChild(welcome);
    
    // Re-bind click handlers for new example buttons
    welcome.querySelectorAll(".example-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            chatInput.value = e.target.textContent.replace(/"/g, "");
            adjustTextareaHeight();
            sendChatMessage();
        });
    });
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Escapes raw HTML entities to prevent XSS, and then replaces safe Markdown syntax.
 */
function parseMarkdownSafely(text) {
    // 1. Escape HTML
    let html = text.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );

    // 2. Parse Markdown elements
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold text
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Lists
    html = html.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    // Clean up duplicated <ul> tags resulting from simple line replace
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Tables parsing (basic SRE response markdown tables)
    const tableRegex = /\|(.+)\|(\r?\n\|[-:| ]+\|)(\r?\n(\|.+(\r?\n)?)+)/g;
    html = html.replace(tableRegex, (match) => {
        const lines = match.trim().split("\n");
        if (lines.length < 3) return match;
        
        let tableHTML = "<table><thead><tr>";
        
        // Header
        const headers = lines[0].split("|").slice(1, -1);
        headers.forEach(h => {
            tableHTML += `<th>${h.trim()}</th>`;
        });
        tableHTML += "</tr></thead><tbody>";
        
        // Data lines
        for (let i = 2; i < lines.length; i++) {
            tableHTML += "<tr>";
            const cells = lines[i].split("|").slice(1, -1);
            cells.forEach(c => {
                tableHTML += `<td>${c.trim()}</td>`;
            });
            tableHTML += "</tr>";
        }
        
        tableHTML += "</tbody></table>";
        return tableHTML;
    });

    // Replace single newlines with <br> to keep spacing, but ignore pre/table/ul/li blocks
    const lines = html.split("\n");
    let inBlock = false;
    const processedLines = lines.map(line => {
        if (line.includes("<pre>") || line.includes("<table>") || line.includes("<ul>")) {
            inBlock = true;
        }
        if (line.includes("</pre>") || line.includes("</table>") || line.includes("</ul>")) {
            inBlock = false;
            return line;
        }
        if (inBlock || line.trim() === "") {
            return line;
        }
        return line + "<br>";
    });
    
    return processedLines.join("\n");
}
