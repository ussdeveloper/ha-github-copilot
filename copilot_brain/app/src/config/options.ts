import { config as loadDotEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

loadDotEnv({ path: path.resolve(process.cwd(), "../../.env") });

const PLACEHOLDER_VALUES = new Set(["", "replace-me", "change-me", "todo@example.com", "null", "undefined"]);

const DEFAULT_SERVICE_ALLOWLIST = [
  "light.turn_on", "light.turn_off", "light.toggle",
  "switch.turn_on", "switch.turn_off", "switch.toggle",
  "script.turn_on", "scene.turn_on",
  "climate.set_temperature", "climate.set_hvac_mode", "climate.turn_on", "climate.turn_off",
  "cover.open_cover", "cover.close_cover", "cover.stop_cover",
  "fan.turn_on", "fan.turn_off", "fan.toggle",
  "media_player.turn_on", "media_player.turn_off", "media_player.media_play", "media_player.media_pause", "media_player.volume_set",
  "automation.turn_on", "automation.turn_off", "automation.trigger",
  "input_boolean.turn_on", "input_boolean.turn_off", "input_boolean.toggle",
];

const appConfigSchema = z.object({
  port: z.coerce.number().default(8099),
  mcpPort: z.coerce.number().default(8099),
  approvalMode: z.enum(["explicit", "read-only"]).default("explicit"),
  githubAppId: z.string().default(""),
  githubAppInstallationId: z.string().default(""),
  githubAppPrivateKeyBase64: z.string().default(""),
  githubClientId: z.string().default(""),
  githubOauthToken: z.string().default(""),
  githubModelsDefaultModel: z.string().default("openai/gpt-4.1"),
  mcpAuthToken: z.string().default("change-me"),
  systemPromptTemplate: z.string().default(
    "You are the Home Assistant Copilot Brain. Be passive by default and only perform changes when explicitly asked. Available entities: {{entities_summary}} Available addons: {{addons_summary}}",
  ),
  entityAllowlist: z.array(z.string()).default([]),
  serviceAllowlist: z.array(z.string()).default([]),
  addonAllowlist: z.array(z.string()).default([]),
  haSupervisorUrl: z.string().default("http://supervisor"),
  haCoreUrl: z.string().default("http://supervisor/core/api"),
  supervisorToken: z.string().default(""),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

type PartialOptions = Partial<{
  github_app_id: string;
  github_app_installation_id: string;
  github_app_private_key: string;
  github_client_id: string;
  github_oauth_token: string;
  github_model: string;
  mcp_auth_token: string;
  approval_mode: "explicit" | "read-only";
  system_prompt_template: string;
  entity_allowlist: string[];
  service_allowlist: string[];
  addon_allowlist: string[];
}>;

export type SettingsInput = Partial<{
  github_app_id: string;
  github_app_installation_id: string;
  github_app_private_key: string;
  github_client_id: string;
  github_oauth_token: string;
  github_model: string;
  mcp_auth_token: string;
  approval_mode: "explicit" | "read-only";
  system_prompt_template: string;
  entity_allowlist: string[];
  service_allowlist: string[];
  addon_allowlist: string[];
}>;

function hasMeaningfulValue(value: unknown): value is string {
  return typeof value === "string" && !PLACEHOLDER_VALUES.has(value.trim());
}

function preferOptionOverEnv(optionValue: unknown, envValue: unknown): string | undefined {
  if (hasMeaningfulValue(optionValue)) {
    return optionValue;
  }

  if (hasMeaningfulValue(envValue)) {
    return envValue;
  }

  return undefined;
}

function normalizeApprovalMode(value: unknown): "explicit" | "read-only" | undefined {
  if (value === "explicit" || value === "read-only") {
    return value;
  }

  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function sanitizeOptions(raw: unknown): PartialOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const options = raw as Record<string, unknown>;

  return {
    github_app_id: hasMeaningfulValue(options.github_app_id) ? options.github_app_id : undefined,
    github_app_installation_id: hasMeaningfulValue(options.github_app_installation_id)
      ? options.github_app_installation_id
      : undefined,
    github_app_private_key: hasMeaningfulValue(options.github_app_private_key)
      ? options.github_app_private_key
      : undefined,
    github_client_id: hasMeaningfulValue(options.github_client_id) ? options.github_client_id : undefined,
    github_oauth_token: hasMeaningfulValue(options.github_oauth_token) ? options.github_oauth_token : undefined,
    github_model: hasMeaningfulValue(options.github_model) ? options.github_model : undefined,
    mcp_auth_token: hasMeaningfulValue(options.mcp_auth_token) ? options.mcp_auth_token : undefined,
    approval_mode: normalizeApprovalMode(options.approval_mode),
    system_prompt_template: hasMeaningfulValue(options.system_prompt_template)
      ? options.system_prompt_template
      : undefined,
    entity_allowlist: normalizeStringArray(options.entity_allowlist),
    service_allowlist: normalizeStringArray(options.service_allowlist),
    addon_allowlist: normalizeStringArray(options.addon_allowlist),
  };
}

export function resolveOptionsPath(): string {
  if (process.env.OPTIONS_JSON_PATH) {
    return process.env.OPTIONS_JSON_PATH;
  }

  if (process.platform !== "win32") {
    return "/data/options.json";
  }

  return path.resolve(process.cwd(), "../.data/options.json");
}

export function loadOptionsJson(): PartialOptions {
  const optionsPath = resolveOptionsPath();
  if (!existsSync(optionsPath)) {
    return {};
  }

  try {
    const raw = readFileSync(optionsPath, "utf8");
    return sanitizeOptions(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveOptionsJson(input: SettingsInput): PartialOptions {
  const optionsPath = resolveOptionsPath();
  const current = loadOptionsJson();
  const merged = {
    ...current,
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  } satisfies PartialOptions;

  if (input.github_app_private_key === "") {
    merged.github_app_private_key = current.github_app_private_key ?? "";
  }

  if (input.mcp_auth_token === "") {
    merged.mcp_auth_token = current.mcp_auth_token ?? "";
  }

  if (input.github_oauth_token === "") {
    merged.github_oauth_token = current.github_oauth_token ?? "";
  }

  mkdirSync(path.dirname(optionsPath), { recursive: true });
  writeFileSync(optionsPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function loadAppConfig(): AppConfig {
  const options = loadOptionsJson();

  return appConfigSchema.parse({
    port: process.env.PORT,
    mcpPort: process.env.MCP_PORT,
    approvalMode: normalizeApprovalMode(options.approval_mode) ?? normalizeApprovalMode(process.env.APPROVAL_MODE) ?? "explicit",
    githubAppId: preferOptionOverEnv(options.github_app_id, process.env.GITHUB_APP_ID),
    githubAppInstallationId: preferOptionOverEnv(
      options.github_app_installation_id,
      process.env.GITHUB_APP_INSTALLATION_ID,
    ),
    githubAppPrivateKeyBase64: preferOptionOverEnv(
      options.github_app_private_key,
      process.env.GITHUB_APP_PRIVATE_KEY_BASE64,
    ),
    githubClientId: preferOptionOverEnv(
      options.github_client_id,
      process.env.GITHUB_CLIENT_ID,
    ),
    githubOauthToken: preferOptionOverEnv(
      options.github_oauth_token,
      process.env.GITHUB_OAUTH_TOKEN,
    ),
    githubModelsDefaultModel: preferOptionOverEnv(
      options.github_model,
      process.env.GITHUB_MODELS_DEFAULT_MODEL,
    ),
    mcpAuthToken: preferOptionOverEnv(options.mcp_auth_token, process.env.MCP_AUTH_TOKEN),
    systemPromptTemplate: preferOptionOverEnv(
      options.system_prompt_template,
      process.env.SYSTEM_PROMPT_TEMPLATE,
    ),
    entityAllowlist: options.entity_allowlist ?? [],
    serviceAllowlist: options.service_allowlist?.length ? options.service_allowlist : DEFAULT_SERVICE_ALLOWLIST,
    addonAllowlist: options.addon_allowlist ?? [],
    haSupervisorUrl: process.env.HA_SUPERVISOR_URL,
    haCoreUrl: process.env.HA_CORE_URL,
    supervisorToken: process.env.SUPERVISOR_TOKEN,
  });
}

export function redactConfig(config: AppConfig) {
  return {
    ...config,
    githubAppPrivateKeyBase64: config.githubAppPrivateKeyBase64 ? "configured" : "",
    githubOauthToken: config.githubOauthToken ? "configured" : "",
    mcpAuthToken: config.mcpAuthToken ? "configured" : "",
    supervisorToken: config.supervisorToken ? "configured" : "",
  };
}

export function redactOptions(options: PartialOptions) {
  return {
    ...options,
    github_app_private_key: options.github_app_private_key ? "configured" : "",
    github_oauth_token: options.github_oauth_token ? "configured" : "",
    mcp_auth_token: options.mcp_auth_token ? "configured" : "",
  };
}
