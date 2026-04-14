import type { AppConfig } from "../config/options.js";
import type { AuditStore } from "../audit/store.js";
import type { ApprovalStore } from "../approval/store.js";
import type { ToolDefinition } from "./registry.js";
import { executePreparedShellCommand, prepareShellCommand } from "./shellActions.js";

export function createShellTools(
  config: AppConfig,
  audit: AuditStore,
  approvals: ApprovalStore,
): ToolDefinition[] {
  return [
    {
      name: "shell.run",
      description: "Run a single shell command on the add-on host/container shell. Use only when the user explicitly asks for shell execution.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
      execute: async (input) => {
        const call = prepareShellCommand(config, input);
        if (config.approvalMode === "explicit") {
          const approval = approvals.createShellCommand(call.summary, {
            command: call.command,
          });
          audit.add("tool_call", `Queued shell command approval ${call.command.slice(0, 120)}`, {
            approvalId: approval.id,
          });
          return {
            status: "pending_approval",
            approvalId: approval.id,
            summary: call.summary,
          };
        }

        return executePreparedShellCommand(audit, call);
      },
    },
  ];
}