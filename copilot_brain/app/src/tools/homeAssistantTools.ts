import type { AppConfig } from "../config/options.js";
import type { SupervisorClient } from "../ha/supervisorClient.js";
import type { AuditStore } from "../audit/store.js";
import type { ApprovalStore } from "../approval/store.js";
import type { ToolDefinition } from "./registry.js";
import { executePreparedServiceCall, prepareServiceCall } from "./homeAssistantActions.js";

export function createHomeAssistantTools(
  config: AppConfig,
  ha: SupervisorClient,
  audit: AuditStore,
  approvals: ApprovalStore,
): ToolDefinition[] {
  return [
    // ── Entity state ──
    {
      name: "ha.list_entities",
      description: "List all Home Assistant entities and their current states. Optionally filter by domain (e.g. 'light', 'sensor', 'automation').",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Optional domain filter, e.g. 'light', 'sensor', 'climate'" },
        },
      },
      execute: async (input) => {
        const states = await ha.getStates();
        const domain = input.domain ? String(input.domain) : undefined;
        const filtered = domain ? states.filter(s => s.entity_id.startsWith(`${domain}.`)) : states;
        audit.add("tool_call", "Listed entities", { count: filtered.length, domain });
        return { total: filtered.length, entities: filtered };
      },
    },
    {
      name: "ha.get_entity",
      description: "Get full details for a specific Home Assistant entity including all attributes.",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Entity ID, e.g. light.living_room" },
        },
        required: ["entity_id"],
      },
      execute: async (input) => {
        const entityId = String(input.entity_id ?? "");
        const entity = await ha.getEntity(entityId);
        audit.add("tool_call", `Read entity ${entityId}`);
        return entity;
      },
    },

    // ── Service calls ──
    {
      name: "ha.call_service",
      description: "Call a Home Assistant service (e.g. light.turn_on, automation.trigger). Requires approval in explicit mode.",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service in domain.action format, e.g. light.turn_on" },
          entity_id: {
            anyOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
            description: "Target entity ID(s)",
          },
          data: { type: "object", description: "Additional service data" },
        },
        required: ["service"],
      },
      execute: async (input) => {
        const call = prepareServiceCall(config, input);
        if (config.approvalMode === "explicit") {
          const approval = approvals.createServiceCall(call.summary, {
            service: call.service,
            entityIds: call.entityIds,
            serviceData: call.serviceData,
          });
          audit.add("tool_call", `Queued service approval ${call.service}`, { approvalId: approval.id });
          return {
            status: "pending_approval",
            approvalId: approval.id,
            summary: call.summary,
          };
        }

        return await executePreparedServiceCall(ha, audit, call);
      },
    },
    {
      name: "ha.list_services",
      description: "List all available services (domains and their actions) registered in Home Assistant.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Optional: filter by domain, e.g. 'light'" },
        },
      },
      execute: async (input) => {
        const services = await ha.getServices();
        const domain = input.domain ? String(input.domain) : undefined;
        const filtered = domain
          ? services.filter(s => (s as Record<string, unknown>).domain === domain)
          : services;
        audit.add("tool_call", "Listed services", { domain });
        return filtered;
      },
    },

    // ── History & logbook ──
    {
      name: "ha.get_history",
      description: "Get state history for an entity over a time period. Returns timestamped state changes.",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Entity to query history for" },
          start_time: { type: "string", description: "ISO 8601 start time (optional, defaults to 24h ago)" },
          end_time: { type: "string", description: "ISO 8601 end time (optional)" },
        },
        required: ["entity_id"],
      },
      execute: async (input) => {
        const entityId = String(input.entity_id);
        const result = await ha.getHistory(entityId, {
          startTime: input.start_time ? String(input.start_time) : undefined,
          endTime: input.end_time ? String(input.end_time) : undefined,
        });
        audit.add("tool_call", `History for ${entityId}`);
        return result;
      },
    },
    {
      name: "ha.get_logbook",
      description: "Get logbook entries — recent events and state changes. Optionally filter by entity.",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Optional entity filter" },
          start_time: { type: "string", description: "ISO 8601 start time" },
          end_time: { type: "string", description: "ISO 8601 end time" },
        },
      },
      execute: async (input) => {
        const result = await ha.getLogbook({
          entityId: input.entity_id ? String(input.entity_id) : undefined,
          startTime: input.start_time ? String(input.start_time) : undefined,
          endTime: input.end_time ? String(input.end_time) : undefined,
        });
        audit.add("tool_call", "Logbook query", { entity: input.entity_id });
        return result;
      },
    },

    // ── Configuration & structure ──
    {
      name: "ha.get_config",
      description: "Get Home Assistant core configuration — location, timezone, units, installed components/integrations.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const config = await ha.getConfig();
        audit.add("tool_call", "Read HA config");
        return config;
      },
    },
    {
      name: "ha.list_areas",
      description: "List all areas (rooms/zones) defined in Home Assistant.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const areas = await ha.getAreas();
        audit.add("tool_call", "Listed areas", { count: (areas as unknown[]).length });
        return areas;
      },
    },
    {
      name: "ha.list_devices",
      description: "List all devices registered in Home Assistant with their area assignments.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const devices = await ha.getDevices();
        audit.add("tool_call", "Listed devices", { count: (devices as unknown[]).length });
        return devices;
      },
    },
    {
      name: "ha.entity_registry",
      description: "Get full entity registry — every entity with its platform, device, area, disabled state etc.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const registry = await ha.getEntityRegistry();
        audit.add("tool_call", "Entity registry", { count: (registry as unknown[]).length });
        return registry;
      },
    },
    {
      name: "ha.list_automations",
      description: "List all automations registered in Home Assistant with their current states.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const automations = await ha.getAutomations();
        audit.add("tool_call", "Listed automations", { count: (automations as unknown[]).length });
        return automations;
      },
    },

    // ── Templates ──
    {
      name: "ha.render_template",
      description: "Render a Jinja2 template in HA context. Use this to evaluate conditions, format data, or test template expressions.",
      inputSchema: {
        type: "object",
        properties: {
          template: { type: "string", description: "Jinja2 template string, e.g. '{{ states(\"light.living_room\") }}'" },
        },
        required: ["template"],
      },
      execute: async (input) => {
        const result = await ha.renderTemplate(String(input.template));
        audit.add("tool_call", "Rendered template");
        return { result };
      },
    },

    // ── Events ──
    {
      name: "ha.list_events",
      description: "List all event types registered in Home Assistant.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const events = await ha.getEvents();
        audit.add("tool_call", "Listed events");
        return events;
      },
    },
    {
      name: "ha.fire_event",
      description: "Fire a custom event in Home Assistant. Requires approval.",
      inputSchema: {
        type: "object",
        properties: {
          event_type: { type: "string", description: "Event type to fire" },
          event_data: { type: "object", description: "Event payload data" },
        },
        required: ["event_type"],
      },
      execute: async (input) => {
        if (config.approvalMode === "read-only") {
          throw new Error("Add-on is in read-only mode.");
        }
        if (config.approvalMode === "explicit") {
          const approval = approvals.createServiceCall(`Fire event ${input.event_type}`, {
            service: `event.fire_${input.event_type}`,
            entityIds: [],
            serviceData: (input.event_data ?? {}) as Record<string, unknown>,
          });
          return { status: "pending_approval", approvalId: approval.id, summary: `Fire event ${input.event_type}` };
        }
        const result = await ha.fireEvent(String(input.event_type), input.event_data as Record<string, unknown>);
        audit.add("tool_call", `Fired event ${input.event_type}`);
        return result;
      },
    },

    // ── Logs & diagnostics ──
    {
      name: "ha.get_error_log",
      description: "Get the Home Assistant error log — useful for debugging issues.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const log = await ha.getErrorLog();
        audit.add("tool_call", "Read error log");
        return { log };
      },
    },
    {
      name: "ha.get_core_logs",
      description: "Get recent Home Assistant Core logs.",
      inputSchema: {
        type: "object",
        properties: {
          lines: { type: "number", description: "Number of log lines (default 100)" },
        },
      },
      execute: async (input) => {
        const lines = input.lines ? Number(input.lines) : 100;
        const log = await ha.getCoreLogs(lines);
        audit.add("tool_call", "Read core logs");
        return { log };
      },
    },
    {
      name: "ha.get_supervisor_info",
      description: "Get Supervisor system info — version, arch, health status.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const info = await ha.getSupervisorInfo();
        audit.add("tool_call", "Supervisor info");
        return info;
      },
    },
    {
      name: "ha.get_host_info",
      description: "Get host system info — hostname, OS, kernel.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const info = await ha.getHostInfo();
        audit.add("tool_call", "Host info");
        return info;
      },
    },
    {
      name: "ha.list_addons",
      description: "List all installed add-ons with their status and version.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const addons = await ha.getAddons();
        audit.add("tool_call", "Listed addons", { count: addons.length });
        return addons;
      },
    },
    {
      name: "ha.addon_logs",
      description: "Get logs for a specific add-on.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Add-on slug" },
          lines: { type: "number", description: "Number of log lines (default 100)" },
        },
        required: ["slug"],
      },
      execute: async (input) => {
        const slug = String(input.slug);
        const lines = input.lines ? Number(input.lines) : 100;
        const log = await ha.getAddonLogs(slug, lines);
        audit.add("tool_call", `Addon logs: ${slug}`);
        return { log };
      },
    },
  ];
}
