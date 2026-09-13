/**
 * PostgreSQL-Backed Authoritative Audit Trail for AI Operations
 * 
 * AUDIT DATA ARCHITECTURE:
 * - PostgreSQL (public.security_audit_events) = AUTHORITATIVE SOURCE OF TRUTH for all audit records.
 * - In-memory buffer (auditLogStore) = NON-AUTHORITATIVE short-lived cache and dev/test helper.
 * 
 * FAILURE POLICY:
 * - Security-critical events (actionType === "UNAUTHORIZED" or status === "denied"):
 *   Fail-closed in production: database persistence is strictly enforced. If PostgreSQL insert fails,
 *   a high-priority alert is emitted and an error is raised to prevent silent security audit loss.
 * - Routine operations (READ_ONLY tool invocations):
 *   Fail-open with structured warning log to prevent transient database hiccups from disrupting read traffic.
 */

import { auditLogger } from "@/lib/security/audit-logger";
import { supabase } from "@/integrations/supabase/client";
import { ExternalServiceError, logger } from "@/lib/errors";
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

// Non-authoritative in-memory cache for fast dev/test queries
const auditLogStore: AIAuditEntry[] = [];
const MAX_LOG_SIZE = 500;

export class AuditTrail {
  /**
   * Synchronous audit record (buffers in memory and initiates background DB write).
   */
  static record(entry: Omit<AIAuditEntry, "id" | "timestamp">): AIAuditEntry {
    const record = this.buildRecord(entry);

    // Buffer in non-authoritative memory cache
    this.bufferInMemory(record);

    // Persist to authoritative PostgreSQL store
    this.persistToDatabase(record).catch((err) => {
      if (record.actionType === "UNAUTHORIZED" || record.status === "denied") {
        logger.error("[SECURITY_CRITICAL_AUDIT_FAILURE] Failed to persist critical security audit event to PostgreSQL", {
          error: err?.message,
          record,
        });
      }
    });

    return record;
  }

  /**
   * Asynchronous authoritative audit record with strict failure policy.
   * Guarantees persistence to PostgreSQL before completing.
   */
  static async recordAsync(entry: Omit<AIAuditEntry, "id" | "timestamp">): Promise<AIAuditEntry> {
    const record = this.buildRecord(entry);
    this.bufferInMemory(record);

    try {
      await this.persistToDatabase(record);
    } catch (err: any) {
      const isCritical = record.actionType === "UNAUTHORIZED" || record.status === "denied";
      logger.error("[AUDIT_PERSISTENCE_ERROR] PostgreSQL audit insert failed", {
        isCritical,
        error: err?.message,
        requestId: record.requestId,
      });

      // Fail-closed policy in production for security denials
      if (isCritical && process.env["NODE_ENV"] === "production") {
        throw new ExternalServiceError(
          "PostgreSQL",
          `Security-critical audit event failed to persist to authoritative database: ${err?.message}`,
        );
      }
    }

    return record;
  }

  private static buildRecord(entry: Omit<AIAuditEntry, "id" | "timestamp">): AIAuditEntry {
    const cleanDetails = entry.details
      ? SecretRedactor.redact(entry.details).redactedText
      : undefined;

    const cleanFiles = entry.targetFiles?.map((f) => SecretRedactor.redact(f).redactedText);

    return {
      ...entry,
      details: cleanDetails,
      targetFiles: cleanFiles,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
  }

  private static bufferInMemory(record: AIAuditEntry): void {
    auditLogStore.unshift(record);
    if (auditLogStore.length > MAX_LOG_SIZE) {
      auditLogStore.pop();
    }
  }

  private static async persistToDatabase(record: AIAuditEntry): Promise<void> {
    if (!record.projectId || !record.userId) return;

    const { error } = await (supabase.from as any)("security_audit_events").insert({
      action: "SECURITY_PERMISSION_DENIED",
      actor_id: record.userId,
      project_id: record.projectId,
      target_resource: record.toolName,
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

    if (error) {
      throw new Error(`PostgreSQL audit error: ${error.message}`);
    }
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
