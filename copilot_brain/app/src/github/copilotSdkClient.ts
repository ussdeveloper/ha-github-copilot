import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { AssistantMessageEvent, Tool } from "@github/copilot-sdk";
import type { ToolDefinition } from "../tools/registry.js";

export interface SdkChatResult {
  reply: string;
  usedTools: boolean;
}

/**
 * Convert our internal ToolDefinition[] to Copilot SDK Tool[] format.
 * SDK tool handlers are called automatically during sendAndWait().
 */
function convertTools(tools: ToolDefinition[]): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    skipPermission: true,
    handler: async (args: unknown) => {
      const input = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const result = await tool.execute(input);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  }));
}

export class CopilotSdkClient {
  private client: CopilotClient | null = null;
  private githubToken: string;

  constructor(githubToken: string) {
    this.githubToken = githubToken;
  }

  updateToken(token: string): void {
    if (token !== this.githubToken) {
      this.githubToken = token;
      this.dispose().catch(() => {});
      this.client = null;
    }
  }

  private getClient(): CopilotClient {
    if (!this.client) {
      this.client = new CopilotClient({
        githubToken: this.githubToken,
        useLoggedInUser: false,
        logLevel: "warning",
      });
    }
    return this.client;
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
    model: string,
    timeoutMs = 120_000,
  ): Promise<SdkChatResult> {
    const client = this.getClient();
    const sdkTools = convertTools(tools);
    let usedTools = false;

    const session = await client.createSession({
      model,
      tools: sdkTools,
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "replace",
        content: systemPrompt,
      },
      streaming: false,
      infiniteSessions: { enabled: false },
    });

    session.on("tool.execution_start", () => {
      usedTools = true;
    });

    let response: AssistantMessageEvent | undefined;
    try {
      response = await session.sendAndWait({ prompt: userMessage }, timeoutMs);
    } finally {
      await session.disconnect().catch(() => {});
    }

    const reply = response?.data?.content ?? "No response from model.";
    return { reply, usedTools };
  }

  async testAccess(model: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = this.getClient();
      const session = await client.createSession({
        model,
        onPermissionRequest: approveAll,
        systemMessage: { mode: "replace", content: "Respond with OK." },
        streaming: false,
        infiniteSessions: { enabled: false },
      });

      let response: AssistantMessageEvent | undefined;
      try {
        response = await session.sendAndWait({ prompt: "Say OK" }, 30_000);
      } finally {
        await session.disconnect().catch(() => {});
      }

      if (response?.data?.content) {
        return { ok: true };
      }
      return { ok: false, error: "Empty response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const client = this.getClient();
      const models = await client.listModels();
      return models.map((m) => m.id);
    } catch {
      return [];
    }
  }

  async dispose(): Promise<void> {
    if (this.client) {
      try {
        await this.client.stop();
      } catch {
        try {
          await this.client.forceStop();
        } catch { /* best effort */ }
      }
      this.client = null;
    }
  }
}
