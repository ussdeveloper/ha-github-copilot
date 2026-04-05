import type { AppConfig } from "../config/options.js";
import type { AuditStore } from "../audit/store.js";
import type { SupervisorClient } from "../ha/supervisorClient.js";

export interface PreparedServiceCall {
  service: string;
  domain: string;
  action: string;
  entityIds: string[];
  serviceData: Record<string, unknown>;
  summary: string;
}

export function normalizeEntityIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

export function prepareServiceCall(
  config: AppConfig,
  input: Record<string, unknown>,
): PreparedServiceCall {
  if (config.approvalMode === "read-only") {
    throw new Error("Add-on is configured in read-only mode.");
  }

  const service = String(input.service ?? "");
  const [domain, action] = service.split(".");
  if (!domain || !action) {
    throw new Error("Service must be in domain.action format.");
  }

  if (!config.serviceAllowlist.includes(service)) {
    throw new Error(`Service ${service} is not allowlisted.`);
  }

  const entityIds = normalizeEntityIds(input.entity_id);
  if (config.entityAllowlist.length > 0) {
    for (const entityId of entityIds) {
      if (!config.entityAllowlist.includes(entityId)) {
        throw new Error(`Entity ${entityId} is not allowlisted.`);
      }
    }
  }

  const serviceData = {
    ...(typeof input.data === "object" && input.data ? (input.data as Record<string, unknown>) : {}),
    ...(entityIds.length ? { entity_id: entityIds.length === 1 ? entityIds[0] : entityIds } : {}),
  };

  const summary = `Call ${service}${entityIds.length ? ` on ${entityIds.join(", ")}` : ""}`;

  return {
    service,
    domain,
    action,
    entityIds,
    serviceData,
    summary,
  };
}

export async function executePreparedServiceCall(
  ha: SupervisorClient,
  audit: AuditStore,
  call: PreparedServiceCall,
) {
  const result = await ha.callService(call.domain, call.action, call.serviceData);
  audit.add("tool_call", `Called service ${call.service}`, call.serviceData);
  return result;
}
