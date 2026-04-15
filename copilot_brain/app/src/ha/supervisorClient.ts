import type { AppConfig } from "../config/options.js";

export interface HaState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
}

export interface HaAddon {
  slug: string;
  name: string;
  version?: string;
  state?: string;
}

export class SupervisorClient {
  constructor(private readonly config: AppConfig) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.supervisorToken}`,
      "Content-Type": "application/json",
    };
  }

  isLive(): boolean {
    return Boolean(this.config.supervisorToken);
  }

  // ── Core API ──

  async getStates(): Promise<HaState[]> {
    if (!this.isLive()) {
      return [
        { entity_id: "light.living_room", state: "off" },
        { entity_id: "sensor.living_room_temperature", state: "22.4" },
        { entity_id: "switch.coffee_machine", state: "on" },
      ];
    }

    const response = await fetch(`${this.config.haCoreUrl}/states`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to read Home Assistant states: ${response.status}`);
    }

    return (await response.json()) as HaState[];
  }

  async getAddons(): Promise<HaAddon[]> {
    if (!this.isLive()) {
      return [
        { slug: "core_configurator", name: "File editor", state: "started" },
        { slug: "a0d7b954_nodered", name: "Node-RED", state: "started" },
      ];
    }

    const response = await fetch(`${this.config.haSupervisorUrl}/addons`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to read add-ons: ${response.status}`);
    }

    const payload = (await response.json()) as { data?: { addons?: HaAddon[] } };
    return payload.data?.addons ?? [];
  }

  async callService(domain: string, service: string, serviceData: Record<string, unknown>) {
    if (!this.isLive()) {
      return {
        mocked: true,
        domain,
        service,
        serviceData,
      };
    }

    const response = await fetch(`${this.config.haCoreUrl}/services/${domain}/${service}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(serviceData),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to call service ${domain}.${service}: ${response.status} ${text}`);
    }

    return await response.json();
  }

  async getEntity(entityId: string): Promise<HaState | null> {
    const states = await this.getStates();
    return states.find((state) => state.entity_id === entityId) ?? null;
  }

  // ── Supervisor info endpoints ──

  async getSupervisorInfo(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { version: "mock", channel: "stable", arch: "amd64", supported: true, healthy: true };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/info`, { headers: this.headers });
    if (!r.ok) throw new Error(`Supervisor info failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  async getHostInfo(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { hostname: "mock-host", operating_system: "Linux", kernel: "6.1.0", chassis: "vm" };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/host/info`, { headers: this.headers });
    if (!r.ok) throw new Error(`Host info failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  async getOsInfo(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { version: "mock-os", board: "generic-x86-64" };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/os/info`, { headers: this.headers });
    if (!r.ok) throw new Error(`OS info failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  async getNetworkInfo(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { interfaces: [{ interface: "eth0", ipv4: { address: ["192.168.1.100/24"] } }] };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/network/info`, { headers: this.headers });
    if (!r.ok) throw new Error(`Network info failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  async getHardwareInfo(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { devices: [], drives: [] };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/hardware/info`, { headers: this.headers });
    if (!r.ok) throw new Error(`Hardware info failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  async getAddonLogs(slug: string, lines = 100): Promise<string> {
    if (!this.isLive()) {
      return `[mock] Last ${lines} log lines for ${slug}.\n[mock] addon started successfully.`;
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/addons/${encodeURIComponent(slug)}/logs`, {
      headers: { Authorization: `Bearer ${this.config.supervisorToken}` },
    });
    if (!r.ok) throw new Error(`Addon logs (${slug}) failed: ${r.status}`);
    const text = await r.text();
    const logLines = text.split('\n');
    return logLines.slice(-lines).join('\n');
  }

  async getCoreLogs(lines = 100): Promise<string> {
    if (!this.isLive()) {
      return `[mock] Core logs — last ${lines} lines.`;
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/core/logs`, {
      headers: { Authorization: `Bearer ${this.config.supervisorToken}` },
    });
    if (!r.ok) throw new Error(`Core logs failed: ${r.status}`);
    const text = await r.text();
    return text.split('\n').slice(-lines).join('\n');
  }

  async getSupervisorLogs(lines = 100): Promise<string> {
    if (!this.isLive()) {
      return `[mock] Supervisor logs — last ${lines} lines.`;
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/supervisor/logs`, {
      headers: { Authorization: `Bearer ${this.config.supervisorToken}` },
    });
    if (!r.ok) throw new Error(`Supervisor logs failed: ${r.status}`);
    const text = await r.text();
    return text.split('\n').slice(-lines).join('\n');
  }

  async getAddonStats(slug: string): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { cpu_percent: 1.2, memory_usage: 52428800, memory_limit: 536870912, network_rx: 1024, network_tx: 512 };
    }
    const r = await fetch(`${this.config.haSupervisorUrl}/addons/${encodeURIComponent(slug)}/stats`, {
      headers: this.headers,
    });
    if (!r.ok) throw new Error(`Addon stats (${slug}) failed: ${r.status}`);
    const payload = (await r.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }

  // ── HA Core REST API — full access ──

  /** List all registered services (domains + actions). */
  async getServices(): Promise<Record<string, unknown>[]> {
    if (!this.isLive()) {
      return [{ domain: "light", services: { turn_on: {}, turn_off: {}, toggle: {} } }];
    }
    const r = await fetch(`${this.config.haCoreUrl}/services`, { headers: this.headers });
    if (!r.ok) throw new Error(`Services list failed: ${r.status}`);
    return (await r.json()) as Record<string, unknown>[];
  }

  /** Get HA core configuration (location, units, components, etc.). */
  async getConfig(): Promise<Record<string, unknown>> {
    if (!this.isLive()) {
      return { location_name: "Mock Home", latitude: 52.23, longitude: 21.01, unit_system: { temperature: "°C" }, components: ["light", "switch", "automation"] };
    }
    const r = await fetch(`${this.config.haCoreUrl}/config`, { headers: this.headers });
    if (!r.ok) throw new Error(`HA config failed: ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  }

  /** List registered event types. */
  async getEvents(): Promise<Record<string, unknown>[]> {
    if (!this.isLive()) {
      return [{ event: "state_changed", listener_count: 5 }, { event: "automation_triggered", listener_count: 2 }];
    }
    const r = await fetch(`${this.config.haCoreUrl}/events`, { headers: this.headers });
    if (!r.ok) throw new Error(`Events list failed: ${r.status}`);
    return (await r.json()) as Record<string, unknown>[];
  }

  /** Fire a custom event. */
  async fireEvent(eventType: string, eventData?: Record<string, unknown>): Promise<unknown> {
    if (!this.isLive()) {
      return { mocked: true, event: eventType };
    }
    const r = await fetch(`${this.config.haCoreUrl}/events/${encodeURIComponent(eventType)}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(eventData ?? {}),
    });
    if (!r.ok) throw new Error(`Fire event ${eventType} failed: ${r.status}`);
    return await r.json();
  }

  /** Get logbook entries. Optionally filter by entity_id and time range. */
  async getLogbook(opts?: { entityId?: string; startTime?: string; endTime?: string }): Promise<unknown[]> {
    if (!this.isLive()) {
      return [{ name: "Living room light", message: "turned on", entity_id: "light.living_room", when: new Date().toISOString() }];
    }
    const params = new URLSearchParams();
    if (opts?.entityId) params.set("entity", opts.entityId);
    if (opts?.endTime) params.set("end_time", opts.endTime);
    const timePart = opts?.startTime ? `/${opts.startTime}` : "";
    const qs = params.toString() ? `?${params.toString()}` : "";
    const r = await fetch(`${this.config.haCoreUrl}/logbook${timePart}${qs}`, { headers: this.headers });
    if (!r.ok) throw new Error(`Logbook failed: ${r.status}`);
    return (await r.json()) as unknown[];
  }

  /** Get entity history over a time period. */
  async getHistory(entityId: string, opts?: { startTime?: string; endTime?: string; significantChangesOnly?: boolean }): Promise<unknown[]> {
    if (!this.isLive()) {
      return [[{ entity_id: entityId, state: "on", last_changed: new Date().toISOString() }]];
    }
    const params = new URLSearchParams();
    params.set("filter_entity_id", entityId);
    if (opts?.endTime) params.set("end_time", opts.endTime);
    if (opts?.significantChangesOnly !== false) params.set("significant_changes_only", "1");
    const timePart = opts?.startTime ? `/${opts.startTime}` : "";
    const r = await fetch(`${this.config.haCoreUrl}/history/period${timePart}?${params.toString()}`, { headers: this.headers });
    if (!r.ok) throw new Error(`History for ${entityId} failed: ${r.status}`);
    return (await r.json()) as unknown[];
  }

  /** Render a Jinja2 template in HA context. */
  async renderTemplate(template: string): Promise<string> {
    if (!this.isLive()) {
      return `[mock] Template result for: ${template}`;
    }
    const r = await fetch(`${this.config.haCoreUrl}/template`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ template }),
    });
    if (!r.ok) throw new Error(`Template render failed: ${r.status}`);
    return await r.text();
  }

  /** Get error log from HA core. */
  async getErrorLog(): Promise<string> {
    if (!this.isLive()) {
      return "[mock] No errors.";
    }
    const r = await fetch(`${this.config.haCoreUrl}/error_log`, { headers: this.headers });
    if (!r.ok) throw new Error(`Error log failed: ${r.status}`);
    return await r.text();
  }

  /** List all areas. */
  async getAreas(): Promise<unknown[]> {
    return this.wsLikeCommand("config/area_registry/list");
  }

  /** List all devices. */
  async getDevices(): Promise<unknown[]> {
    return this.wsLikeCommand("config/device_registry/list");
  }

  /** List all entity registry entries (with area, device, platform info). */
  async getEntityRegistry(): Promise<unknown[]> {
    return this.wsLikeCommand("config/entity_registry/list");
  }

  /** List all automations from registry. */
  async getAutomations(): Promise<unknown[]> {
    return this.wsLikeCommand("config/automation/config");
  }

  /**
   * HA exposes some WebSocket-like commands via REST POST /api/...
   * For registries we use the states + attributes approach as fallback.
   */
  private async wsLikeCommand(path: string): Promise<unknown[]> {
    if (!this.isLive()) {
      const mocks: Record<string, unknown[]> = {
        "config/area_registry/list": [{ area_id: "living_room", name: "Salon" }, { area_id: "bedroom", name: "Sypialnia" }],
        "config/device_registry/list": [{ id: "dev1", name: "Philips Hue Bridge", area_id: "living_room" }],
        "config/entity_registry/list": [{ entity_id: "light.living_room", platform: "hue", area_id: "living_room", device_id: "dev1" }],
        "config/automation/config": [{ id: "auto1", alias: "Włącz światło o zachodzie", trigger: [] }],
      };
      return mocks[path] ?? [];
    }

    // Try REST API endpoint first (works for entity/device/area registries in newer HA)
    try {
      const r = await fetch(`${this.config.haCoreUrl}/${path}`, {
        method: "GET",
        headers: this.headers,
      });
      if (r.ok) {
        const data = await r.json();
        return Array.isArray(data) ? data : (data as Record<string, unknown>)?.result as unknown[] ?? [];
      }
    } catch { /* fall through */ }

    // Fallback: for automations, read from states
    if (path.includes("automation")) {
      const states = await this.getStates();
      return states.filter(s => s.entity_id.startsWith("automation."));
    }

    // Fallback: for areas, derive from entity attributes
    if (path.includes("area")) {
      const states = await this.getStates();
      const areaSet = new Set<string>();
      for (const s of states) {
        const area = (s.attributes as Record<string, unknown>)?.friendly_name;
        if (area) areaSet.add(String(area));
      }
      return [...areaSet].map(name => ({ name }));
    }

    return [];
  }
}
