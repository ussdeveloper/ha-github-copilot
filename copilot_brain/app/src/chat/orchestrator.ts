import type { AppConfig } from "../config/options.js";
import type { SupervisorClient } from "../ha/supervisorClient.js";
import type { GitHubModelsClient } from "../github/modelsClient.js";
import type { AuditStore } from "../audit/store.js";
import type { ToolDefinition } from "../tools/registry.js";
import { renderSystemPrompt, summarizeAddons, summarizeStates } from "../prompt/template.js";

export interface ChatResult {
  reply: string;
  mode: "local" | "github-models" | "tool" | "approval";
}

export class ChatOrchestrator {
  private readonly toolIndex: Map<string, ToolDefinition>;

  constructor(
    private readonly config: AppConfig,
    private readonly ha: SupervisorClient,
    private readonly models: GitHubModelsClient,
    private readonly audit: AuditStore,
    tools: ToolDefinition[],
  ) {
    this.toolIndex = new Map(tools.map((tool) => [tool.name, tool]));
  }

  async handleUserMessage(message: string): Promise<ChatResult> {
    const trimmed = message.trim();
    if (!trimmed) {
      return { reply: "Please enter a message.", mode: "local" };
    }

    if (trimmed === "/entities") {
      const tool = this.toolIndex.get("ha.list_entities");
      if (!tool) return { reply: "Tool ha.list_entities is not available.", mode: "local" };
      const result = await tool.execute({});
      return {
        reply: JSON.stringify(result, null, 2),
        mode: "tool",
      };
    }

    if (trimmed.startsWith("/entity ")) {
      const entityId = trimmed.slice(8).trim();
      const tool = this.toolIndex.get("ha.get_entity");
      if (!tool) return { reply: "Tool ha.get_entity is not available.", mode: "local" };
      const result = await tool.execute({ entity_id: entityId });
      return {
        reply: JSON.stringify(result, null, 2),
        mode: "tool",
      };
    }

    if (trimmed.startsWith("/service ")) {
      const [, service, entityId] = trimmed.split(/\s+/, 3);
      const tool = this.toolIndex.get("ha.call_service");
      if (!tool) return { reply: "Tool ha.call_service is not available.", mode: "local" };
      const result = await tool.execute({ service, entity_id: entityId });
      const parsedResult = result as { status?: string; approvalId?: string; summary?: string } | undefined;
      if (parsedResult?.status === "pending_approval") {
        return {
          reply: `Request queued for approval.\n\nApproval ID: ${parsedResult.approvalId}\nSummary: ${parsedResult.summary}`,
          mode: "approval",
        };
      }

      return {
        reply: `Executed ${service} for ${entityId ?? "(no entity specified)"}.\n\n${JSON.stringify(result, null, 2)}`,
        mode: "tool",
      };
    }

    const [states, addons] = await Promise.all([this.ha.getStates(), this.ha.getAddons()]);
    const systemPrompt = renderSystemPrompt(this.config.systemPromptTemplate, {
      entitiesSummary: summarizeStates(states),
      addonsSummary: summarizeAddons(addons),
      userPrompt: trimmed,
    });

    const reply = await this.models.chat({
      model: this.config.githubModelsDefaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmed },
      ],
    });

    this.audit.add("chat", `Handled user message: ${trimmed.slice(0, 120)}`);
    return { reply, mode: "github-models" };
  }
}
