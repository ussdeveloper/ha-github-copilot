export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export class GitHubModelsClient {
  constructor(private readonly tokenProvider: () => Promise<string | null>) {}

  async testAccess(defaultModel: string): Promise<{ ok: boolean; modelCount: number; sampleModels: string[] }> {
    const models = await this.listModels(defaultModel);
    return {
      ok: models.length > 0,
      modelCount: models.length,
      sampleModels: models.slice(0, 10),
    };
  }

  async listModels(defaultModel: string): Promise<string[]> {
    const token = await this.tokenProvider();
    if (!token) {
      return [defaultModel];
    }

    try {
      const response = await fetch("https://models.github.ai/catalog/models", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        return [defaultModel];
      }

      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      const ids = payload.data?.map((entry) => entry.id).filter(Boolean) as string[] | undefined;
      return ids?.length ? ids : [defaultModel];
    } catch {
      return [defaultModel];
    }
  }

  async chat(request: ChatRequest): Promise<string> {
    const token = await this.tokenProvider();
    if (!token) {
      return "GitHub App auth is not configured yet. Configure your GitHub App credentials in the add-on settings to enable live model responses.";
    }

    const response = await fetch("https://models.github.ai/inference/chat/completions", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return payload.choices?.[0]?.message?.content ?? "No content returned by the model.";
  }
}
