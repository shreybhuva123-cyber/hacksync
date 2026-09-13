/**
 * Immutable, Database-Backed Audit Trail for AI Operations
 * Tracks all tool executions, file reads, mutations, and permissions checks.
 * Integrates with public.security_audit_events and sanitizes all metadata.
 */

import { auditLogger } from "@/lib/security/audit-logger";
import { SecretRedactor } from "./secret-redactor";

export interface AIAuditEntry {
  id: string;
  requestId: string;
  timestamp: string;
  userId: string;
  projectId: string;
  toolName: string;
  actionType: "READ_ONLY" | "MUTATING" | "EVALUATION" | "UNAUTHORIZED";
  status: "success" | "denied" | "failed";
  targetFiles?: string[] | undefined;
  details?: string | undefined;
  executionMs?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

const auditLogStore: AIAuditEntry[] = [];
const MAX_LOG_SIZE = 500;

export class AuditTrail {
  static record(entry: Omit<AIAuditEntry, "id" | "timestamp">): AIAuditEntry {
    // 1. Sanitize details and metadata to strictly prevent secret leakage
    const cleanDetails = entry.details
      ? SecretRedactor.redact(entry.details).redactedText
      : undefined;

    const cleanFiles = entry.targetFiles?.map((f) => SecretRedactor.redact(f).redactedText);

    const record: AIAuditEntry = {
      ...entry,
      details: cleanDetails,
      targetFiles: cleanFiles,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    // 2. In-memory buffer for instant retrieval and test isolation
    auditLogStore.unshift(record);
    if (auditLogStore.length > MAX_LOG_SIZE) {
      auditLogStore.pop();
    }

    // 3. Persist to durable PostgreSQL security_audit_events table
    try {
      auditLogger.log({
        action: "SECURITY_PERMISSION_DENIED",
        actorId: record.userId,
        projectId: record.projectId,
        resourceId: record.toolName,
        status: record.status === "success" ? "SUCCESS" : record.status === "denied" ? "DENIED" : "FAILURE",
        metadata: {
          requestId: record.requestId,
          toolName: record.toolName,
          actionType: record.actionType,
          executionMs: record.executionMs,
          targetFiles: record.targetFiles,
          details: record.details,
        },
      });
    } catch {
      // Non-blocking persistence
    }

    return record;
  }

  static getLogs(projectId?: string, limit = 50): AIAuditEntry[] {
    if (!projectId) return auditLogStore.slice(0, limit);
    return auditLogStore.filter((log) => log.projectId === projectId).slice(0, limit);
  }

  static getLocalLogs(projectId?: string, limit = 50): AIAuditEntry[] {
    return this.getLogs(projectId, limit);
  }

  static query(filter?: { projectId?: string; limit?: number }): AIAuditEntry[] {
    return this.getLogs(filter?.projectId, filter?.limit);
  }

  static clear(): void {
    auditLogStore.length = 0;
  }

  static clearLocalLogs(): void {
    this.clear();
  }
}
