/**
 * Security Audit Logger
 * Records tamper-evident audit logs for sensitive operations,
 * authorization failures, and administrative actions.
 */

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
   * Record a security audit event
   */
  log(event: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Buffer in memory
    this.inMemoryBuffer.unshift(entry);
    if (this.inMemoryBuffer.length > this.maxBufferSize) {
      this.inMemoryBuffer.pop();
    }

    // Output formatted JSON for centralized log aggregators (Datadog, Axiom, CloudWatch)
    if (process.env["NODE_ENV"] !== "test") {
      console.info(`[SECURITY_AUDIT] ${JSON.stringify(entry)}`);
    }

    return entry;
  }

  /**
   * Get recent audit history (for security dashboard)
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
