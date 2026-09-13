/**
 * HackSync Phase 0 AI Security Regression Test Suite
 *
 * Comprehensive validation of:
 * - Backend AI Gateway & Authentication
 * - Multi-tenant Isolation & Scoped Knowledge Graphs
 * - Path Confinement & Traversal Prevention
 * - Permission Boundaries & Approval Gates
 * - Secret Redaction in Context, Logs, and Responses
 * - Rate Limiting & Denial-of-Service Protection
 * - Correlation Request IDs & Error Sanitization
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  handleAIQueryRequest,
  handleAIApprovalRequest,
  resetRateLimits,
} from "@/lib/ai/ai-gateway";
import { TenantGuard, type AISecurityContext } from "@/lib/hacksync/security/tenant-guard";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import type { Workspace } from "@/lib/hacksync/types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Workspace Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTenantWorkspace(projectId: string, ownerId: string, memberId: string): Workspace {
  return {
    project: {
      id: projectId,
      name: `Workspace for ${projectId}`,
      description: "Test isolation workspace",
      repo_url: "https://github.com/hacksync/test",
      default_branch: "main",
      schema_version: "2026-v1",
      invite_code: "INVITE123",
      is_open_demo: false,
      demo_mode: false,
      created_by: ownerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    members: [
      {
        id: "mem-owner",
        project_id: projectId,
        user_id: ownerId,
        display_name: "Project Lead",
        email: "lead@test.com",
        role: "lead",
        branch_name: "main",
        working_area: "Core",
        online: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "mem-dev",
        project_id: projectId,
        user_id: memberId,
        display_name: "Junior Dev",
        email: "dev@test.com",
        role: "member",
        branch_name: "feature/code",
        working_area: "App",
        online: true,
        last_seen_at: new Date().toISOString(),
      },
    ],
    codeNodes: [
      {
        id: "node-app",
        path: "src/app.ts",
        language: "typescript",
        owner_role: "lead",
        status: "synced",
        area: "Core",
        content: `export function executeApp() { return "App v1.0"; }`,
      },
    ],
  };
}

describe("HackSync Phase 0: AI Gateway & Security Controls", () => {
  beforeEach(() => {
    resetRateLimits();
    ProjectIndexManager.clear();
    AuditTrail.clearLocalLogs();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Authentication & Tenant Authorization
  // ───────────────────────────────────────────────────────────────────────────

  it("1. should reject unauthenticated AI requests with 401 Unauthorized", async () => {
    const request = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Find security vulnerabilities in auth",
        projectId: "proj-alpha",
      }),
    });

    const response = await handleAIQueryRequest(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe("AI_UNAUTHORIZED");
    expect(body.error.requestId).toBeDefined();
  });

  it("2. should reject cross-tenant AI requests with 403 Forbidden", async () => {
    const wsAlpha = createTenantWorkspace("proj-alpha", "usr-lead-a", "usr-dev-a");

    const request = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test:usr-dev-a",
      },
      body: JSON.stringify({
        query: "What are the database endpoints?",
        projectId: "proj-beta", // Attempting unauthorized access to project Beta
        workspace: wsAlpha,
      }),
    });

    const response = await handleAIQueryRequest(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error.code).toBe("AI_FORBIDDEN");
    expect(body.error.message).toContain("Access denied");
    expect(body.error.requestId).toBeDefined();
  });

  it("3. should record a security audit event on cross-tenant access attempts", async () => {
    const wsAlpha = createTenantWorkspace("proj-alpha", "usr-lead-a", "usr-dev-a");

    const request = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test:usr-dev-a",
      },
      body: JSON.stringify({
        query: "Access secrets from other workspace",
        projectId: "proj-secret-vault",
        workspace: wsAlpha,
      }),
    });

    await handleAIQueryRequest(request);

    const logs = AuditTrail.getLocalLogs();
    const violationLog = logs.find(
      (l) => l.actionType === "UNAUTHORIZED" && l.userId === "usr-dev-a",
    );

    expect(violationLog).toBeDefined();
    expect(violationLog?.status).toBe("denied");
    expect(violationLog?.details).toContain("Cross-tenant access blocked");
    expect(violationLog?.requestId).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Path Confinement & Traversal Prevention
  // ───────────────────────────────────────────────────────────────────────────

  it("4. should reject directory traversal attempts using '../' in file paths", () => {
    expect(() => {
      TenantGuard.sanitizeFilePath("../../etc/passwd");
    }).toThrow("Directory traversal sequence");

    expect(() => {
      TenantGuard.sanitizeFilePath("src/../../secret.env");
    }).toThrow("Directory traversal sequence");
  });

  it("5. should reject absolute paths, Windows drive letters, and UNC paths", () => {
    expect(() => {
      TenantGuard.sanitizeFilePath("/etc/shadow");
    }).toThrow("Absolute paths");

    expect(() => {
      TenantGuard.sanitizeFilePath("C:\\Windows\\System32\\cmd.exe");
    }).toThrow("Absolute paths, Windows drive letters, and UNC paths are prohibited");

    expect(() => {
      TenantGuard.sanitizeFilePath("\\\\network\\share\\data");
    }).toThrow("Absolute paths, Windows drive letters, and UNC paths are prohibited");
  });

  it("6. should reject URL-encoded path traversal sequences (%2e%2e%2f)", () => {
    expect(() => {
      TenantGuard.sanitizeFilePath("%2e%2e%2f%2e%2e%2fetc%2fpasswd");
    }).toThrow();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Permission Boundaries & Command Execution Prohibition
  // ───────────────────────────────────────────────────────────────────────────

  it("7. should prevent non-lead/member roles from executing mutating operations without approval", () => {
    const readContext: AISecurityContext = {
      userId: "usr-dev-a",
      projectId: "proj-alpha",
      role: "member",
      requestId: "req-sec-test",
    };

    const accessCheck = TenantGuard.validateFileAccess(readContext, "src/index.ts", "MUTATE");
    expect(accessCheck.allowed).toBe(false);
    expect(accessCheck.reason).toContain("cannot mutate project files directly without approval");
  });

  it("8. should permanently block host arbitrary command execution in production boundary", async () => {
    const context: AISecurityContext = {
      userId: "usr-lead-a",
      projectId: "proj-alpha",
      role: "lead",
      requestId: "req-cmd-test",
    };

    const graph = new ProjectKnowledgeGraph();
    const executor = new AIToolExecutor(graph, context, "req-cmd-test");

    const result = await executor.execute("execute_command", { command: "rm -rf /" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("strictly disabled in Phase 0");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Approval Gates & Diff Hash Integrity
  // ───────────────────────────────────────────────────────────────────────────

  it("9. should route mutating tools to ApprovalGate requiring user authorization", async () => {
    const context: AISecurityContext = {
      userId: "usr-lead-a",
      projectId: "proj-alpha",
      role: "lead",
      requestId: "req-patch-test",
    };

    const graph = new ProjectKnowledgeGraph();
    const executor = new AIToolExecutor(graph, context, "req-patch-test");

    const result = await executor.execute("apply_patch", {
      path: "src/app.ts",
      patch: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export function executeApp() { return "App v1.0"; }\n+export function executeApp() { return "App v2.0"; }\n',
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.approvalId).toBeDefined();
    expect(result.data?.status).toBe("PENDING_APPROVAL");

    const pending = ApprovalGate.getPendingForProject("proj-alpha");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].toolName).toBe("apply_patch");
    expect(pending[0].diffHash).toBeDefined();
  });

  it("10. should reject approval resolution by unauthorized users from another project", () => {
    const approval = ApprovalGate.requestApproval({
      requestId: "req-appr-1",
      projectId: "proj-alpha",
      userId: "usr-lead-a",
      toolName: "apply_patch",
      summary: "Update app version",
      rationale: "Upgrade core",
      filesAffected: ["src/app.ts"],
      diffPreview: "diff-content-v1",
    });

    // An attacker from proj-beta attempts to resolve proj-alpha's approval
    expect(() => {
      ApprovalGate.resolveApproval({
        approvalId: approval.id,
        decision: "approved",
        userId: "usr-dev-b",
        projectId: "proj-beta", // Cross-project attempt!
      });
    }).toThrow("Cross-project approval violation");
  });

  it("11. should reject approval resolution if diff has been tampered with", () => {
    const diff = "--- original diff\n+++ updated diff";
    const approval = ApprovalGate.requestApproval({
      requestId: "req-tamper-1",
      projectId: "proj-alpha",
      userId: "usr-lead-a",
      toolName: "apply_patch",
      summary: "Patch vulnerability",
      rationale: "Fix injection",
      filesAffected: ["src/login.ts"],
      diffPreview: diff,
    });

    // Resolving with a tampered diff hash must throw
    expect(() => {
      ApprovalGate.resolveApproval({
        approvalId: approval.id,
        decision: "approved",
        userId: "usr-lead-a",
        projectId: "proj-alpha",
        expectedDiffHash: "sha256-tampered-fake-hash",
      });
    }).toThrow("Diff tampering detected");
  });

  it("12. should reject expired approval requests", () => {
    const expiredApproval = ApprovalGate.requestApproval({
      requestId: "req-exp-1",
      projectId: "proj-alpha",
      userId: "usr-lead-a",
      toolName: "apply_patch",
      summary: "Old patch",
      rationale: "Fix bug",
      filesAffected: ["src/app.ts"],
      ttlMs: -1000, // Instantly expired
    });

    expect(() => {
      ApprovalGate.resolveApproval({
        approvalId: expiredApproval.id,
        decision: "approved",
        userId: "usr-lead-a",
        projectId: "proj-alpha",
      });
    }).toThrow("expired");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Secret Redaction
  // ───────────────────────────────────────────────────────────────────────────

  it("13. should redact API keys and bearer tokens from context before model dispatch", () => {
    const rawPrompt = `Here is my key: AIzaSyD9876543210abcdefghijklmnop and OpenAI: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz and token: ghp_1234567890abcdefghijklmnopqrstuvwxyz`;
    const { redactedText } = SecretRedactor.redact(rawPrompt);

    expect(redactedText).not.toContain("AIzaSyD9876543210abcdefghijklmnop");
    expect(redactedText).not.toContain("sk-proj-1234567890");
    expect(redactedText).not.toContain("ghp_1234567890");
    expect(redactedText).toContain("[REDACTED_GOOGLE_KEY]");
    expect(redactedText).toContain("[REDACTED_OPENAI_KEY]");
    expect(redactedText).toContain("[REDACTED_GITHUB_TOKEN]");
  });

  it("14. should redact database connection strings and Anthropic keys from audit logs", () => {
    const sensitiveLog = "Database connection postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres failed with sk-ant-api03-abcdefg1234567890";
    const { redactedText } = SecretRedactor.redact(sensitiveLog);

    expect(redactedText).not.toContain("SuperSecretPassword123");
    expect(redactedText).not.toContain("sk-ant-api03");
    expect(redactedText).toContain("[REDACTED_DB_PASSWORD]");
    expect(redactedText).toContain("[REDACTED_ANTHROPIC_KEY]");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Rate Limiting (User and Project Limits)
  // ───────────────────────────────────────────────────────────────────────────

  it("15. should return 429 Rate Limit with Retry-After header when user quota is exceeded", async () => {
    const ws = createTenantWorkspace("proj-rate-test", "usr-rate-user", "usr-dev");

    // Make 15 requests (token bucket size)
    for (let i = 0; i < 15; i++) {
      const req = new Request("http://localhost:8080/api/ai/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test:usr-rate-user",
        },
        body: JSON.stringify({
          query: "Status update",
          projectId: "proj-rate-test",
          workspace: ws,
        }),
      });
      await handleAIQueryRequest(req);
    }

    // 16th request must be rate-limited
    const blockedReq = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test:usr-rate-user",
      },
      body: JSON.stringify({
        query: "Another query",
        projectId: "proj-rate-test",
        workspace: ws,
      }),
    });

    const response = await handleAIQueryRequest(blockedReq);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeDefined();

    const body = await response.json();
    expect(body.error.code).toBe("AI_RATE_LIMITED");
    expect(body.error.requestId).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Request ID Correlation & Error Sanitization
  // ───────────────────────────────────────────────────────────────────────────

  it("16. should propagate correlation requestId through gateway, headers, and audit records", async () => {
    const ws = createTenantWorkspace("proj-corr", "usr-corr-lead", "usr-corr-dev");

    const req = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test:usr-corr-lead",
      },
      body: JSON.stringify({
        query: "Explain system architecture",
        projectId: "proj-corr",
        workspace: ws,
      }),
    });

    const res = await handleAIQueryRequest(req);
    expect(res.status).toBe(200);

    const headerRequestId = res.headers.get("x-request-id");
    expect(headerRequestId).toBeDefined();

    const body = await res.json();
    expect(body.requestId).toBe(headerRequestId);

    const logs = AuditTrail.getLocalLogs();
    const matchingLog = logs.find((l) => l.requestId === headerRequestId);
    expect(matchingLog).toBeDefined();
    expect(matchingLog?.projectId).toBe("proj-corr");
  });

  it("17. should sanitize errors and never return internal URLs or stack traces to client", async () => {
    // Malformed JSON request
    const req = new Request("http://localhost:8080/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test:usr-corr-lead",
      },
      body: "{ broken json",
    });

    const res = await handleAIQueryRequest(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe("AI_INVALID_REQUEST");
    expect(body.error.message).not.toContain("SyntaxError at");
    expect(body.error.requestId).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. ProjectIndexManager State Isolation
  // ───────────────────────────────────────────────────────────────────────────

  it("18. should ensure Project A's index is completely isolated from Project B", () => {
    const graphA = ProjectIndexManager.getGraph("proj-tenant-a");
    graphA.indexFile("src/alpha.ts", "export function runAlphaMatrix() { return 'OmegaFalcon'; }");

    const graphB = ProjectIndexManager.getGraph("proj-tenant-b");
    graphB.indexFile("src/beta.ts", "export function runBetaVector() { return 'SigmaPanther'; }");

    // Symbol lookup in Project A
    const symbolsA = graphA.findSymbol("runAlphaMatrix");
    expect(symbolsA.length).toBeGreaterThan(0);

    // Verify Project B cannot find Project A's symbol
    const symbolsB = graphB.findSymbol("runAlphaMatrix");
    expect(symbolsB.length).toBe(0);

    // Full-text search in Project A
    const searchA = graphA.search("OmegaFalcon");
    expect(searchA.length).toBeGreaterThan(0);

    // Verify Project B cannot search Project A's content
    const searchB = graphB.search("OmegaFalcon");
    expect(searchB.length).toBe(0);
  });
});
