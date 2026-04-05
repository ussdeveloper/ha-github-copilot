import type { AppConfig } from "../config/options.js";
import type { SupervisorClient } from "../ha/supervisorClient.js";
import type { AuditStore } from "../audit/store.js";
import type { ToolDefinition } from "./registry.js";

export function createNodeRedTools(
  config: AppConfig,
  ha: SupervisorClient,
  audit: AuditStore,
): ToolDefinition[] {
  return [
    {
      name: "nodered.status",
      description: "Inspect whether Node-RED appears to be installed and running",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const addons = await ha.getAddons();
        const nodeRed = addons.find((addon) => addon.slug.toLowerCase().includes("nodered"));
        audit.add("tool_call", "Checked Node-RED status", { found: Boolean(nodeRed) });
        return {
          configuredAllowlist: config.addonAllowlist,
          available: Boolean(nodeRed),
          addon: nodeRed ?? null,
        };
      },
    },
  ];
}
