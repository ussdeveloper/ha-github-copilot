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
}
