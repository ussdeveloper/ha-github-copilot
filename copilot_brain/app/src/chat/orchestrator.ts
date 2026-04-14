import type { AppConfig } from "../config/options.js";
import type { SupervisorClient } from "../ha/supervisorClient.js";
import type { ChatMessage, ChatToolCall, GitHubModelsClient } from "../github/modelsClient.js";
import type { AuditStore } from "../audit/store.js";
import type { ToolDefinition } from "../tools/registry.js";
import { renderSystemPrompt, summarizeAddons, summarizeStates } from "../prompt/template.js";

export interface ChatResult {
  reply: string;
  mode: "local" | "github-models" | "tool" | "approval";
}

export class ChatOrchestrator {
  private readonly toolIndex: Map<string, ToolDefinition>;
  private static readonly MAX_AGENT_STEPS = 6;

  constructor(
    private readonly config: AppConfig,
    private readonly ha: SupervisorClient,
    private readonly models: GitHubModelsClient,
    private readonly audit: AuditStore,
    tools: ToolDefinition[],
  ) {
    this.toolIndex = new Map(tools.map((tool) => [tool.name, tool]));
  }

  private getAgentSystemPrompt(basePrompt: string): string {
    return [
      basePrompt,
      "",
      "You can use tools to inspect the workspace, Home Assistant state, run shell commands, and modify workspace files.",
      "Use tools when you need concrete facts from files, directories, search results, or shell output.",
      "Use shell.run only when the user explicitly asks to execute a shell command.",
      "Use workspace.write_file and workspace.replace_in_file only when the user explicitly asks to create or modify files.",
      "When asking for a file, directory, search result, or command output, prefer tools over guessing.",
      "If a tool returns pending approval, stop and explain that approval is required.",
      "Keep final answers concise and grounded in tool output.",
    ].join("\n");
  }

  private buildAgentTools() {
    return [...this.toolIndex.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
  }

  private serializeToolResult(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }

  private async executeToolCall(toolCall: ChatToolCall): Promise<{ pending?: ChatResult; toolMessage?: ChatMessage; usedTool: boolean }> {
    const tool = this.toolIndex.get(toolCall.name);
    if (!tool) {
      return {
        usedTool: true,
        toolMessage: {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Tool ${toolCall.name} is not available.` }),
        },
      };
    }

    try {
      const result = await tool.execute(toolCall.arguments);
      const pending = result as { status?: string; approvalId?: string; summary?: string } | undefined;
      if (pending?.status === "pending_approval") {
        return {
          usedTool: true,
          pending: {
            reply: [
              "Request queued for approval.",
              `Approval ID: ${pending.approvalId ?? "unknown"}`,
              pending.summary ? `Summary: ${pending.summary}` : "",
            ].filter(Boolean).join("\n"),
            mode: "approval",
          },
        };
      }

      return {
        usedTool: true,
        toolMessage: {
          role: "tool",
          tool_call_id: toolCall.id,
          content: this.serializeToolResult(result),
        },
      };
    } catch (error) {
      return {
        usedTool: true,
        toolMessage: {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        },
      };
    }
  }

  private async runAgentLoop(trimmed: string): Promise<ChatResult> {
    const [states, addons] = await Promise.all([this.ha.getStates(), this.ha.getAddons()]);
    const basePrompt = renderSystemPrompt(this.config.systemPromptTemplate, {
      entitiesSummary: summarizeStates(states),
      addonsSummary: summarizeAddons(addons),
      userPrompt: trimmed,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: this.getAgentSystemPrompt(basePrompt) },
      { role: "user", content: trimmed },
    ];
    const tools = this.buildAgentTools();
    let usedTools = false;

    for (let step = 0; step < ChatOrchestrator.MAX_AGENT_STEPS; step += 1) {
      const completion = await this.models.chatCompletion({
        model: this.config.githubModelsDefaultModel,
        messages,
        tools,
      });

      messages.push(completion.assistantMessage);
      if (!completion.toolCalls.length) {
        const reply = completion.content || "No content returned by the model.";
        this.audit.add("chat", `Handled user message: ${trimmed.slice(0, 120)}`, {
          usedTools,
          steps: step + 1,
        });
        return { reply, mode: usedTools ? "tool" : "github-models" };
      }

      for (const toolCall of completion.toolCalls) {
        const execution = await this.executeToolCall(toolCall);
        usedTools = usedTools || execution.usedTool;
        if (execution.pending) {
          this.audit.add("chat", `Handled user message with pending approval: ${trimmed.slice(0, 120)}`, {
            tool: toolCall.name,
          });
          return execution.pending;
        }
        if (execution.toolMessage) {
          messages.push(execution.toolMessage);
        }
      }
    }

    this.audit.add("error", "Agent loop exceeded max steps", { prompt: trimmed.slice(0, 200) });
    return {
      reply: "Agent reached the maximum number of tool steps. Narrow the request and try again.",
      mode: "local",
    };
  }

  private formatToolResult(result: unknown): string {
    const shellResult = result as {
      command?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
    } | undefined;

    if (shellResult?.command) {
      return [
        `Command: ${shellResult.command}`,
        `Exit code: ${shellResult.exitCode ?? 0}${shellResult.timedOut ? " (timeout)" : ""}`,
        shellResult.stdout ? `\nSTDOUT\n${shellResult.stdout}` : "",
        shellResult.stderr ? `\nSTDERR\n${shellResult.stderr}` : "",
      ].filter(Boolean).join("\n");
    }

    return JSON.stringify(result, null, 2);
  }

  private async executeTool(toolName: string, input: Record<string, unknown>, successPrefix: string): Promise<ChatResult> {
    const tool = this.toolIndex.get(toolName);
    if (!tool) {
      return { reply: `Tool ${toolName} is not available.`, mode: "local" };
    }

    const result = await tool.execute(input);
    const pending = result as { status?: string; approvalId?: string; summary?: string; command?: string } | undefined;
    if (pending?.status === "pending_approval") {
      return {
        reply: [
          "Request queued for approval.",
          `Approval ID: ${pending.approvalId ?? "unknown"}`,
          pending.summary ? `Summary: ${pending.summary}` : "",
        ].filter(Boolean).join("\n"),
        mode: "approval",
      };
    }

    return {
      reply: `${successPrefix}\n\n${this.formatToolResult(result)}`,
      mode: "tool",
    };
  }

  private extractShellCommand(message: string): string | null {
    const patterns = [
      /^\/shell\s+([\s\S]+)$/i,
      /^shell:\s*([\s\S]+)$/i,
      /^shell\s+([\s\S]+)$/i,
      /^(?:uruchom|wykonaj)\s+w\s+shellu?\s*:?\s+([\s\S]+)$/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }

    return null;
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
      return this.executeTool(
        "ha.call_service",
        { service, entity_id: entityId },
        `Executed ${service} for ${entityId ?? "(no entity specified)"}.`,
      );
    }

    const shellCommand = this.extractShellCommand(trimmed);
    if (shellCommand) {
      return this.executeTool(
        "shell.run",
        { command: shellCommand },
        "Shell command executed.",
      );
    }

    return this.runAgentLoop(trimmed);
  }
}
