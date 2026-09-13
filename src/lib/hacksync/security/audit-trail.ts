/**
 * Immutable Audit Trail for AI Operations
 * Tracks all tool executions, file reads, mutations, and permissions checks.
 */

export interface AIAuditEntry {
  id: string;
  requestId: string;
  timestamp: string;
  userId: string;
  projectId: string;
  toolName: string;
  actionType: "READ_ONLY" | "MUTATING" | "EVALUATION";
  status: "success" | "denied" | "failed";
  targetFiles?: string[] | undefined;
  details?: string | undefined;
  executionMs?: number | undefined;
}

const auditLogStore: AIAuditEntry[] = [];
const MAX_LOG_SIZE = 500;

export class AuditTrail {
  static record(entry: Omit<AIAuditEntry, "id" | "timestamp">): AIAuditEntry {
    const record: AIAuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    auditLogStore.unshift(record);
    if (auditLogStore.length > MAX_LOG_SIZE) {
      auditLogStore.pop();
    }

    // Also notify browser console in development mode
    if (process.env["NODE_ENV"] !== "production") {
      console.info(`[HackSync Audit] [${record.status.toUpperCase()}] ${record.toolName} by ${record.userId} on ${record.projectId}`);
    }

    return record;
  }

  static getLogs(projectId?: string, limit = 50): AIAuditEntry[] {
    if (!projectId) return auditLogStore.slice(0, limit);
    return auditLogStore.filter((log) => log.projectId === projectId).slice(0, limit);
  }

  static query(filter?: { projectId?: string; limit?: number }): AIAuditEntry[] {
    return this.getLogs(filter?.projectId, filter?.limit);
  }

  static clear(): void {
    auditLogStore.length = 0;
  }
}
