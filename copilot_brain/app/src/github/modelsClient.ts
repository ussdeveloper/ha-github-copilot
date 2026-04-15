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
const COPILOT_TOKEN_TTL_MS = 25 * 60 * 1000; // 25 minutes (tokens last ~30 min)

export class GitHubModelsClient extends EventEmitter {
  private cachedModels: string[] | null = null;
  private cacheExpiry = 0;
  private copilotToken: string | null = null;
  private copilotTokenExpiry = 0;

  constructor(private readonly tokenProvider: () => Promise<string | null>) {
    super();
  }

  /** Drop cached model list — call after token change. */
  invalidateCache() {
    this.cachedModels = null;
    this.cacheExpiry = 0;
    this.copilotToken = null;
    this.copilotTokenExpiry = 0;
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

  /**
   * Exchange GitHub PAT for a short-lived Copilot API token.
   * This is the same mechanism VS Code uses internally.
   */
  private async getCopilotToken(): Promise<string | null> {
    // Return cached token if still valid
    if (this.copilotToken && Date.now() < this.copilotTokenExpiry) {
      return this.copilotToken;
    }

    const pat = await this.tokenProvider();
    if (!pat) return null;

    const url = "https://api.github.com/copilot_internal/v2/token";
    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${pat}`,
      Accept: "application/json",
      "User-Agent": "CopilotBrain-HA-Addon",
    };

    this.log({ ts: new Date().toISOString(), direction: "req", method: "GET", url, headers: this.redactAuth(reqHeaders) });
    const t0 = Date.now();

    try {
      const response = await fetch(url, { headers: reqHeaders });
      const durationMs = Date.now() - t0;

      if (!response.ok) {
        const errText = await response.text();
        this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, status: response.status, body: errText.slice(0, 500), durationMs });
        return null;
      }

      const data = (await response.json()) as { token?: string; expires_at?: number };
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, status: response.status, body: "token exchanged", durationMs });

      if (!data.token) return null;

      this.copilotToken = data.token;
      // Use server-provided expiry if available, else default
      if (data.expires_at) {
        this.copilotTokenExpiry = data.expires_at * 1000 - 60_000; // 1 min before expiry
      } else {
        this.copilotTokenExpiry = Date.now() + COPILOT_TOKEN_TTL_MS;
      }

      return this.copilotToken;
    } catch (err) {
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, error: err instanceof Error ? err.message : "unknown" });
      return null;
    }
  }

  async testAccess(defaultModel: string): Promise<{ ok: boolean; modelCount: number; sampleModels: string[]; tokenOk?: boolean; tokenError?: string }> {
    // Test PAT → Copilot token exchange
    const copilotToken = await this.getCopilotToken();
    if (!copilotToken) {
      const pat = await this.tokenProvider();
      return {
        ok: false,
        modelCount: 0,
        sampleModels: [],
        tokenOk: false,
        tokenError: pat ? "Could not exchange PAT for Copilot token. Check Copilot subscription and PAT permissions." : "No token configured",
      };
    }

    const models = await this.listModels(defaultModel);
    return {
      ok: models.length > 0,
      modelCount: models.length,
      sampleModels: models.slice(0, 10),
      tokenOk: true,
    };
  }

  async listModels(defaultModel: string): Promise<string[]> {
    // Return cached list if still valid
    if (this.cachedModels && Date.now() < this.cacheExpiry) {
      return this.cachedModels;
    }

    const copilotToken = await this.getCopilotToken();
    if (!copilotToken) {
      return [defaultModel];
    }

    try {
      const url = "https://api.githubcopilot.com/models";
      const reqHeaders: Record<string, string> = {
        Authorization: `Bearer ${copilotToken}`,
        Accept: "application/json",
        "Copilot-Integration-Id": "copilot-brain-ha",
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

      const payload = (await response.json()) as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> } | Array<{ id?: string; name?: string }>;
      let entries: Array<{ id?: string; name?: string }>;
      if (Array.isArray(payload)) {
        entries = payload;
      } else {
        entries = payload.data ?? payload.models ?? [];
      }
      const ids = entries.map((entry) => entry.id ?? entry.name).filter(Boolean) as string[];
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url, status: response.status, body: `${ids.length} Copilot models`, durationMs });
      const result = ids.length ? ids : [defaultModel];
      this.cachedModels = result;
      this.cacheExpiry = Date.now() + MODEL_CACHE_TTL_MS;
      return result;
    } catch (err) {
      this.log({ ts: new Date().toISOString(), direction: "res", method: "GET", url: "https://api.githubcopilot.com/models", error: err instanceof Error ? err.message : "unknown" });
      return this.cachedModels ?? [defaultModel];
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const copilotToken = await this.getCopilotToken();
    if (!copilotToken) {
      return {
        content: "Copilot nie jest skonfigurowany. Otwórz Settings, wklej GitHub PAT z uprawnieniem Copilot i zapisz.",
        toolCalls: [],
        assistantMessage: {
          role: "assistant",
          content: "Copilot nie jest skonfigurowany. Otwórz Settings, wklej GitHub PAT z uprawnieniem Copilot i zapisz.",
        },
      };
    }

    const url = "https://api.githubcopilot.com/chat/completions";
    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${copilotToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Copilot-Integration-Id": "copilot-brain-ha",
      "Editor-Version": "CopilotBrain/0.4.20",
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
        throw new Error("Zbyt wiele zapytań (429). Odczekaj chwilę i spróbuj ponownie.");
      }
      throw new Error(`Copilot API request failed: ${response.status} ${text}`);
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
