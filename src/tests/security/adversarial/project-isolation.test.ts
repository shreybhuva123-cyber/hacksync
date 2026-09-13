import { describe, it, expect, beforeEach } from "bun:test";
import {
  handleAIQueryRequest,
  registerTestMembership,
  clearTestMemberships,
} from "@/lib/ai/ai-gateway";
import { TenantGuard, type AISecurityContext } from "@/lib/hacksync/security/tenant-guard";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";

describe("Phase 8.2: Adversarial Testing — Multi-Tenant Project Isolation", () => {
  const projA = "proj-tenant-alpha";
  const projB = "proj-tenant-beta";
  const userA = "usr-alice";
  const userB = "usr-bob";

  beforeEach(() => {
    clearTestMemberships();
    ProjectIndexManager.clear();
    registerTestMembership(projA, userA, "lead");
    registerTestMembership(projB, userB, "member");
  });

  it("should isolate ProjectKnowledgeGraph in memory between distinct tenants", () => {
    const graphA = ProjectIndexManager.getGraph(projA);
    const graphB = ProjectIndexManager.getGraph(projB);

    graphA.indexFile("src/secret-alpha.ts", "export const alphaSecret = 'ALPHA_CRED_999';");
    graphB.indexFile("src/secret-beta.ts", "export const betaSecret = 'BETA_CRED_888';");

    expect(graphA.findSymbol("alphaSecret").length).toBe(1);
    expect(graphA.findSymbol("betaSecret").length).toBe(0);
    expect(graphA.getFileContent("src/secret-beta.ts")).toBeUndefined();

    expect(graphB.findSymbol("betaSecret").length).toBe(1);
    expect(graphB.findSymbol("alphaSecret").length).toBe(0);
    expect(graphB.getFileContent("src/secret-alpha.ts")).toBeUndefined();
  });

  it("should strictly reject cross-tenant AI gateway query when User A requests Project B", async () => {
    const req = new Request("http://localhost/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer test:${userA}`, // User A authenticated
      },
      body: JSON.stringify({
        projectId: projB, // Attempting to query Project B
        query: "Summarize the proprietary architecture",
      }),
    });

    const res = await handleAIQueryRequest(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("AI_FORBIDDEN");
  });

  it("should strictly reject cross-tenant AI gateway query when User B requests Project A", async () => {
    const req = new Request("http://localhost/api/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer test:${userB}`, // User B authenticated
      },
      body: JSON.stringify({
        projectId: projA, // Attempting to query Project A
        query: "Show all API routes and database tables",
      }),
    });

    const res = await handleAIQueryRequest(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("AI_FORBIDDEN");
  });

  it("should throw AuthorizationError when TenantGuard.validateProjectAccess detects project mismatch", () => {
    const context: AISecurityContext = {
      userId: userA,
      projectId: projA,
      role: "lead",
      requestId: "req-isolation-1",
    };

    expect(() => {
      TenantGuard.validateProjectAccess(context, projB, "Read Repository");
    }).toThrow("Cross-tenant violation");
  });

  it("should prevent parameter injection attack trying to redirect tool execution to victim project", async () => {
    const graphA = ProjectIndexManager.getGraph(projA);
    const context: AISecurityContext = {
      userId: userA,
      projectId: projA,
      role: "lead",
      requestId: "req-param-inject",
    };

    const executor = new AIToolExecutor(graphA, context, "req-param-inject");

    const result = await executor.execute("search_symbols", {
      name: "betaSecret",
      projectId: projB, // Attempting to force tool to execute against Project B
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cross-project parameter escape prevented");
  });
});
