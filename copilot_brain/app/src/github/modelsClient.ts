import { EventEmitter } from "node:events";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  argumentsText: string;
  arguments: Record<string, unknown>;
}

export interface ChatCompletionRequest extends ChatRequest {
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none";
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: ChatToolCall[];
  assistantMessage: ChatMessage;
  finishReason?: string;
}

export interface ApiLogEntry {
  ts: string;
  direction: "req" | "res";
  method: string;
  url: string;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  durationMs?: number;
  error?: string;
}

function parseMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object") {
          const text = (part as { text?: string }).text;
          if (typeof text === "string") {
            return text;
          }
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GitHubModelsClient extends EventEmitter {
  private cachedModels: string[] | null = null;
  private cacheExpiry = 0;

  constructor(private readonly tokenProvider: () => Promise<string | null>) {
    super();
  }

  /** Drop cached model list — call after token change. */
  invalidateCache() {
    this.cachedModels = null;
    this.cacheExpiry = 0;
  }

  private log(entry: ApiLogEntry) {
    this.emit("apiLog", entry);
  }

  private redactAuth(headers: Record<string, string>): Record<string, string> {
    const copy = { ...headers };
    if (copy.Authorization) {
      copy.Authorization = copy.Authorization.slice(0, 15) + "…";
    }
    return copy;
  }

  async testAccess(defaultModel: string): Promise<{ ok: boolean; modelCount: number; sampleModels: string[]; tokenOk?: boolean; tokenError?: string }> {
    const models = await this.listModels(defaultModel);
    const catalogOk = models.length > 0;

    // Validate token format (don't call inference — saves rate limit)
    const token = await this.tokenProvider();
    let tokenOk = false;
    let tokenError: string | undefined;
    if (!token) {
      tokenError = "No token configured";
    } else if (!["github_pat_", "gho_", "ghu_", "ghp_"].some(p => token.startsWith(p))) {
      tokenError = "Invalid token format";
    } else {
      tokenOk = true;
    }

    return {
      ok: catalogOk && tokenOk,
      modelCount: models.length,
      sampleModels: models.slice(0, 10),
      tokenOk,
      tokenError,
    };
  }

  async listModels(defaultModel: string): Promise<string[]> {
    // Return cached list if still valid
    if (this.cachedModels && Date.now() < this.cacheExpiry) {
      return this.cachedModels;
    }

    const token = await this.tokenProvider();
    if (!token) {
      return [defaultModel];
    }

    try {
      const url = "https://models.github.ai/catalog/models";
      const reqHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
      };
      this.log({ ts: new Date().toISOString(), direction: "req", method: "GET", url, headers: this.redactAuth(reqHeaders) });
      const t0 = Date.now();
      const response = await fetch(url, { headers: reqHeaders });
      const durationMs = Date.now() - t0;

      if (!response.ok) {
        const errText = await response.text();
        this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, status: response.status, body: errText.slice(0, 500), durationMs });
        return this.cachedModels ?? [defaultModel];
      }

      const payload = (await response.json()) as Array<{ id?: string }>;
      const ids = payload.map((entry) => entry.id).filter(Boolean) as string[];
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, status: response.status, body: `${ids.length} models (cached 10 min)`, durationMs });
      const result = ids.length ? ids : [defaultModel];
      this.cachedModels = result;
      this.cacheExpiry = Date.now() + MODEL_CACHE_TTL_MS;
      return result;
    } catch (err) {
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url: "https://models.github.ai/catalog/models", error: err instanceof Error ? err.message : "unknown" });
      return this.cachedModels ?? [defaultModel];
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const token = await this.tokenProvider();
    if (!token) {
      return {
        content: "GitHub auth is not configured yet. Open Settings in Copilot Brain and authorize with GitHub OAuth or enter GitHub App credentials to enable live model responses.",
        toolCalls: [],
        assistantMessage: {
          role: "assistant",
          content: "GitHub auth is not configured yet. Open Settings in Copilot Brain and authorize with GitHub OAuth or enter GitHub App credentials to enable live model responses.",
        },
      };
    }

    const url = "https://models.github.ai/inference/chat/completions";
    const reqHeaders: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
    };
    const reqBody = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      tools: request.tools?.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: request.tools?.length ? (request.toolChoice ?? "auto") : undefined,
    };

    this.log({ ts: new Date().toISOString(), direction: "req", method: "POST", url, headers: this.redactAuth(reqHeaders), body: reqBody });
    const t0 = Date.now();

    const response = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(reqBody),
    });

    const durationMs = Date.now() - t0;

    if (!response.ok) {
      const text = await response.text();
      this.log({ ts: new Date().toISOString(), direction: "res", method: "POST", url, status: response.status, body: text.slice(0, 2000), durationMs });
      if (response.status === 401) {
        throw new Error("Błąd autoryzacji (401). Twój token jest nieprawidłowy lub wygasł. Otwórz Settings i zapisz prawidłowy GitHub PAT (github_pat_...).");
      }
      if (response.status === 403) {
        throw new Error(`Brak dostępu (403) do modelu ${request.model}. Sprawdź uprawnienia tokena lub plan Copilot. ${text}`);
      }
      if (response.status === 429) {
        throw new Error("Zbyt wiele zapytań (429). Odczekaj chwilę i spróbuj ponownie. GitHub Models ma limit zapytań na minutę.");
      }
      throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: unknown;
          tool_calls?: Array<{
            id?: string;
            type?: "function";
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const choice = payload.choices?.[0];
    const message = choice?.message;
    const content = parseMessageContent(message?.content) || "";
    const toolCalls = (message?.tool_calls ?? []).map((toolCall) => {
      const argumentsText = toolCall.function?.arguments ?? "{}";
      let parsedArguments: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argumentsText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedArguments = parsed as Record<string, unknown>;
        }
      } catch {
        parsedArguments = { __raw: argumentsText };
      }

      return {
        id: toolCall.id ?? crypto.randomUUID(),
        name: toolCall.function?.name ?? "unknown_tool",
        argumentsText,
        arguments: parsedArguments,
      } satisfies ChatToolCall;
    });

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content,
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.argumentsText,
        },
      })),
    };

    this.log({
      ts: new Date().toISOString(),
      direction: "res",
      method: "POST",
      url,
      status: response.status,
      body: {
        model: request.model,
        finishReason: choice?.finish_reason,
        toolCalls: toolCalls.map((toolCall) => toolCall.name),
        contentLength: content.length,
        preview: content.slice(0, 300),
      },
      durationMs,
    });

    return {
      content,
      toolCalls,
      assistantMessage,
      finishReason: choice?.finish_reason,
    };
  }

  async chat(request: ChatRequest): Promise<string> {
    const result = await this.chatCompletion(request);
    return result.content || "No content returned by the model.";
  }
}
