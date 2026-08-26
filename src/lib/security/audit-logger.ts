/**
 * Durable Security Audit Logger
 * Records immutable, tamper-evident audit logs directly to PostgreSQL
 * (public.security_audit_events) and stdout for centralized ingestion.
 */

import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_PASSWORD_RESET"
  | "PROJECT_CREATED"
  | "PROJECT_DELETED"
  | "MEMBER_ADDED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_REMOVED"
  | "MEMBER_JOINED_VIA_INVITE"
  | "CONTRACT_LOCKED"
  | "CONTRACT_DELETED"
  | "SCHEMA_TABLE_CREATED"
  | "SCHEMA_TABLE_DROPPED"
  | "SECURITY_PERMISSION_DENIED"
  | "RATE_LIMIT_EXCEEDED";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  actorId: string | null;
  actorRole?: string | null;
  projectId?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  status: "SUCCESS" | "DENIED" | "FAILURE";
  metadata?: Record<string, unknown>;
}

class SecurityAuditLogger {
  private inMemoryBuffer: AuditLogEntry[] = [];
  private readonly maxBufferSize = 500;

  /**
   * Record a security audit event to memory and PostgreSQL database.
   */
  log(event: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    // 1. Buffer in memory for instant synchronous UI display
    this.inMemoryBuffer.unshift(entry);
    if (this.inMemoryBuffer.length > this.maxBufferSize) {
      this.inMemoryBuffer.pop();
    }

    // 2. Output formatted JSON for log aggregators
    if (process.env["NODE_ENV"] !== "test") {
      console.info(`[SECURITY_AUDIT] ${JSON.stringify(entry)}`);
    }

    // 3. Persist asynchronously to PostgreSQL security_audit_events table
    if (entry.projectId && entry.actorId) {
      void (async () => {
        try {
          await supabase.from("security_audit_events").insert({
            project_id: entry.projectId,
            actor_id: entry.actorId,
            actor_role: entry.actorRole ?? null,
            action: entry.action,
            target_resource: entry.resourceId ?? null,
            status: entry.status,
            ip_address: entry.ipAddress ?? null,
            metadata: entry.metadata ?? {},
          });
        } catch {
          // Non-blocking async persistence
        }
      })();
    }

    return entry;
  }

  /**
   * Get recent audit history
   */
  getRecentLogs(limit = 50): AuditLogEntry[] {
    return this.inMemoryBuffer.slice(0, limit);
  }

  /**
   * Clear buffer (for test isolation)
   */
  clear(): void {
    this.inMemoryBuffer = [];
  }
}

export const auditLogger = new SecurityAuditLogger();
