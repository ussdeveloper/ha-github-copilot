import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config/options.js";
import type { AuditStore } from "../audit/store.js";
import type { ApprovalStore, WorkspaceMutationApprovalPayload } from "../approval/store.js";
import type { ToolDefinition } from "./registry.js";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist"]);
const DEFAULT_READ_LINES = 200;
const MAX_READ_LINES = 2000;
const DEFAULT_MAX_RESULTS = 50;
const MAX_WRITE_LENGTH = 200_000;
const MAX_REPLACE_LENGTH = 100_000;

function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  const candidate = path.resolve(process.cwd(), "../..");
  return existsSync(candidate) ? candidate : process.cwd();
}

function ensureInsideWorkspace(inputPath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(workspaceRoot, inputPath || ".");
  const relative = path.relative(workspaceRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the workspace root.");
  }

  return resolved;
}

function toWorkspaceRelative(filePath: string): string {
  return path.relative(getWorkspaceRoot(), filePath).replace(/\\/g, "/") || ".";
}

function clampLineRange(startLine: number | undefined, endLine: number | undefined, totalLines: number) {
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(totalLines, endLine ?? Math.min(totalLines, start + DEFAULT_READ_LINES - 1));
  if (end < start) {
    throw new Error("Invalid line range.");
  }

  if (end - start + 1 > MAX_READ_LINES) {
    throw new Error(`Too many lines requested. Max ${MAX_READ_LINES} lines.`);
  }

  return { start, end };
}

function listFilesRecursive(root: string, includeDirectories = false): string[] {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        if (includeDirectories) {
          results.push(fullPath);
        }
        stack.push(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/");
  let pattern = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (char === "?") {
      pattern += ".";
      continue;
    }

    pattern += escapeRegExp(char);
  }

  pattern += "$";
  return new RegExp(pattern, "i");
}

function createPathMatcher(query: string): (relativePath: string) => boolean {
  const normalizedQuery = query.trim().replace(/\\/g, "/");
  if (!normalizedQuery) {
    return () => false;
  }

  if (/[*?]/.test(normalizedQuery)) {
    const matcher = globToRegExp(normalizedQuery);
    const matchBasenameOnly = !normalizedQuery.includes("/");
    return (relativePath: string) => {
      if (matcher.test(relativePath)) {
        return true;
      }

      if (matchBasenameOnly) {
        const baseName = path.posix.basename(relativePath);
        return matcher.test(baseName);
      }

      return false;
    };
  }

  const tokens = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  return (relativePath: string) => {
    const haystack = relativePath.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  };
}

function readTextFile(filePath: string): string {
  const content = readFileSync(filePath, "utf8");
  if (content.includes("\u0000")) {
    throw new Error("Binary files are not supported by workspace tools.");
  }
  return content;
}

function ensureMutableWorkspace(config: AppConfig): void {
  if (config.approvalMode === "read-only") {
    throw new Error("Add-on is configured in read-only mode.");
  }
}

export type PreparedWorkspaceMutation =
  | {
      operation: "write_file";
      path: string;
      content: string;
      overwrite: boolean;
      summary: string;
    }
  | {
      operation: "replace_in_file";
      path: string;
      oldText: string;
      newText: string;
      replaceAll: boolean;
      summary: string;
    };

export function prepareWorkspaceWriteFile(
  config: AppConfig,
  input: Record<string, unknown>,
): Extract<PreparedWorkspaceMutation, { operation: "write_file" }> {
  ensureMutableWorkspace(config);
  const rawPath = String(input.path ?? "").trim();
  if (!rawPath) {
    throw new Error("write_file path is required.");
  }

  const content = String(input.content ?? "");
  if (content.length > MAX_WRITE_LENGTH) {
    throw new Error(`write_file content is too large. Max ${MAX_WRITE_LENGTH} characters.`);
  }

  const overwrite = Boolean(input.overwrite);
  const targetPath = ensureInsideWorkspace(rawPath);
  if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
    throw new Error("Cannot write to a directory path.");
  }

  return {
    operation: "write_file",
    path: toWorkspaceRelative(targetPath),
    content,
    overwrite,
    summary: `Write file: ${toWorkspaceRelative(targetPath)}`,
  };
}

export function prepareWorkspaceReplaceInFile(
  config: AppConfig,
  input: Record<string, unknown>,
): Extract<PreparedWorkspaceMutation, { operation: "replace_in_file" }> {
  ensureMutableWorkspace(config);
  const rawPath = String(input.path ?? "").trim();
  if (!rawPath) {
    throw new Error("replace_in_file path is required.");
  }

  const oldText = String(input.oldText ?? "");
  const newText = String(input.newText ?? "");
  if (!oldText) {
    throw new Error("replace_in_file oldText is required.");
  }
  if (oldText.length > MAX_REPLACE_LENGTH || newText.length > MAX_REPLACE_LENGTH) {
    throw new Error(`replace_in_file oldText/newText is too large. Max ${MAX_REPLACE_LENGTH} characters each.`);
  }

  const replaceAll = Boolean(input.replaceAll);
  const targetPath = ensureInsideWorkspace(rawPath);
  if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
    throw new Error("replace_in_file target file does not exist.");
  }

  return {
    operation: "replace_in_file",
    path: toWorkspaceRelative(targetPath),
    oldText,
    newText,
    replaceAll,
    summary: `Replace text in file: ${toWorkspaceRelative(targetPath)}`,
  };
}

export async function executeWorkspaceMutation(
  audit: AuditStore,
  mutation: WorkspaceMutationApprovalPayload,
): Promise<Record<string, unknown>> {
  const targetPath = ensureInsideWorkspace(mutation.path);

  if (mutation.operation === "write_file") {
    const existed = existsSync(targetPath);
    if (existed && statSync(targetPath).isDirectory()) {
      throw new Error("Cannot write to a directory path.");
    }
    if (existed && !mutation.overwrite) {
      throw new Error(`File ${mutation.path} already exists. Set overwrite=true to replace it.`);
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, mutation.content, "utf8");
    const result = {
      operation: mutation.operation,
      path: mutation.path,
      bytesWritten: Buffer.byteLength(mutation.content, "utf8"),
      overwritten: existed,
    };
    audit.add("tool_call", `Wrote file ${mutation.path}`, result);
    return result;
  }

  const source = readTextFile(targetPath);
  const occurrences = source.split(mutation.oldText).length - 1;
  if (occurrences === 0) {
    throw new Error(`Text to replace was not found in ${mutation.path}.`);
  }
  if (!mutation.replaceAll && occurrences !== 1) {
    throw new Error(`Text to replace appears ${occurrences} times in ${mutation.path}. Use replaceAll=true or provide a more specific oldText.`);
  }

  const output = mutation.replaceAll
    ? source.split(mutation.oldText).join(mutation.newText)
    : source.replace(mutation.oldText, mutation.newText);
  const replacedCount = mutation.replaceAll ? occurrences : 1;
  writeFileSync(targetPath, output, "utf8");
  const result = {
    operation: mutation.operation,
    path: mutation.path,
    replacedCount,
  };
  audit.add("tool_call", `Replaced text in file ${mutation.path}`, result);
  return result;
}

export function createWorkspaceTools(
  config: AppConfig,
  audit: AuditStore,
  approvals: ApprovalStore,
): ToolDefinition[] {
  return [
    {
      name: "workspace.list_dir",
      description: "List files and folders in a workspace directory.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path inside the workspace. Defaults to '.'" },
        },
      },
      execute: async (input) => {
        const targetPath = ensureInsideWorkspace(String(input.path ?? "."));
        const entries = readdirSync(targetPath, { withFileTypes: true })
          .filter((entry) => !EXCLUDED_DIRS.has(entry.name))
          .map((entry) => ({
            name: entry.isDirectory() ? `${entry.name}/` : entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          }));
        audit.add("tool_call", `Listed directory ${toWorkspaceRelative(targetPath)}`, { count: entries.length });
        return {
          path: toWorkspaceRelative(targetPath),
          entries,
        };
      },
    },
    {
      name: "workspace.read_file",
      description: "Read a text file from the workspace. Supports optional line ranges.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          startLine: { type: "number", description: "1-based start line." },
          endLine: { type: "number", description: "1-based end line." },
        },
        required: ["path"],
      },
      execute: async (input) => {
        const targetPath = ensureInsideWorkspace(String(input.path ?? ""));
        if (!statSync(targetPath).isFile()) {
          throw new Error("Requested path is not a file.");
        }
        const text = readTextFile(targetPath);
        const lines = text.split(/\r?\n/);
        const { start, end } = clampLineRange(
          typeof input.startLine === "number" ? input.startLine : undefined,
          typeof input.endLine === "number" ? input.endLine : undefined,
          lines.length,
        );
        const excerpt = lines.slice(start - 1, end).join("\n");
        audit.add("tool_call", `Read file ${toWorkspaceRelative(targetPath)}`, { startLine: start, endLine: end });
        return {
          path: toWorkspaceRelative(targetPath),
          startLine: start,
          endLine: end,
          content: excerpt,
        };
      },
    },
    {
      name: "workspace.file_search",
      description: "Find workspace files by glob pattern or simple path/name fragments, for example 'src/**/*.ts', '**/*shell*.*', or 'shell src/tools'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Glob-like query or plain path/name fragments relative to the workspace root." },
          maxResults: { type: "number", description: "Maximum number of paths to return." },
        },
        required: ["query"],
      },
      execute: async (input) => {
        const query = String(input.query ?? "").trim();
        if (!query) {
          throw new Error("file_search query is required.");
        }
        const maxResults = Math.max(1, Math.min(200, Number(input.maxResults ?? DEFAULT_MAX_RESULTS)));
        const matcher = createPathMatcher(query);
        const files = listFilesRecursive(getWorkspaceRoot(), true)
          .map((filePath) => toWorkspaceRelative(filePath))
          .filter((relativePath) => matcher(relativePath))
          .slice(0, maxResults);
        audit.add("tool_call", `Searched files with glob ${query}`, { count: files.length });
        return { query, paths: files };
      },
    },
    {
      name: "workspace.grep_search",
      description: "Search text within workspace files using plain text or regex.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Plain text or regex pattern to search for." },
          isRegexp: { type: "boolean", description: "Whether query should be treated as a regex." },
          includePattern: { type: "string", description: "Optional glob-like file filter, e.g. 'src/**/*.ts'." },
          maxResults: { type: "number", description: "Maximum number of matches to return." },
        },
        required: ["query"],
      },
      execute: async (input) => {
        const query = String(input.query ?? "");
        if (!query) {
          throw new Error("grep_search query is required.");
        }
        const isRegexp = Boolean(input.isRegexp);
        const includePattern = typeof input.includePattern === "string" && input.includePattern.trim()
          ? globToRegExp(String(input.includePattern))
          : null;
        const maxResults = Math.max(1, Math.min(200, Number(input.maxResults ?? DEFAULT_MAX_RESULTS)));
        const matcher = isRegexp ? new RegExp(query, "i") : new RegExp(escapeRegExp(query), "i");

        const matches: Array<{ path: string; line: number; text: string }> = [];
        const files = listFilesRecursive(getWorkspaceRoot());
        for (const filePath of files) {
          const relativePath = toWorkspaceRelative(filePath);
          if (includePattern && !includePattern.test(relativePath)) {
            continue;
          }

          let content = "";
          try {
            content = readTextFile(filePath);
          } catch {
            continue;
          }
          const lines = content.split(/\r?\n/);
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            if (matcher.test(lines[lineIndex])) {
              matches.push({
                path: relativePath,
                line: lineIndex + 1,
                text: lines[lineIndex].slice(0, 300),
              });
              if (matches.length >= maxResults) {
                audit.add("tool_call", `Searched text ${query}`, { count: matches.length });
                return { query, matches };
              }
            }
          }
        }

        audit.add("tool_call", `Searched text ${query}`, { count: matches.length });
        return { query, matches };
      },
    },
    {
      name: "workspace.write_file",
      description: "Create or overwrite a text file in the workspace. Use only when the user explicitly asks to create or modify a file.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          content: { type: "string", description: "Full file contents to write." },
          overwrite: { type: "boolean", description: "Overwrite an existing file when true." },
        },
        required: ["path", "content"],
      },
      execute: async (input) => {
        const mutation = prepareWorkspaceWriteFile(config, input);
        if (config.approvalMode === "explicit") {
          const approval = approvals.createWorkspaceMutation(mutation.summary, {
            operation: mutation.operation,
            path: mutation.path,
            content: mutation.content,
            overwrite: mutation.overwrite,
          });
          audit.add("tool_call", `Queued workspace mutation approval ${mutation.path}`, { approvalId: approval.id, operation: mutation.operation });
          return {
            status: "pending_approval",
            approvalId: approval.id,
            summary: mutation.summary,
          };
        }

        return executeWorkspaceMutation(audit, {
          operation: mutation.operation,
          path: mutation.path,
          content: mutation.content,
          overwrite: mutation.overwrite,
        });
      },
    },
    {
      name: "workspace.replace_in_file",
      description: "Replace exact text in a workspace file. Use only when the user explicitly asks to edit an existing file.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path inside the workspace." },
          oldText: { type: "string", description: "Exact text to replace." },
          newText: { type: "string", description: "Replacement text." },
          replaceAll: { type: "boolean", description: "Replace all occurrences when true." },
        },
        required: ["path", "oldText", "newText"],
      },
      execute: async (input) => {
        const mutation = prepareWorkspaceReplaceInFile(config, input);
        if (config.approvalMode === "explicit") {
          const approval = approvals.createWorkspaceMutation(mutation.summary, {
            operation: mutation.operation,
            path: mutation.path,
            oldText: mutation.oldText,
            newText: mutation.newText,
            replaceAll: mutation.replaceAll,
          });
          audit.add("tool_call", `Queued workspace mutation approval ${mutation.path}`, { approvalId: approval.id, operation: mutation.operation });
          return {
            status: "pending_approval",
            approvalId: approval.id,
            summary: mutation.summary,
          };
        }

        return executeWorkspaceMutation(audit, {
          operation: mutation.operation,
          path: mutation.path,
          oldText: mutation.oldText,
          newText: mutation.newText,
          replaceAll: mutation.replaceAll,
        });
      },
    },
  ];
}