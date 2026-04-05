export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export function indexTools(tools: ToolDefinition[]) {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
