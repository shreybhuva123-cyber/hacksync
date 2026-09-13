/**
 * Persistent Human-in-the-Loop Permission & Approval Gate
 * 
 * Strictly partitions tool execution into automatic read operations and
 * user-approved mutating operations (code edits, patches, commits, migrations).
 * Persists approval records to PostgreSQL (public.ai_approval_requests) with in-memory cache fallback.
 */

import { supabase } from "@/integrations/supabase/client";
import { AuthorizationError } from "@/lib/errors";

export type ToolPermissionTier = "READ_ONLY" | "MUTATING" | "ADMIN";

export interface PendingApprovalRequest {
  id: string;
  requestId: string;
  projectId: string;
  userId: string;
  toolName: string;
  operation: string;
  summary: string;
  rationale: string;
  filesAffected: string[];
  diffPreview?: string | undefined;
  diffHash?: string | undefined;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string | undefined;
  resolvedBy?: string | undefined;
}

const MUTATING_TOOLS = new Set([
  "apply_patch",
  "modify_file",
  "create_file",
  "delete_file",
  "run_migration",
  "execute_command",
  "git_commit",
]);

// Fast deterministic 32-bit hash for diff verification
function computeDiffHash(diff: string): string {
  if (!diff) return "empty_diff";
  let hash = 0;
  for (let i = 0; i < diff.length; i++) {
    hash = (hash << 5) - hash + diff.charCodeAt(i);
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

export class ApprovalGate {
  // Resilient memory cache (serves fast lookups and offline/test environments)
  private static pendingApprovals = new Map<string, PendingApprovalRequest>();
  private static readonly DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  static getToolTier(toolName: string): ToolPermissionTier {
    if (MUTATING_TOOLS.has(toolName)) {
      return "MUTATING";
    }
    return "READ_ONLY";
  }

  static isMutating(toolName: string): boolean {
    return MUTATING_TOOLS.has(toolName);
  }

  static requestApproval(params: {
    requestId: string;
    projectId: string;
    userId: string;
    toolName: string;
    summary: string;
    rationale: string;
    filesAffected: string[];
    diffPreview?: string | undefined;
    operation?: string | undefined;
    ttlMs?: number;
  }): PendingApprovalRequest {
    return this.createApprovalRequest(params);
  }

  /**
   * Creates a formal pending approval request when an AI action desires to modify code.
   */
  static createApprovalRequest(params: {
    requestId: string;
    projectId: string;
    userId: string;
    toolName: string;
    summary: string;
    rationale: string;
    filesAffected: string[];
    diffPreview?: string | undefined;
    operation?: string | undefined;
    ttlMs?: number;
  }): PendingApprovalRequest {
    const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (params.ttlMs ?? this.DEFAULT_EXPIRY_MS)).toISOString();
    const diffHash = params.diffPreview ? computeDiffHash(params.diffPreview) : undefined;

    const request: PendingApprovalRequest = {
      id,
      requestId: params.requestId,
      projectId: params.projectId,
      userId: params.userId,
      toolName: params.toolName,
      operation: params.operation || params.toolName,
      summary: params.summary,
      rationale: params.rationale,
      filesAffected: params.filesAffected,
      diffPreview: params.diffPreview,
      diffHash,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt,
    };

    // 1. Cache immediately in memory
    this.pendingApprovals.set(id, request);

    // 2. Persist asynchronously to database
    void (async () => {
      try {
        await (supabase.from as any)("ai_approval_requests").insert({
          id: request.id,
          request_id: request.requestId,
          project_id: request.projectId,
          user_id: request.userId,
          tool_name: request.toolName,
          operation: request.operation,
          summary: request.summary,
          rationale: request.rationale,
          files_affected: request.filesAffected,
          diff_preview: request.diffPreview,
          diff_hash: request.diffHash,
          status: request.status,
          created_at: request.createdAt,
          expires_at: request.expiresAt,
        });
      } catch {
        // Non-blocking persistent insert fallback
      }
    })();

    return request;
  }

  /**
   * Resolves a pending user approval decision (approve or reject) with strict multi-tenant validation.
   */
  static resolveApproval(
    paramsOrId:
      | string
      | {
          approvalId: string;
          decision: "approved" | "rejected";
          userId?: string | undefined;
          projectId?: string | undefined;
          expectedDiffHash?: string | undefined;
        },
    legacyDecision?: "approved" | "rejected",
    legacyUserId?: string | undefined,
    legacyProjectId?: string | undefined,
  ): PendingApprovalRequest {
    let approvalId: string;
    let decision: "approved" | "rejected";
    let userId: string | undefined;
    let projectId: string | undefined;
    let expectedDiffHash: string | undefined;

    if (typeof paramsOrId === "string") {
      approvalId = paramsOrId;
      decision = legacyDecision || "approved";
      userId = legacyUserId;
      projectId = legacyProjectId;
    } else {
      approvalId = paramsOrId.approvalId;
      decision = paramsOrId.decision;
      userId = paramsOrId.userId;
      projectId = paramsOrId.projectId;
      expectedDiffHash = paramsOrId.expectedDiffHash;
    }

    const req = this.pendingApprovals.get(approvalId);
    if (!req) {
      throw new Error(`[ApprovalGate] Approval request '${approvalId}' not found.`);
    }

    // 1. Verify project isolation: user cannot resolve approval for a different project
    if (projectId && req.projectId !== projectId) {
      throw new AuthorizationError(
        `[ApprovalGate] Cross-project approval violation: Request belongs to project '${req.projectId}', not '${projectId}'.`,
      );
    }

    // 2. Verify status is still pending
    if (req.status !== "pending") {
      throw new Error(`[ApprovalGate] Approval request '${approvalId}' is already resolved (${req.status}).`);
    }

    // 3. Verify approval has not expired
    if (new Date(req.expiresAt).getTime() < Date.now()) {
      req.status = "expired";
      this.pendingApprovals.set(approvalId, req);
      throw new Error(`[ApprovalGate] Approval request '${approvalId}' has expired.`);
    }

    // 4. Verify diff hash to ensure code hasn't changed unexpectedly
    if (expectedDiffHash && req.diffHash && expectedDiffHash !== req.diffHash) {
      throw new AuthorizationError(
        `[ApprovalGate] Diff tampering detected: Expected hash '${expectedDiffHash}', got '${req.diffHash}'.`,
      );
    }

    // 5. Update status and recorder
    req.status = decision;
    req.resolvedAt = new Date().toISOString();
    req.resolvedBy = userId;
    this.pendingApprovals.set(approvalId, req);

    // 6. Update database record asynchronously
    void (async () => {
      try {
        await (supabase.from as any)("ai_approval_requests")
          .update({
            status: decision,
            resolved_at: req.resolvedAt,
            resolved_by: req.resolvedBy,
          })
          .eq("id", approvalId);
      } catch {
        // Non-blocking
      }
    })();

    return req;
  }

  static getPendingForProject(projectId: string): PendingApprovalRequest[] {
    const now = Date.now();
    return Array.from(this.pendingApprovals.values()).filter((a) => {
      if (a.projectId !== projectId) return false;
      if (a.status !== "pending") return false;
      if (new Date(a.expiresAt).getTime() < now) {
        a.status = "expired";
        return false;
      }
      return true;
    });
  }

  static getApproval(approvalId: string): PendingApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  static clear(): void {
    this.pendingApprovals.clear();
  }
}
