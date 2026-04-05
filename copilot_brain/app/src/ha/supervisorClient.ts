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
}
