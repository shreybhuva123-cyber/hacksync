import type { Workspace } from "../types";
import { ROLE_PERMISSIONS, type Role } from "@/lib/constants/roles";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";

export interface AISecurityContext {
  userId: string;
  organizationId?: string | undefined;
  projectId: string;
  requestId: string;
  role: Role;
}

// Backward compatibility alias for TenantContext
export type TenantContext = AISecurityContext;

export class TenantGuard {
  /**
   * Strictly validates that the requesting user has access to the target project.
   * Throws AuthorizationError if validation fails.
   */
  static validateProjectAccess(
    context: AISecurityContext,
    targetProjectId: string,
    operationName = "AI Tool Execution",
  ): void {
    if (!context.userId || context.userId.trim() === "") {
      throw new AuthenticationError(`[TenantGuard] Unauthenticated user attempted ${operationName}`);
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
    context: AISecurityContext,
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
   * Verifies path confinement to prevent path traversal attacks (e.g. `../../etc/passwd`, Windows drive roots, UNC paths).
   * Returns a clean, normalized project-relative path.
   */
  static sanitizeFilePath(rawPath: string): string {
    if (!rawPath || typeof rawPath !== "string") {
      throw new Error("File path cannot be empty");
    }

    if (rawPath.includes("\0")) {
      throw new Error("Null byte detected in file path");
    }

    // Decode percent-encoding to catch obfuscated traversal (e.g. %2e%2e%2f)
    let decoded = rawPath;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      // If malformed URI, continue with raw
    }

    // Reject UNC network shares and Windows drive letters
    if (/^[a-zA-Z]:/i.test(decoded) || decoded.startsWith("\\\\") || decoded.startsWith("//")) {
      throw new Error("Path traversal prohibited: Absolute paths, Windows drive letters, and UNC paths are prohibited");
    }

    // Reject absolute paths
    if (decoded.startsWith("/") || decoded.startsWith("\\")) {
      throw new Error("Path traversal prohibited: Absolute paths outside project boundary are prohibited");
    }

    // Normalize slashes
    const normalized = decoded.replace(/\\/g, "/").replace(/\/+/g, "/");

    // Inspect individual segments to prevent directory traversal
    const segments = normalized.split("/");
    for (const segment of segments) {
      if (segment === ".." || segment === ".") {
        throw new Error("Path traversal: Directory traversal sequence (..) detected in file path");
      }
    }

    // Final check for traversal sequences
    if (normalized.includes("..")) {
      throw new Error("Path traversal detected in file path");
    }

    return normalized;
  }

  /**
   * Validates file access permissions for a tenant.
   * Generically validates user authentication, project confinement, role permissions, and path traversal.
   */
  static validateFileAccess(
    context: AISecurityContext,
    filePath: string,
    mode: "READ" | "MUTATE",
    targetProjectId?: string,
  ): { allowed: boolean; reason?: string } {
    try {
      this.sanitizeFilePath(filePath);
    } catch (err: any) {
      return { allowed: false, reason: err.message };
    }

    if (!context.userId || context.userId.trim() === "") {
      return { allowed: false, reason: "Authentication required" };
    }

    if (!context.projectId || context.projectId.trim() === "") {
      return { allowed: false, reason: "Project context required" };
    }

    if (targetProjectId && context.projectId !== targetProjectId) {
      return { allowed: false, reason: "Cross-tenant access prohibited" };
    }

    if (mode === "MUTATE" && context.role === "member") {
      return { allowed: false, reason: "Member role cannot mutate project files directly without approval" };
    }

    return { allowed: true };
  }

  /**
   * Resolves tenant context from workspace state.
   * Requires a non-empty authenticated user ID.
   */
  static extractContext(
    ws: Workspace,
    currentUserId: string,
    requestId?: string,
  ): AISecurityContext {
    if (!currentUserId || currentUserId.trim() === "") {
      throw new AuthenticationError("[TenantGuard] Cannot create security context without authenticated userId");
    }

    const currentMember = ws.members?.find((m) => m.id === currentUserId || m.user_id === currentUserId);
    const role: Role = currentMember?.role ?? "member";

    return {
      userId: currentUserId,
      projectId: ws.project.id,
      role,
      requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  /**
   * Creates an explicit, verified AISecurityContext.
   */
  static createSecurityContext(params: {
    userId: string;
    projectId: string;
    role: Role;
    requestId?: string | undefined;
    organizationId?: string | undefined;
  }): AISecurityContext {
    if (!params.userId || params.userId.trim() === "") {
      throw new AuthenticationError("[TenantGuard] User ID is required to create AI security context");
    }
    if (!params.projectId || params.projectId.trim() === "") {
      throw new AuthorizationError("[TenantGuard] Project ID is required to create AI security context");
    }

    return {
      userId: params.userId,
      projectId: params.projectId,
      role: params.role,
      ...(params.organizationId !== undefined ? { organizationId: params.organizationId } : {}),
      requestId: params.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}
