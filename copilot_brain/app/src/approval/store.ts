import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface PendingApproval {
  id: string;
  createdAt: string;
  type: "service_call";
  status: "pending" | "approved" | "rejected";
  summary: string;
  payload: {
    service: string;
    entityIds: string[];
    serviceData: Record<string, unknown>;
  };
  resolvedAt?: string;
}

export class ApprovalStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? this.resolveDefaultPath();
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, "[]", "utf8");
    }
  }

  private resolveDefaultPath(): string {
    const dockerDataPath = "/data/copilot-brain-approvals.json";
    if (process.platform !== "win32") {
      return dockerDataPath;
    }

    return path.resolve(process.cwd(), "../.data/copilot-brain-approvals.json");
  }

  private readAll(): PendingApproval[] {
    try {
      return JSON.parse(readFileSync(this.filePath, "utf8")) as PendingApproval[];
    } catch {
      return [];
    }
  }

  private writeAll(entries: PendingApproval[]): void {
    writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  create(summary: string, payload: PendingApproval["payload"]): PendingApproval {
    const entry: PendingApproval = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      type: "service_call",
      status: "pending",
      summary,
      payload,
    };

    const entries = this.readAll();
    entries.push(entry);
    this.writeAll(entries);
    return entry;
  }

  list(): PendingApproval[] {
    return this.readAll().reverse();
  }

  get(id: string): PendingApproval | null {
    return this.readAll().find((entry) => entry.id === id) ?? null;
  }

  resolve(id: string, status: "approved" | "rejected"): PendingApproval {
    const entries = this.readAll();
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error(`Approval ${id} not found.`);
    }

    entry.status = status;
    entry.resolvedAt = new Date().toISOString();
    this.writeAll(entries);
    return entry;
  }
}
