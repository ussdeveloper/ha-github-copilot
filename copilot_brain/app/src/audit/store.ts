import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface AuditEntry {
  id: string;
  createdAt: string;
  type: "chat" | "tool_call" | "error";
  summary: string;
  detail?: unknown;
}

export class AuditStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? this.resolveDefaultPath();
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, "[]", "utf8");
    }
  }

  private resolveDefaultPath(): string {
    const dockerDataPath = "/data/copilot-brain-audit.json";
    if (process.platform !== "win32") {
      return dockerDataPath;
    }

    return path.resolve(process.cwd(), "../.data/copilot-brain-audit.json");
  }

  private readAll(): AuditEntry[] {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      return JSON.parse(raw) as AuditEntry[];
    } catch {
      return [];
    }
  }

  private writeAll(entries: AuditEntry[]) {
    writeFileSync(this.filePath, JSON.stringify(entries.slice(-200), null, 2), "utf8");
  }

  add(type: AuditEntry["type"], summary: string, detail?: unknown): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type,
      summary,
      detail,
    };

    const entries = this.readAll();
    entries.push(entry);
    this.writeAll(entries);
    return entry;
  }

  list(): AuditEntry[] {
    return this.readAll().reverse();
  }
}
