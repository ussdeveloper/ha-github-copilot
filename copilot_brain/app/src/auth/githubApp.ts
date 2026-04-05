import jwt from "jsonwebtoken";
import type { AppConfig } from "../config/options.js";

export interface GitHubAppMetadata {
  id?: number;
  slug?: string;
  name?: string;
  owner?: { login?: string };
}

export class GitHubAppAuth {
  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.githubAppId.trim() &&
        this.config.githubAppInstallationId.trim() &&
        this.config.githubAppPrivateKeyBase64.trim() &&
        this.config.githubAppPrivateKeyBase64.trim() !== "replace-me" &&
        this.config.githubAppPrivateKeyBase64.trim() !== "change-me",
    );
  }

  private resolvePrivateKey(): string {
    const raw = this.config.githubAppPrivateKeyBase64.trim();
    if (raw.includes("BEGIN")) {
      return raw;
    }

    return Buffer.from(raw, "base64").toString("utf8");
  }

  private createAppJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iat: now - 60,
        exp: now + 9 * 60,
        iss: this.config.githubAppId,
      },
      this.resolvePrivateKey(),
      { algorithm: "RS256" },
    );
  }

  async getAppMetadata(): Promise<GitHubAppMetadata | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const appJwt = this.createAppJwt();
    const response = await fetch("https://api.github.com/app", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Unable to load GitHub App metadata: ${response.status} ${text}`);
    }

    return (await response.json()) as GitHubAppMetadata;
  }

  async getInstallationToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const appJwt = this.createAppJwt();
    const response = await fetch(
      `https://api.github.com/app/installations/${this.config.githubAppInstallationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${appJwt}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Unable to mint GitHub installation token: ${response.status} ${text}`);
    }

    const body = (await response.json()) as { token?: string };
    return body.token ?? null;
  }
}
