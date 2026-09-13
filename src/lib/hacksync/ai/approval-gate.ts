/**
 * Human-in-the-Loop Permission & Approval Gate
 * Strictly partitions tool execution into automatic read operations and
 * user-approved mutating operations (code edits, patches, commits, migrations).
 */

export type ToolPermissionTier = "READ_ONLY" | "MUTATING" | "ADMIN";

export interface PendingApprovalRequest {
  id: string;
  requestId: string;
  projectId: string;
  userId: string;
  toolName: string;
  summary: string;
  rationale: string;
  filesAffected: string[];
  diffPreview?: string | undefined;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
}

const MUTATING_TOOLS = new Set([
  "apply_patch",
  "modify_file",
  "delete_file",
  "run_migration",
  "execute_command",
  "git_commit",
]);

export class ApprovalGate {
  private static pendingApprovals = new Map<string, PendingApprovalRequest>();

  static getToolTier(toolName: string): ToolPermissionTier {
    if (MUTATING_TOOLS.has(toolName)) {
      return "MUTATING";
    }
    return "READ_ONLY";
  }

  static isMutating(toolName: string): boolean {
    return MUTATING_TOOLS.has(toolName);
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
  }): PendingApprovalRequest {
    const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: PendingApprovalRequest = {
      id,
      requestId: params.requestId,
      projectId: params.projectId,
      userId: params.userId,
      toolName: params.toolName,
      summary: params.summary,
      rationale: params.rationale,
      filesAffected: params.filesAffected,
      diffPreview: params.diffPreview,
      timestamp: new Date().toISOString(),
      status: "pending",
    };

    this.pendingApprovals.set(id, request);
    return request;
  }

  /**
   * Resolves a pending user approval decision (approve or reject).
   */
  static resolveApproval(approvalId: string, decision: "approved" | "rejected"): PendingApprovalRequest {
    const req = this.pendingApprovals.get(approvalId);
    if (!req) {
      throw new Error(`[ApprovalGate] Approval request '${approvalId}' not found.`);
    }

    req.status = decision;
    this.pendingApprovals.set(approvalId, req);
    return req;
  }

  static getPendingForProject(projectId: string): PendingApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (a) => a.projectId === projectId && a.status === "pending",
    );
  }

  static getApproval(approvalId: string): PendingApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId);
  }
}
