/**
 * Server-Side AI Gateway
 *
 * Centralized backend boundary for all HackSync AI operations.
 * Enforces:
 * 1. Authentication (JWT verification, elimination of anonymous identities)
 * 2. Multi-tenant project isolation (membership verification, 403 Forbidden on cross-tenant access)
 * 3. Rate limiting (per-user and per-project token buckets)
 * 4. Audit logging & correlation (UUID requestId across all events)
 * 5. Secret redaction before sending prompt to LLM and returning response
 * 6. Sanitized error handling (no raw internal errors or credentials returned to client)
 */

import { supabase } from "@/integrations/supabase/client";
import { AIOrchestrator, type OrchestrationResult } from "@/lib/hacksync/ai/orchestrator";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { TenantGuard, type AISecurityContext } from "@/lib/hacksync/security/tenant-guard";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import { AIObservability } from "@/lib/hacksync/ai/observability";
import { aiQuerySchema, type AIQueryInput } from "@/lib/validation/schemas";
import { RateLimitError, ExternalServiceError, AuthenticationError, AuthorizationError, logger } from "@/lib/errors";
import type { Workspace, CodeNode, MemberFile } from "@/lib/hacksync/types";
import type { Role } from "@/lib/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Error Codes
// ─────────────────────────────────────────────────────────────────────────────

export type AIGatewayErrorCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_UNAUTHORIZED"
  | "AI_FORBIDDEN"
  | "AI_INVALID_REQUEST"
  | "AI_APPROVAL_REQUIRED"
  | "AI_INTERNAL_ERROR";

export interface AIGatewayErrorResponse {
  error: {
    code: AIGatewayErrorCode;
    message: string;
    requestId: string;
    retryAfter?: number;
  };
}

export interface AIQueryRequestBody {
  query: string;
  projectId: string;
  workspace?: Workspace | null;
  activeNode?: CodeNode | null;
  memberFiles?: MemberFile[];
  modelPreference?: string;
  chatHistory?: { role: string; content: string }[];
}

export interface AIApprovalRequestBody {
  approvalId: string;
  decision: "approved" | "rejected";
  projectId: string;
  reason?: string;
  expectedDiffHash?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const userBuckets = new Map<string, TokenBucket>();
const projectBuckets = new Map<string, TokenBucket>();

const USER_MAX_TOKENS = 15;
const USER_REFILL_MS = 60_000 / 15; // 1 token every 4 seconds

const PROJECT_MAX_TOKENS = 60;
const PROJECT_REFILL_MS = 60_000 / 60; // 1 token every 1 second

function checkBucket(
  map: Map<string, TokenBucket>,
  key: string,
  maxTokens: number,
  refillRateMs: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = map.get(key) ?? { tokens: maxTokens, lastRefill: now };

  const timePassed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(timePassed / refillRateMs);

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    const timeUntilRefill = refillRateMs - (now - bucket.lastRefill);
    const retryAfterSeconds = Math.max(1, Math.ceil(timeUntilRefill / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.tokens -= 1;
  map.set(key, bucket);
  return { allowed: true };
}

export function checkRateLimit(clientKey: string): void {
  const check = checkBucket(userBuckets, clientKey, USER_MAX_TOKENS, USER_REFILL_MS);
  if (!check.allowed) {
    logger.warn("AI Gateway Rate Limit Exceeded", { clientKey });
    throw new RateLimitError(`AI query quota exceeded. Please wait ${check.retryAfterSeconds ?? 10} seconds.`);
  }
}

/** Reset rate limit buckets (useful for test isolation) */
export function resetRateLimits(): void {
  userBuckets.clear();
  projectBuckets.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication & Tenant Verification Helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function authenticateRequest(request: Request): Promise<{ userId: string; email?: string } | null> {
  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  // In test/dev environments, allow formatted test credentials
  const isTestOrDev = process.env["NODE_ENV"] !== "production";
  if (isTestOrDev && (token.startsWith("test:") || token.startsWith("usr-") || token.startsWith("test-"))) {
    const userId = token.startsWith("test:") ? token.slice(5) : token;
    return { userId, email: `${userId}@hacksync.dev` };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return null;
    }
    return { userId: data.user.id, ...(data.user.email ? { email: data.user.email } : {}) };
  } catch {
    return null;
  }
}

export async function verifyProjectMembership(
  userId: string,
  projectId: string,
  workspace?: Workspace | null,
): Promise<{ allowed: boolean; role: Role }> {
  if (!userId || !projectId) {
    return { allowed: false, role: "member" };
  }

  // 1. Check workspace state if provided
  if (workspace && workspace.project && workspace.project.id === projectId) {
    if (workspace.project.created_by === userId) {
      return { allowed: true, role: "owner" };
    }
    const member = workspace.members?.find((m) => m.user_id === userId || m.id === userId);
    if (member) {
      return { allowed: true, role: member.role };
    }
  }

  // 2. Query Supabase project_members
  try {
    const { data: memberData, error: memberError } = await (supabase.from as any)("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!memberError && memberData) {
      return { allowed: true, role: (memberData.role as Role) || "member" };
    }

    // Check project creator
    const { data: projectData, error: projectError } = await (supabase.from as any)("projects")
      .select("created_by")
      .eq("id", projectId)
      .maybeSingle();

    if (!projectError && projectData && projectData.created_by === userId) {
      return { allowed: true, role: "owner" };
    }
  } catch {
    // If database query fails, fall back to denying access unless workspace confirmed
  }

  return { allowed: false, role: "member" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitized Response Builder
// ─────────────────────────────────────────────────────────────────────────────

export function createSanitizedErrorResponse(
  code: AIGatewayErrorCode,
  message: string,
  requestId: string,
  status: number,
  retryAfter?: number,
): Response {
  // Redact any possible secrets from error messages
  const safeMessage = SecretRedactor.redact(message).redactedText;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-request-id": requestId,
  };

  if (retryAfter) {
    headers["Retry-After"] = String(retryAfter);
  }

  const payload: AIGatewayErrorResponse = {
    error: {
      code,
      message: safeMessage,
      requestId,
      ...(retryAfter ? { retryAfter } : {}),
    },
  };

  return new Response(JSON.stringify(payload), { status, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary Gateway Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAIQueryRequest(request: Request): Promise<Response> {
  const requestId = AIObservability.generateRequestId();

  // 1. Validate HTTP Method
  if (request.method !== "POST") {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "Method not allowed. Use POST.", requestId, 405);
  }

  // 2. Authenticate Request
  const auth = await authenticateRequest(request);
  if (!auth || !auth.userId) {
    return createSanitizedErrorResponse(
      "AI_UNAUTHORIZED",
      "Authentication required. Missing or invalid Bearer token.",
      requestId,
      401,
    );
  }
  const userId = auth.userId;

  // 3. Parse and Validate Request Body
  let body: AIQueryRequestBody;
  try {
    body = await request.json();
  } catch {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "Invalid JSON body.", requestId, 400);
  }

  const { query, projectId, workspace, activeNode, memberFiles, modelPreference, chatHistory } = body;

  if (!query || typeof query !== "string" || query.trim() === "") {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "Query field must be a non-empty string.", requestId, 400);
  }

  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "ProjectId must be specified.", requestId, 400);
  }

  // 4. Rate Limiting (User + Project)
  const userRate = checkBucket(userBuckets, userId, USER_MAX_TOKENS, USER_REFILL_MS);
  if (!userRate.allowed) {
    return createSanitizedErrorResponse(
      "AI_RATE_LIMITED",
      `User query rate limit exceeded. Please wait ${userRate.retryAfterSeconds} seconds.`,
      requestId,
      429,
      userRate.retryAfterSeconds,
    );
  }

  const projectRate = checkBucket(projectBuckets, projectId, PROJECT_MAX_TOKENS, PROJECT_REFILL_MS);
  if (!projectRate.allowed) {
    return createSanitizedErrorResponse(
      "AI_RATE_LIMITED",
      `Project query rate limit exceeded. Please wait ${projectRate.retryAfterSeconds} seconds.`,
      requestId,
      429,
      projectRate.retryAfterSeconds,
    );
  }

  // 5. Tenant Authorization & Project Membership Check
  const membership = await verifyProjectMembership(userId, projectId, workspace);
  if (!membership.allowed) {
    // Record security audit event
    AuditTrail.record({
      requestId,
      userId,
      projectId,
      toolName: "ai_gateway",
      actionType: "UNAUTHORIZED",
      status: "denied",
      details: `Cross-tenant access blocked: User '${userId}' is not a member of project '${projectId}'.`,
    });

    return createSanitizedErrorResponse(
      "AI_FORBIDDEN",
      `Access denied: You do not have permission to access project '${projectId}'.`,
      requestId,
      403,
    );
  }

  // 6. Construct Security Context
  const securityContext: AISecurityContext = {
    userId,
    projectId,
    role: membership.role,
    requestId,
  };

  // 7. Redact incoming query
  const sanitizedQuery = SecretRedactor.redact(query.trim()).redactedText;

  // 8. Process AI Query through Orchestrator
  try {
    const result: OrchestrationResult = await AIOrchestrator.processQuery({
      query: sanitizedQuery,
      ws: workspace,
      activeNode,
      memberFiles,
      userId,
      securityContext,
      modelPreference,
      chatHistory,
    });

    // Redact final response
    const sanitizedResult = {
      ...result,
      text: SecretRedactor.redact(result.text).redactedText,
      requestId,
    };

    return new Response(JSON.stringify(sanitizedResult), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
    });
  } catch (err: any) {
    logger.error("AI Gateway Orchestration Failure", { error: err.message, requestId });

    if (err instanceof AuthenticationError) {
      return createSanitizedErrorResponse("AI_UNAUTHORIZED", err.message, requestId, 401);
    }
    if (err instanceof AuthorizationError) {
      return createSanitizedErrorResponse("AI_FORBIDDEN", err.message, requestId, 403);
    }
    if (err instanceof RateLimitError) {
      return createSanitizedErrorResponse("AI_RATE_LIMITED", err.message, requestId, 429, 30);
    }
    if (err instanceof ExternalServiceError) {
      return createSanitizedErrorResponse("AI_PROVIDER_UNAVAILABLE", "AI provider service is currently unavailable.", requestId, 503);
    }

    return createSanitizedErrorResponse(
      "AI_INTERNAL_ERROR",
      "An unexpected error occurred while processing the AI request.",
      requestId,
      500,
    );
  }
}

export async function handleAIApprovalRequest(request: Request): Promise<Response> {
  const requestId = AIObservability.generateRequestId();

  if (request.method !== "POST") {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "Method not allowed. Use POST.", requestId, 405);
  }

  const auth = await authenticateRequest(request);
  if (!auth || !auth.userId) {
    return createSanitizedErrorResponse("AI_UNAUTHORIZED", "Authentication required.", requestId, 401);
  }
  const userId = auth.userId;

  let body: AIApprovalRequestBody;
  try {
    body = await request.json();
  } catch {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "Invalid JSON body.", requestId, 400);
  }

  const { approvalId, decision, projectId, reason, expectedDiffHash } = body;

  if (!approvalId || !decision || !projectId) {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "approvalId, decision, and projectId are required.", requestId, 400);
  }

  if (decision !== "approved" && decision !== "rejected") {
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", "decision must be 'approved' or 'rejected'.", requestId, 400);
  }

  // Tenant Authorization
  const membership = await verifyProjectMembership(userId, projectId);
  if (!membership.allowed) {
    return createSanitizedErrorResponse("AI_FORBIDDEN", "Unauthorized to resolve approvals for this project.", requestId, 403);
  }

  try {
    const resolved = ApprovalGate.resolveApproval({
      approvalId,
      decision,
      userId,
      projectId,
      expectedDiffHash,
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: resolved.status,
        approvalId: resolved.id,
        requestId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "x-request-id": requestId },
      },
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return createSanitizedErrorResponse("AI_FORBIDDEN", err.message, requestId, 403);
    }
    return createSanitizedErrorResponse("AI_INVALID_REQUEST", err.message || "Failed to resolve approval.", requestId, 400);
  }
}

/**
 * Universal Server Gateway Dispatcher
 * Can be plugged directly into Nitro/TanStack Start request router.
 */
export async function handleAIGatewayRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/ai/query") {
    return await handleAIQueryRequest(request);
  }

  if (url.pathname === "/api/ai/approval") {
    return await handleAIApprovalRequest(request);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Compatibility
// ─────────────────────────────────────────────────────────────────────────────

export async function processServerAIQuery(
  input: AIQueryInput,
  clientKey = "default",
  systemPrompt: string,
): Promise<{ text: string; providerUsed: string }> {
  checkRateLimit(clientKey);
  const validated = aiQuerySchema.parse(input);

  const res = await AIOrchestrator.processQuery({
    query: validated.prompt,
    userId: clientKey,
    modelPreference: validated.model,
    chatHistory: validated.chatHistory,
  });

  return {
    text: res.text,
    providerUsed: res.modelUsed,
  };
}
