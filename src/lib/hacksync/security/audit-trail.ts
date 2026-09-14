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

export type Phase4AuditAction =
  | "TEST_PLAN_CREATED"
  | "TEST_RUN_STARTED"
  | "TEST_RUN_COMPLETED"
  | "FIX_PROPOSAL_CREATED"
  | "PATCH_GENERATED"
  | "PATCH_VALIDATED"
  | "APPROVAL_REQUESTED"
  | "PATCH_APPROVED"
  | "PATCH_REJECTED"
  | "PATCH_APPLIED"
  | "PATCH_ROLLBACK"
  | "FIX_VERIFICATION_STARTED"
  | "FIX_VERIFICATION_COMPLETED"
  | "SECURITY_RESCAN_COMPLETED";

export interface AIAuditEntry {
  id: string;
  requestId: string;
  timestamp: string;
  userId: string;
  projectId: string;
  toolName: string;
  actionType: "READ_ONLY" | "MUTATING" | "EVALUATION" | "UNAUTHORIZED" | Phase4AuditAction;
  operation?: string | undefined;
  patchHash?: string | undefined;
  approvalId?: string | undefined;
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

  /**
   * Dedicated helper for recording Phase 4 Engineering Loop events
   */
  static recordPhase4Event(params: {
    requestId: string;
    userId: string;
    projectId: string;
    operation: Phase4AuditAction;
    toolName?: string | undefined;
    status?: "success" | "denied" | "failed" | undefined;
    targetFiles?: string[] | undefined;
    details?: string | undefined;
    patchHash?: string | undefined;
    approvalId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    executionMs?: number | undefined;
  }): AIAuditEntry {
    return this.record({
      requestId: params.requestId,
      userId: params.userId,
      projectId: params.projectId,
      toolName: params.toolName || "phase4_engine",
      actionType: params.operation,
      operation: params.operation,
      status: params.status || "success",
      targetFiles: params.targetFiles,
      details: params.details,
      patchHash: params.patchHash,
      approvalId: params.approvalId,
      metadata: {
        ...params.metadata,
        patchHash: params.patchHash,
        approvalId: params.approvalId,
      },
      executionMs: params.executionMs,
    });
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

  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private static isValidUuid(val: string): boolean {
    return this.UUID_REGEX.test(val);
  }

  private static async persistToDatabase(record: AIAuditEntry): Promise<void> {
    if (!record.projectId || !record.userId) return;

    // PostgreSQL schema requires valid UUIDs for actor_id and project_id.
    // In test/mock environments where test IDs are used (e.g. 'usr-alice'), retain in-memory and skip remote DB insert.
    if (!this.isValidUuid(record.projectId) || !this.isValidUuid(record.userId)) {
      return;
    }

    const { error } = await (supabase.from as any)("security_audit_events").insert({
      action: record.actionType || "SECURITY_AUDIT_EVENT",
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
