import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppConfig } from "../config/options.js";
import type { AuditStore } from "../audit/store.js";

const execFileAsync = promisify(execFile);
const SHELL_TIMEOUT_MS = 30_000;
const SHELL_MAX_BUFFER = 256 * 1024;

export interface PreparedShellCommand {
  command: string;
  summary: string;
}

export interface ShellCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export function prepareShellCommand(config: AppConfig, input: Record<string, unknown>): PreparedShellCommand {
  if (config.approvalMode === "read-only") {
    throw new Error("Add-on is configured in read-only mode.");
  }

  const command = String(input.command ?? "").trim();
  if (!command) {
    throw new Error("Shell command is required.");
  }

  if (command.length > 1000) {
    throw new Error("Shell command is too long (max 1000 characters).");
  }

  if (/\0/.test(command)) {
    throw new Error("Shell command contains an invalid null byte.");
  }

  if (/\r|\n/.test(command)) {
    throw new Error("Shell command must be a single line.");
  }

  return {
    command,
    summary: `Run shell command: ${command.slice(0, 140)}`,
  };
}

export async function executePreparedShellCommand(
  audit: AuditStore,
  command: PreparedShellCommand,
): Promise<ShellCommandResult> {
  const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", command.command]
    : ["-lc", command.command];

  try {
    const { stdout, stderr } = await execFileAsync(shell, args, {
      timeout: SHELL_TIMEOUT_MS,
      maxBuffer: SHELL_MAX_BUFFER,
    });

    const result: ShellCommandResult = {
      command: command.command,
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
    audit.add("tool_call", `Executed shell command ${command.command.slice(0, 120)}`, {
      exitCode: result.exitCode,
    });
    return result;
  } catch (error) {
    const execError = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };

    const timedOut = execError.killed || execError.signal === "SIGTERM";
    const exitCode = typeof execError.code === "number" ? execError.code : 1;
    const result: ShellCommandResult = {
      command: command.command,
      exitCode,
      stdout: String(execError.stdout ?? "").trim(),
      stderr: String(execError.stderr ?? execError.message ?? "Unknown shell error").trim(),
      timedOut,
    };
    audit.add("error", `Shell command failed ${command.command.slice(0, 120)}`, {
      exitCode: result.exitCode,
      timedOut,
      stderr: result.stderr,
    });
    return result;
  }
}