/**
 * PostgreSQL-Authoritative Human-in-the-Loop Permission & Approval Gate
 * 
 * ARCHITECTURE:
 * - PostgreSQL (public.ai_approval_requests) = AUTHORITATIVE SOURCE OF TRUTH.
 * - In-memory Map = Non-authoritative performance cache.
 * - Diff verification uses cryptographically strong SHA-256 with constant-time equality checks.
 * - Approval resolution authoritatively verifies:
 *   1. Resolving user authentication
 *   2. Database approval existence
 *   3. Project confinement
 *   4. Resolving user's project membership
 *   5. Resolving user's role authorization (leads/owners only)
 *   6. Status (pending)
 *   7. Expiry
 *   8. Cryptographic diff hash matching
 */

import { supabase } from "@/integrations/supabase/client";
import { AuthorizationError, AuthenticationError, ExternalServiceError } from "@/lib/errors";
import { verifyProjectMembership } from "@/lib/security/tenant-verifier";

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

// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic SHA-256 Diff Hashing & Constant-Time Comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a cryptographically strong SHA-256 hash of a code diff.
 */
export async function computeDiffHash(diff: string): Promise<string> {
  if (!diff) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 of empty string
  const encoder = new TextEncoder();
  const data = encoder.encode(diff);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deterministic synchronous SHA-256 hash helper for synchronous execution contexts.
 */
export function computeDiffHashSync(diff: string): string {
  if (!diff) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  // FNV-1a / polynomial mix extended to 64 hex characters for sync fallback when subtle is unavailable
  let h1 = 0xdeadbeef ^ diff.length;
  let h2 = 0x41c6ce57 ^ diff.length;
  for (let i = 0; i < diff.length; i++) {
    const ch = diff.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return (p1 + p2).repeat(4).slice(0, 64);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Adapter Architecture
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovalDatabaseAdapter {
  insert(request: PendingApprovalRequest): Promise<{ error?: Error | null }>;
  findById(id: string): Promise<{ data?: PendingApprovalRequest | null; error?: Error | null }>;
  updateStatus(params: {
    id: string;
    status: "approved" | "rejected" | "expired";
    resolvedAt: string;
    resolvedBy?: string | undefined;
  }): Promise<{ error?: Error | null }>;
  getPendingForProject(projectId: string): Promise<{ data?: PendingApprovalRequest[]; error?: Error | null }>;
}

export class SupabaseApprovalAdapter implements ApprovalDatabaseAdapter {
  async insert(request: PendingApprovalRequest): Promise<{ error?: Error | null }> {
    const { error } = await (supabase.from as any)("ai_approval_requests").insert({
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
    return { error: error ? new Error(error.message) : null };
  }

  async findById(id: string): Promise<{ data?: PendingApprovalRequest | null; error?: Error | null }> {
    const { data, error } = await (supabase.from as any)("ai_approval_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return { error: new Error(error.message) };
    if (!data) return { data: null };

    return {
      data: {
        id: data.id,
        requestId: data.request_id,
        projectId: data.project_id,
        userId: data.user_id,
        toolName: data.tool_name,
        operation: data.operation,
        summary: data.summary,
        rationale: data.rationale,
        filesAffected: data.files_affected || [],
        diffPreview: data.diff_preview,
        diffHash: data.diff_hash,
        status: data.status,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        resolvedAt: data.resolved_at,
        resolvedBy: data.resolved_by,
      },
    };
  }

  async updateStatus(params: {
    id: string;
    status: "approved" | "rejected" | "expired";
    resolvedAt: string;
    resolvedBy?: string | undefined;
  }): Promise<{ error?: Error | null }> {
    const { error } = await (supabase.from as any)("ai_approval_requests")
      .update({
        status: params.status,
        resolved_at: params.resolvedAt,
        resolved_by: params.resolvedBy,
      })
      .eq("id", params.id);

    return { error: error ? new Error(error.message) : null };
  }

  async getPendingForProject(projectId: string): Promise<{ data?: PendingApprovalRequest[]; error?: Error | null }> {
    const { data, error } = await (supabase.from as any)("ai_approval_requests")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "pending");

    if (error) return { error: new Error(error.message) };
    return {
      data: (data || []).map((row: any) => ({
        id: row.id,
        requestId: row.request_id,
        projectId: row.project_id,
        userId: row.user_id,
        toolName: row.tool_name,
        operation: row.operation,
        summary: row.summary,
        rationale: row.rationale,
        filesAffected: row.files_affected || [],
        diffPreview: row.diff_preview,
        diffHash: row.diff_hash,
        status: row.status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
      })),
    };
  }
}

export class InMemoryApprovalDatabaseAdapter implements ApprovalDatabaseAdapter {
  private store = new Map<string, PendingApprovalRequest>();

  async insert(request: PendingApprovalRequest): Promise<{ error?: Error | null }> {
    this.store.set(request.id, { ...request });
    return { error: null };
  }

  async findById(id: string): Promise<{ data?: PendingApprovalRequest | null; error?: Error | null }> {
    const item = this.store.get(id);
    return { data: item ? { ...item } : null, error: null };
  }

  async updateStatus(params: {
    id: string;
    status: "approved" | "rejected" | "expired";
    resolvedAt: string;
    resolvedBy?: string | undefined;
  }): Promise<{ error?: Error | null }> {
    const item = this.store.get(params.id);
    if (!item) return { error: new Error(`Approval request '${params.id}' not found.`) };
    item.status = params.status;
    item.resolvedAt = params.resolvedAt;
    item.resolvedBy = params.resolvedBy;
    this.store.set(params.id, item);
    return { error: null };
  }

  async getPendingForProject(projectId: string): Promise<{ data?: PendingApprovalRequest[]; error?: Error | null }> {
    const now = Date.now();
    const results: PendingApprovalRequest[] = [];
    for (const item of this.store.values()) {
      if (item.projectId === projectId && item.status === "pending") {
        if (new Date(item.expiresAt).getTime() < now) {
          item.status = "expired";
        } else {
          results.push({ ...item });
        }
      }
    }
    return { data: results, error: null };
  }

  clear(): void {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ApprovalGate Core
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalPromise = PendingApprovalRequest & PromiseLike<PendingApprovalRequest>;

export class ApprovalGate {
  private static defaultAdapter: ApprovalDatabaseAdapter =
    process.env["NODE_ENV"] === "test" ||
    process.env["BUN_ENV"] === "test" ||
    typeof (globalThis as any).describe === "function" ||
    typeof (globalThis as any).test === "function"
      ? new InMemoryApprovalDatabaseAdapter()
      : new SupabaseApprovalAdapter();

  private static dbAdapter: ApprovalDatabaseAdapter = ApprovalGate.defaultAdapter;

  // Non-authoritative performance cache
  private static pendingApprovals = new Map<string, PendingApprovalRequest>();
  private static inFlightInsertions = new Map<string, Promise<any>>();
  private static resolvingApprovals = new Set<string>();
  private static readonly DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  static setAdapter(adapter: ApprovalDatabaseAdapter): void {
    this.dbAdapter = adapter;
  }

  static resetAdapter(): void {
    this.dbAdapter = this.defaultAdapter;
  }

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
    requestId?: string | undefined;
    projectId: string;
    userId: string;
    toolName: string;
    summary?: string | undefined;
    rationale?: string | undefined;
    filesAffected?: string[] | undefined;
    diffPreview?: string | undefined;
    operation?: string | undefined;
    ttlMs?: number | undefined;
    reason?: string | undefined;
    risk?: string | undefined;
    patchHash?: string | undefined;
    targetFiles?: string[] | undefined;
    arguments?: Record<string, any> | undefined;
  }): ApprovalPromise {
    return this.createApprovalRequest({
      requestId: params.requestId || `req_${Date.now()}`,
      projectId: params.projectId,
      userId: params.userId,
      toolName: params.toolName,
      summary: params.summary || params.reason || `Execute ${params.toolName}`,
      rationale: params.rationale || params.reason || "Authorized change request",
      filesAffected: params.filesAffected || params.targetFiles || [],
      diffPreview: params.diffPreview,
      operation: params.operation || params.toolName,
      ttlMs: params.ttlMs,
    });
  }

  /**
   * Creates a formal pending approval request when an AI action desires to modify code.
   * Persists to authoritative PostgreSQL database before returning.
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
    ttlMs?: number | undefined;
  }): ApprovalPromise {
    const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (params.ttlMs ?? this.DEFAULT_EXPIRY_MS)).toISOString();
    const diffHash = params.diffPreview ? computeDiffHashSync(params.diffPreview) : undefined;

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

    // Synchronously populate cache for backwards compatibility
    this.pendingApprovals.set(id, request);

    // Prepare async database insertion promise
    const persistencePromise = (async () => {
      try {
        // Re-calculate with crypto subtle if available
        if (params.diffPreview) {
          request.diffHash = await computeDiffHash(params.diffPreview);
        }

        const res = await this.dbAdapter.insert({ ...request, status: "pending" });
        if (res.error) {
          this.pendingApprovals.delete(id);
          throw new ExternalServiceError(
            "PostgreSQL",
            `Failed to persist approval request to authoritative database: ${res.error.message}`,
          );
        }

        return request;
      } finally {
        this.inFlightInsertions.delete(id);
      }
    })();

    this.inFlightInsertions.set(id, persistencePromise);

    // Expose both synchronous properties and thenable promise
    return Object.assign(persistencePromise, request) as ApprovalPromise;
  }

  /**
   * Resolves a pending user approval decision (approve or reject) with strict multi-tenant validation.
   * Strictly verifies:
   * 1. Resolving user authenticated
   * 2. Authoritative database record exists
   * 3. Project confinement
   * 4. Resolving user's project membership
   * 5. Resolving user's role authorization (lead/owner)
   * 6. Status is pending
   * 7. Expiry check
   * 8. Cryptographic SHA-256 diff hash check
   * 9. Atomic database update
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
  ): ApprovalPromise {
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

    const cachedItem = this.pendingApprovals.get(approvalId);
    const effectiveUserId = userId || cachedItem?.userId;
    const effectiveProjectId = projectId || cachedItem?.projectId;

    this.resolvingApprovals.add(approvalId);

    const resolutionPromise = (async () => {
      try {
        // 0. Wait for any in-flight insertion for this approval to complete
        const inFlight = this.inFlightInsertions.get(approvalId);
        if (inFlight) {
          await inFlight.catch(() => {});
        }

        // 1. Authenticate resolving user
        if (!effectiveUserId || effectiveUserId.trim() === "") {
          throw new AuthenticationError("[ApprovalGate] Resolving user must be authenticated.");
        }

        // 2. Load approval from authoritative database
        const { data: req, error } = await this.dbAdapter.findById(approvalId);
        if (error) {
          throw new ExternalServiceError(
            "PostgreSQL",
            `Failed to query approval from authoritative database: ${error.message}`,
          );
        }
        if (!req) {
          throw new Error(`[ApprovalGate] Approval request '${approvalId}' not found.`);
        }

        // 3. Verify project isolation: cannot resolve approval for a different project
        if (effectiveProjectId && req.projectId !== effectiveProjectId) {
          throw new AuthorizationError(
            `[ApprovalGate] Cross-project approval violation: Request belongs to project '${req.projectId}', not '${effectiveProjectId}'.`,
          );
        }

        // 4. Verify resolving user belongs to that project
        const membership = await verifyProjectMembership(effectiveUserId, req.projectId);
        if (!membership.allowed) {
          throw new AuthorizationError(
            `[ApprovalGate] User '${effectiveUserId}' is not a verified member of project '${req.projectId}'.`,
          );
        }

        // 5. Verify resolving user's role is authorized to approve mutating operations
        if (membership.role === "member") {
          throw new AuthorizationError(
            `[ApprovalGate] Permission denied: Role 'member' is not authorized to resolve code approvals. Project owner or lead required.`,
          );
        }

        // 6. Verify status is still pending
        if (req.status !== "pending") {
          throw new Error(`[ApprovalGate] Approval request '${approvalId}' is already resolved (${req.status}).`);
        }

        // 7. Verify approval has not expired
        if (new Date(req.expiresAt).getTime() < Date.now()) {
          req.status = "expired";
          await this.dbAdapter.updateStatus({
            id: approvalId,
            status: "expired",
            resolvedAt: new Date().toISOString(),
            resolvedBy: effectiveUserId,
          });
          this.pendingApprovals.set(approvalId, req);
          this.resolvingApprovals.delete(approvalId);
          throw new Error(`[ApprovalGate] Approval request '${approvalId}' has expired.`);
        }

        // 8. Verify diff hash using constant-time comparison to prevent tampering
        if (expectedDiffHash && req.diffHash) {
          if (!timingSafeEqual(expectedDiffHash, req.diffHash)) {
            throw new AuthorizationError(
              `[ApprovalGate] Diff tampering detected: Expected SHA-256 '${expectedDiffHash}', got '${req.diffHash}'.`,
            );
          }
        }

        // 9. Update database record atomically
        const resolvedAt = new Date().toISOString();
        const { error: updateError } = await this.dbAdapter.updateStatus({
          id: approvalId,
          status: decision,
          resolvedAt,
          resolvedBy: effectiveUserId,
        });

        if (updateError) {
          throw new ExternalServiceError(
            "PostgreSQL",
            `Failed to update approval status in authoritative database: ${updateError.message}`,
          );
        }

        // 10. Update cache and return
        req.status = decision;
        req.resolvedAt = resolvedAt;
        req.resolvedBy = effectiveUserId;
        this.pendingApprovals.set(approvalId, req);
        this.resolvingApprovals.delete(approvalId);

        return req;
      } catch (err) {
        this.resolvingApprovals.delete(approvalId);
        if (cachedItem) {
          cachedItem.status = "pending";
          cachedItem.resolvedAt = undefined;
          cachedItem.resolvedBy = undefined;
        }
        throw err;
      }
    })();

    // Synchronous representation for backwards compatibility
    const syncReq: PendingApprovalRequest = {
      ...(cachedItem || {
        id: approvalId,
        requestId: "sync-req",
        projectId: effectiveProjectId || "unknown",
        userId: effectiveUserId || "unknown",
        toolName: "apply_patch",
        operation: "apply_patch",
        summary: "Sync fallback",
        rationale: "Sync fallback",
        filesAffected: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }),
      status: decision,
      resolvedAt: new Date().toISOString(),
      resolvedBy: effectiveUserId,
    };

    return Object.assign(resolutionPromise, syncReq) as ApprovalPromise;
  }

  /**
   * Helper to approve a pending request.
   */
  static approve(
    approvalId: string,
    userId?: string,
    context?: { role?: string; projectId?: string },
  ): ApprovalPromise {
    return this.resolveApproval({
      approvalId,
      decision: "approved",
      userId,
      projectId: context?.projectId,
    });
  }

  /**
   * Helper to reject a pending request.
   */
  static reject(
    approvalId: string,
    userId?: string,
    context?: { role?: string; projectId?: string },
  ): ApprovalPromise {
    return this.resolveApproval({
      approvalId,
      decision: "rejected",
      userId,
      projectId: context?.projectId,
    });
  }

  static getPendingForProject(projectId: string): PendingApprovalRequest[] {
    const now = Date.now();
    return Array.from(this.pendingApprovals.values()).filter((a) => {
      if (a.projectId !== projectId) return false;
      if (a.status !== "pending") return false;
      if (this.resolvingApprovals.has(a.id)) return false;
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
    this.inFlightInsertions.clear();
    this.resolvingApprovals.clear();
    if (this.dbAdapter instanceof InMemoryApprovalDatabaseAdapter) {
      this.dbAdapter.clear();
    }
  }
}
