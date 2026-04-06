import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAppConfig,
  loadOptionsJson,
  redactConfig,
  redactOptions,
  saveOptionsJson,
  type SettingsInput,
} from './config/options.js';
import { GitHubAppAuth } from './auth/githubApp.js';
import { GitHubModelsClient } from './github/modelsClient.js';
import { SupervisorClient } from './ha/supervisorClient.js';
import { AuditStore } from './audit/store.js';
import { ApprovalStore } from './approval/store.js';
import { createHomeAssistantTools } from './tools/homeAssistantTools.js';
import { executePreparedServiceCall, prepareServiceCall } from './tools/homeAssistantActions.js';
import { createNodeRedTools } from './tools/nodeRedTools.js';
import { createMcpRouter } from './mcp/server.js';
import { ChatOrchestrator } from './chat/orchestrator.js';
import { summarizeAddons, summarizeStates } from './prompt/template.js';

const APP_VERSION = '0.3.0';
const APP_STAGE = 'experimental';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function toSettingsPayload(body: Record<string, unknown>): SettingsInput {
  return {
    github_app_id: typeof body.github_app_id === 'string' ? body.github_app_id : undefined,
    github_app_installation_id:
      typeof body.github_app_installation_id === 'string' ? body.github_app_installation_id : undefined,
    github_app_private_key:
      typeof body.github_app_private_key === 'string' ? body.github_app_private_key : undefined,
    github_model: typeof body.github_model === 'string' ? body.github_model : undefined,
    mcp_auth_token: typeof body.mcp_auth_token === 'string' ? body.mcp_auth_token : undefined,
    approval_mode:
      body.approval_mode === 'explicit' || body.approval_mode === 'read-only'
        ? body.approval_mode
        : undefined,
    system_prompt_template:
      typeof body.system_prompt_template === 'string' ? body.system_prompt_template : undefined,
    entity_allowlist: body.entity_allowlist !== undefined ? normalizeStringList(body.entity_allowlist) : undefined,
    service_allowlist:
      body.service_allowlist !== undefined ? normalizeStringList(body.service_allowlist) : undefined,
    addon_allowlist: body.addon_allowlist !== undefined ? normalizeStringList(body.addon_allowlist) : undefined,
  };
}

function createRuntime(audit: AuditStore, approvals: ApprovalStore) {
  const config = loadAppConfig();
  const auth = new GitHubAppAuth(config);
  const models = new GitHubModelsClient(() => auth.getInstallationToken());
  const ha = new SupervisorClient(config);
  const tools = [
    ...createHomeAssistantTools(config, ha, audit, approvals),
    ...createNodeRedTools(config, ha, audit),
  ];
  const chat = new ChatOrchestrator(config, ha, models, audit, tools);
  const mcpRouter = createMcpRouter({ authToken: config.mcpAuthToken, tools, ha, version: APP_VERSION });

  return {
    config,
    auth,
    models,
    ha,
    tools,
    chat,
    mcpRouter,
  };
}

type Runtime = ReturnType<typeof createRuntime>;

interface TerminalCommandResult {
  ok: boolean;
  output: string;
  exitCode?: number;
  clear?: boolean;
  meta?: Record<string, unknown>;
}

function clampNumber(value: string | undefined, fallback: number, max = 100): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(parsed, max));
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatList(lines: string[], emptyLabel: string): string {
  return lines.length > 0 ? lines.join('\n') : emptyLabel;
}

function parseTerminalJson(rawValue: string): Record<string, unknown> {
  if (!rawValue.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('JSON payload is invalid. Example: service light.turn_on light.office {"brightness":180}');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON payload must be an object.');
  }

  return parsed as Record<string, unknown>;
}

function parseServiceCommand(command: string) {
  const remainder = command.replace(/^service\s+/i, '').trim();
  if (!remainder) {
    throw new Error('Usage: service <domain.service> <entity_id> {json}');
  }

  const firstSpace = remainder.indexOf(' ');
  if (firstSpace === -1) {
    return { service: remainder, entityId: undefined, rawData: '' };
  }

  const service = remainder.slice(0, firstSpace).trim();
  const rest = remainder.slice(firstSpace + 1).trim();
  if (!rest) {
    return { service, entityId: undefined, rawData: '' };
  }

  if (rest.startsWith('{')) {
    return { service, entityId: undefined, rawData: rest };
  }

  const secondSpace = rest.indexOf(' ');
  if (secondSpace === -1) {
    return { service, entityId: rest, rawData: '' };
  }

  return {
    service,
    entityId: rest.slice(0, secondSpace).trim(),
    rawData: rest.slice(secondSpace + 1).trim(),
  };
}

function renderTerminalHelp(): string {
  return [
    'Copilot Brain HA terminal commands',
    '',
    '═══ Basic ═══',
    'help                        Show this help',
    'status                      Service & connection status',
    'clear                       Clear terminal',
    '',
    '═══ Home Assistant ═══',
    'entities [limit]            List entities',
    'entity <entity_id>          Inspect single entity',
    'context                     Entities & addons summary',
    'addons                      List installed add-ons',
    'nodered                     Node-RED addon status',
    'service <svc> <eid> {json}  Call a service',
    '',
    '═══ System ═══',
    'system                      Supervisor info',
    'host                        Host/OS details',
    'network                     Network interfaces',
    'hardware                    Hardware info',
    'logs core [lines]           HA Core logs',
    'logs supervisor [lines]     Supervisor logs',
    'logs <addon_slug> [lines]   Add-on logs',
    'stats <addon_slug>          Add-on resource stats',
    '',
    '═══ Tools ═══',
    'approvals                   List pending approvals',
    'approve <id>                Approve pending action',
    'reject <id>                 Reject pending action',
    'audit [limit]               Show audit log',
    'models                      Available AI models',
    'github                      GitHub connection info',
    'config                      Current config (redacted)',
  ].join('\n');
}

async function approvePendingAction(id: string, runtime: Runtime, audit: AuditStore, approvals: ApprovalStore) {
  const approval = approvals.get(id);
  if (!approval) {
    throw new Error(`Approval ${id} not found.`);
  }

  if (approval.status !== 'pending') {
    throw new Error(`Approval ${id} is already ${approval.status}.`);
  }

  const call = prepareServiceCall(runtime.config, {
    service: approval.payload.service,
    entity_id: approval.payload.entityIds,
    data: approval.payload.serviceData,
  });

  const result = await executePreparedServiceCall(runtime.ha, audit, call);
  const resolved = approvals.resolve(id, 'approved');
  audit.add('tool_call', `Approved pending action ${id}`, resolved.payload);
  return { approval: resolved, result };
}

function rejectPendingAction(id: string, audit: AuditStore, approvals: ApprovalStore) {
  const resolved = approvals.resolve(id, 'rejected');
  audit.add('tool_call', `Rejected pending action ${id}`, resolved.payload);
  return { approval: resolved };
}

async function executeTerminalCommand(
  command: string,
  runtime: Runtime,
  audit: AuditStore,
  approvals: ApprovalStore,
): Promise<TerminalCommandResult> {
  const trimmed = command.trim();
  if (!trimmed) {
    return { ok: false, output: 'No command provided.', exitCode: 64 };
  }

  const [action, ...args] = trimmed.split(/\s+/);
  const normalizedAction = action.toLowerCase();

  switch (normalizedAction) {
    case 'help':
      return { ok: true, output: renderTerminalHelp() };

    case 'clear':
      return { ok: true, output: 'Terminal cleared.', clear: true };

    case 'status': {
      const pendingCount = approvals.list().filter((entry) => entry.status === 'pending').length;
      return {
        ok: true,
        output: [
          `Copilot Brain ${APP_VERSION} (${APP_STAGE})`,
          `Home Assistant mode: ${runtime.ha.isLive() ? 'live supervisor connection' : 'mock development mode'}`,
          `GitHub App: ${runtime.auth.isConfigured() ? 'configured' : 'not configured'}`,
          `Selected model: ${runtime.config.githubModelsDefaultModel}`,
          `Approval mode: ${runtime.config.approvalMode}`,
          `Pending approvals: ${pendingCount}`,
          `MCP auth token: ${runtime.config.mcpAuthToken ? 'configured' : 'missing'}`,
        ].join('\n'),
      };
    }

    case 'context': {
      const [states, addons] = await Promise.all([runtime.ha.getStates(), runtime.ha.getAddons()]);
      return {
        ok: true,
        output: [
          'Entities summary',
          summarizeStates(states, 30),
          '',
          'Add-ons summary',
          summarizeAddons(addons, 15),
        ].join('\n'),
      };
    }

    case 'entities': {
      const limit = clampNumber(args[0], 20, 100);
      const states = await runtime.ha.getStates();
      return {
        ok: true,
        output: formatList(
          states.slice(0, limit).map((state) => `${state.entity_id} = ${state.state}`),
          'No entities returned by Home Assistant.',
        ),
      };
    }

    case 'entity': {
      const entityId = args.join(' ').trim();
      if (!entityId) {
        return { ok: false, output: 'Usage: entity <entity_id>', exitCode: 64 };
      }

      const entity = await runtime.ha.getEntity(entityId);
      if (!entity) {
        return { ok: false, output: `Entity ${entityId} not found.`, exitCode: 1 };
      }

      return { ok: true, output: formatJson(entity) };
    }

    case 'addons': {
      const addons = await runtime.ha.getAddons();
      return {
        ok: true,
        output: formatList(
          addons.map((addon) => `${addon.slug} · ${addon.name} · ${addon.state ?? 'unknown'} · ${addon.version ?? 'n/a'}`),
          'No add-ons returned by Supervisor.',
        ),
      };
    }

    case 'nodered': {
      const addons = await runtime.ha.getAddons();
      const nodeRedAddons = addons.filter((addon) => {
        const haystack = `${addon.slug} ${addon.name}`.toLowerCase();
        return haystack.includes('nodered') || haystack.includes('node-red');
      });

      return {
        ok: true,
        output: formatList(
          nodeRedAddons.map((addon) => `${addon.name} (${addon.slug}) · ${addon.state ?? 'unknown'}`),
          'Node-RED add-on not found.',
        ),
      };
    }

    case 'service': {
      const { service, entityId, rawData } = parseServiceCommand(trimmed);
      const data = parseTerminalJson(rawData);
      const tool = runtime.tools.find((candidate) => candidate.name === 'ha.call_service');
      if (!tool) {
        throw new Error('ha.call_service tool is not available.');
      }

      const result = await tool.execute({
        service,
        entity_id: entityId,
        data,
      });

      const pending = result as { status?: string; approvalId?: string; summary?: string } | undefined;
      if (pending?.status === 'pending_approval') {
        return {
          ok: true,
          output: [
            'Request queued for approval.',
            `Approval ID: ${pending.approvalId ?? 'unknown'}`,
            `Summary: ${pending.summary ?? service}`,
          ].join('\n'),
          meta: {
            approvalId: pending.approvalId,
          },
        };
      }

      return {
        ok: true,
        output: [
          `Executed ${service}${entityId ? ` for ${entityId}` : ''}.`,
          '',
          formatJson(result),
        ].join('\n'),
      };
    }

    case 'approvals': {
      const entries = approvals.list();
      return {
        ok: true,
        output: formatList(
          entries.map((entry) => `${entry.id} · ${entry.status} · ${entry.summary}`),
          'No approval entries recorded.',
        ),
      };
    }

    case 'approve': {
      const id = args[0];
      if (!id) {
        return { ok: false, output: 'Usage: approve <approval_id>', exitCode: 64 };
      }

      const result = await approvePendingAction(id, runtime, audit, approvals);
      return {
        ok: true,
        output: [
          `Approval ${id} approved.`,
          '',
          formatJson(result),
        ].join('\n'),
      };
    }

    case 'reject': {
      const id = args[0];
      if (!id) {
        return { ok: false, output: 'Usage: reject <approval_id>', exitCode: 64 };
      }

      const result = rejectPendingAction(id, audit, approvals);
      return {
        ok: true,
        output: [
          `Approval ${id} rejected.`,
          '',
          formatJson(result),
        ].join('\n'),
      };
    }

    case 'audit': {
      const limit = clampNumber(args[0], 10, 50);
      const entries = audit.list().slice(0, limit);
      return {
        ok: true,
        output: formatList(
          entries.map((entry) => `${entry.createdAt} · ${entry.type} · ${entry.summary}`),
          'Audit log is empty.',
        ),
      };
    }

    case 'models': {
      const modelsList = await runtime.models.listModels(runtime.config.githubModelsDefaultModel);
      return { ok: true, output: formatJson(modelsList) };
    }

    case 'github': {
      return {
        ok: true,
        output: formatJson({
          configured: runtime.auth.isConfigured(),
          installationId: runtime.config.githubAppInstallationId,
          selectedModel: runtime.config.githubModelsDefaultModel,
        }),
      };
    }

    case 'config': {
      return {
        ok: true,
        output: formatJson(redactConfig(runtime.config)),
      };
    }

    case 'system': {
      const info = await runtime.ha.getSupervisorInfo();
      return { ok: true, output: formatJson(info) };
    }

    case 'host': {
      const [hostInfo, osInfo] = await Promise.all([
        runtime.ha.getHostInfo(),
        runtime.ha.getOsInfo(),
      ]);
      return {
        ok: true,
        output: [
          'Host info',
          formatJson(hostInfo),
          '',
          'OS info',
          formatJson(osInfo),
        ].join('\n'),
      };
    }

    case 'network': {
      const info = await runtime.ha.getNetworkInfo();
      return { ok: true, output: formatJson(info) };
    }

    case 'hardware': {
      const info = await runtime.ha.getHardwareInfo();
      return { ok: true, output: formatJson(info) };
    }

    case 'logs': {
      const target = args[0] ?? 'core';
      const lines = clampNumber(args[1], 50, 500);
      let logText: string;
      if (target === 'core') {
        logText = await runtime.ha.getCoreLogs(lines);
      } else if (target === 'supervisor') {
        logText = await runtime.ha.getSupervisorLogs(lines);
      } else {
        logText = await runtime.ha.getAddonLogs(target, lines);
      }
      return { ok: true, output: logText || '(empty)' };
    }

    case 'stats': {
      const slug = args[0];
      if (!slug) {
        return { ok: false, output: 'Usage: stats <addon_slug>', exitCode: 64 };
      }
      const info = await runtime.ha.getAddonStats(slug);
      return { ok: true, output: formatJson(info) };
    }

    default:
      return {
        ok: false,
        output: `Unknown command: ${normalizedAction}. Run help to list supported commands.`,
        exitCode: 127,
      };
  }
}

async function bootstrap() {
  const audit = new AuditStore();
  const approvals = new ApprovalStore();

  let runtime = createRuntime(audit, approvals);

  const rebuildRuntime = () => {
    runtime = createRuntime(audit, approvals);
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(publicDir));

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'copilot-brain',
      version: APP_VERSION,
      stage: APP_STAGE,
      time: new Date().toISOString(),
    });
  });

  app.get('/api/config', (_request, response) => {
    response.json({
      config: redactConfig(runtime.config),
      githubAppConfigured: runtime.auth.isConfigured(),
      haLive: runtime.ha.isLive(),
    });
  });

  app.get('/api/settings', (_request, response) => {
    response.json({
      settings: redactOptions(loadOptionsJson()),
      effectiveConfig: redactConfig(runtime.config),
    });
  });

  app.get('/api/github/status', async (_request, response) => {
    try {
      const configured = runtime.auth.isConfigured();
      if (!configured) {
        return response.json({
          ok: false,
          configured,
          message: 'GitHub App credentials are incomplete or still use placeholder values.',
        });
      }

      const metadata = await runtime.auth.getAppMetadata();
      response.json({
        ok: true,
        configured,
        app: metadata,
        installationId: runtime.config.githubAppInstallationId,
        selectedModel: runtime.config.githubModelsDefaultModel,
      });
    } catch (error) {
      response.status(500).json({
        ok: false,
        configured: runtime.auth.isConfigured(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.post('/api/github/test-auth', async (_request, response) => {
    try {
      if (!runtime.auth.isConfigured()) {
        return response.status(400).json({
          ok: false,
          error: 'GitHub App credentials are not configured.',
        });
      }

      const [metadata, installationToken, modelAccess] = await Promise.all([
        runtime.auth.getAppMetadata(),
        runtime.auth.getInstallationToken(),
        runtime.models.testAccess(runtime.config.githubModelsDefaultModel),
      ]);

      const result = {
        ok: Boolean(installationToken),
        app: metadata,
        installationTokenIssued: Boolean(installationToken),
        selectedModel: runtime.config.githubModelsDefaultModel,
        modelAccess,
      };
      audit.add('tool_call', 'Tested GitHub App authentication', result);
      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      audit.add('error', 'GitHub App auth test failed', { message });
      response.status(500).json({ ok: false, error: message });
    }
  });

  app.put('/api/settings', (request, response) => {
    try {
      const body = request.body as Record<string, unknown>;
      const saved = saveOptionsJson(toSettingsPayload(body));
      rebuildRuntime();
      audit.add('tool_call', 'Updated add-on settings', {
        keys: Object.keys(body),
      });
      response.json({
        ok: true,
        settings: redactOptions(saved),
        effectiveConfig: redactConfig(runtime.config),
      });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/models', async (_request, response) => {
    try {
      const modelsList = await runtime.models.listModels(runtime.config.githubModelsDefaultModel);
      response.json({ models: modelsList, selected: runtime.config.githubModelsDefaultModel });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/context', async (_request, response) => {
    try {
      const [states, addons] = await Promise.all([runtime.ha.getStates(), runtime.ha.getAddons()]);
      response.json({
        entitiesSummary: summarizeStates(states, 50),
        addonsSummary: summarizeAddons(addons, 20),
        entities: states.slice(0, 100),
        addons,
      });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/audit', (_request, response) => {
    response.json({ entries: audit.list() });
  });

  app.get('/api/approvals', (_request, response) => {
    response.json({ entries: approvals.list() });
  });

  app.post('/api/approvals/:id/approve', async (request, response) => {
    try {
      const id = String(request.params.id);
      const result = await approvePendingAction(id, runtime, audit, approvals);
      response.json({ ok: true, ...result });
    } catch (error) {
      audit.add('error', 'Approval execution failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/approvals/:id/reject', (request, response) => {
    try {
      const id = String(request.params.id);
      const result = rejectPendingAction(id, audit, approvals);
      response.json({ ok: true, ...result });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/chat', async (request, response) => {
    try {
      const message = String(request.body?.message ?? '');
      const result = await runtime.chat.handleUserMessage(message);
      response.json(result);
    } catch (error) {
      audit.add('error', 'Chat request failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      response.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/terminal/execute', async (request, response) => {
    try {
      const command = String(request.body?.command ?? '');
      const result = await executeTerminalCommand(command, runtime, audit, approvals);
      audit.add('tool_call', `Terminal command: ${command.trim().slice(0, 120) || '(empty)'}`, {
        ok: result.ok,
        exitCode: result.exitCode ?? 0,
      });
      response.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown terminal error';
      audit.add('error', 'Terminal command failed', { message });
      response.status(500).json({ ok: false, output: message, exitCode: 1 });
    }
  });

  app.use('/mcp', (request, response, next) => runtime.mcpRouter(request, response, next));

  app.get('*', (_request, response) => {
    response.sendFile(path.join(publicDir, 'index.html'));
  });

  app.listen(runtime.config.port, () => {
    console.log(`Copilot Brain ${APP_VERSION} (${APP_STAGE}) listening on port ${runtime.config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start Copilot Brain', error);
  process.exitCode = 1;
});
