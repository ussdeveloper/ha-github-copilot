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
    {
      name: "ha.list_entities",
      description: "List Home Assistant entities and states",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const states = await ha.getStates();
        audit.add("tool_call", "Listed entities", { count: states.length });
        return states;
      },
    },
    {
      name: "ha.get_entity",
      description: "Get details for a Home Assistant entity",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string" },
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
    {
      name: "ha.call_service",
      description: "Call an allowed Home Assistant service",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string" },
          entity_id: { type: ["string", "array"] },
          data: { type: "object" },
        },
        required: ["service"],
      },
      execute: async (input) => {
        const call = prepareServiceCall(config, input);
        if (config.approvalMode === "explicit") {
          const approval = approvals.create(call.summary, {
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
  ];
}
