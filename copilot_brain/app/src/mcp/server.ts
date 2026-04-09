import express, { type Request, type Response } from 'express';
import type { ToolDefinition } from '../tools/registry.js';
import type { SupervisorClient } from '../ha/supervisorClient.js';
import { summarizeAddons, summarizeStates } from '../prompt/template.js';

function unauthorized(response: Response) {
  response.status(401).json({ error: 'Unauthorized' });
}

export function createMcpRouter(options: {
  authToken: string;
  tools: ToolDefinition[];
  ha: SupervisorClient;
  version?: string;
}) {
  const router = express.Router();
  const toolMap = new Map(options.tools.map((tool) => [tool.name, tool]));

  router.use(express.json());
  router.use((request, response, next) => {
    const expected = `Bearer ${options.authToken}`;
    if (!options.authToken) {
      return unauthorized(response);
    }

    if (request.headers.authorization !== expected) {
      return unauthorized(response);
    }

    next();
  });

  router.post('/', async (request: Request, response: Response) => {
    const { id, method, params } = request.body as {
      id?: string | number;
      method?: string;
      params?: Record<string, unknown>;
    };

    try {
      switch (method) {
        case 'initialize':
          return response.json({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2026-03-26',
              serverInfo: {
                name: 'ha-copilot-brain',
                version: options.version ?? '0.4.3',
              },
              capabilities: {
                tools: {},
                resources: {},
              },
            },
          });
        case 'tools/list':
          return response.json({
            jsonrpc: '2.0',
            id,
            result: {
              tools: options.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              })),
            },
          });
        case 'tools/call': {
          const toolName = String(params?.name ?? '');
          const tool = toolMap.get(toolName);
          if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
          }
          const result = await tool.execute((params?.arguments as Record<string, unknown>) ?? {});
          return response.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          });
        }
        case 'resources/list': {
          return response.json({
            jsonrpc: '2.0',
            id,
            result: {
              resources: [
                {
                  uri: 'ha://entities/summary',
                  name: 'Home Assistant entity summary',
                  mimeType: 'text/plain',
                },
                {
                  uri: 'ha://addons/summary',
                  name: 'Home Assistant add-on summary',
                  mimeType: 'text/plain',
                },
              ],
            },
          });
        }
        case 'resources/read': {
          const uri = String(params?.uri ?? '');
          if (uri === 'ha://entities/summary') {
            const states = await options.ha.getStates();
            return response.json({
              jsonrpc: '2.0',
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'text/plain',
                    text: summarizeStates(states, 50),
                  },
                ],
              },
            });
          }

          if (uri === 'ha://addons/summary') {
            const addons = await options.ha.getAddons();
            return response.json({
              jsonrpc: '2.0',
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'text/plain',
                    text: summarizeAddons(addons, 20),
                  },
                ],
              },
            });
          }

          throw new Error(`Unknown resource: ${uri}`);
        }
        default:
          return response.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          });
      }
    } catch (error) {
      return response.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Unknown MCP error',
        },
      });
    }
  });

  return router;
}
