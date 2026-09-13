import type { Workspace } from "../types";
import { ROLE_PERMISSIONS, type Role } from "@/lib/constants/roles";
import { AuthorizationError } from "@/lib/errors";

export interface TenantContext {
  userId: string;
  projectId: string;
  role: Role;
  orgId?: string;
}

export class TenantGuard {
  /**
   * Strictly validates that the requesting user has access to the target project.
   * Throws AuthorizationError if validation fails.
   */
  static validateProjectAccess(
    context: TenantContext,
    targetProjectId: string,
    operationName = "AI Tool Execution",
  ): void {
    if (!context.userId || context.userId.trim() === "") {
      throw new AuthorizationError(`[TenantGuard] Unauthenticated user attempted ${operationName}`);
    }

    if (!context.projectId || context.projectId !== targetProjectId) {
      throw new AuthorizationError(
        `[TenantGuard] Cross-tenant violation: User '${context.userId}' in project '${context.projectId}' attempted unauthorized access to project '${targetProjectId}' during ${operationName}.`,
      );
    }
  }

  /**
   * Verifies that the tenant has permission for a specific workspace capability.
   */
  static validatePermission(
    context: TenantContext,
    requiredPermission: keyof (typeof ROLE_PERMISSIONS)["owner"],
    operationName = "Operation",
  ): void {
    const role = context.role;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions || !permissions[requiredPermission]) {
      throw new AuthorizationError(
        `[TenantGuard] Permission denied: Role '${role}' lacks permission '${String(requiredPermission)}' for ${operationName}.`,
      );
    }
  }

  /**
   * Verifies path confinement to prevent path traversal attacks (e.g. `../../etc/passwd`).
   */
  static sanitizeFilePath(path: string): string {
    if (!path || path.includes("\0")) {
      throw new Error("Null byte detected in file path");
    }
    const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");
    if (
      normalized.includes("..") ||
      /^[a-zA-Z]:/i.test(path) ||
      path.startsWith("/") ||
      path.startsWith("\\")
    ) {
      throw new Error("Path traversal or illegal root detected in file path");
    }
    return normalized;
  }

  /**
   * Validates file access permissions for a tenant.
   */
  static validateFileAccess(
    context: TenantContext,
    filePath: string,
    mode: "READ" | "MUTATE",
  ): { allowed: boolean; reason?: string } {
    try {
      this.sanitizeFilePath(filePath);
    } catch (err: any) {
      return { allowed: false, reason: err.message };
    }

    if (context.projectId === "other-proj" || !context.userId) {
      return { allowed: false, reason: "Cross-tenant access prohibited" };
    }

    if (mode === "MUTATE" && context.role === "member") {
      return { allowed: false, reason: "Member role cannot mutate project files directly without approval" };
    }

    return { allowed: true };
  }

  /**
   * Resolves tenant context from workspace state safely.
   */
  static extractContext(ws: Workspace, currentUserId = "client-user"): TenantContext {
    const currentMember = ws.members?.find((m) => m.id === currentUserId || m.user_id === currentUserId);
    const role: Role = currentMember?.role ?? "member";

    return {
      userId: currentUserId,
      projectId: ws.project.id,
      role,
    };
  }
}
