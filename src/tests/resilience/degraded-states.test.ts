import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { StaticAuditor } from "@/lib/hacksync/security/static-auditor";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { ModelRouter } from "@/lib/ai/model-router";
import { AIGateway } from "@/lib/ai/ai-gateway";
import { ApprovalGate, DatabaseApprovalAdapter } from "@/lib/hacksync/ai/approval-gate";
import { registerTestMembership, clearTestMemberships } from "@/lib/security/tenant-verifier";
import { ExternalServiceError } from "@/lib/errors";

// Mock failing DB adapter for simulated database degradation
class BrokenDatabaseAdapter implements DatabaseApprovalAdapter {
  async insert(): Promise<{ data: null; error: { message: string; code?: string } }> {
    return { data: null, error: { message: "Database connection refused (503 Service Unavailable)", code: "ECONNREFUSED" } };
  }
  async update(): Promise<{ data: null; error: { message: string; code?: string } }> {
    return { data: null, error: { message: "Database connection refused (503 Service Unavailable)", code: "ECONNREFUSED" } };
  }
  async findById(): Promise<{ data: null; error: { message: string; code?: string } }> {
    return { data: null, error: { message: "Database connection refused (503 Service Unavailable)", code: "ECONNREFUSED" } };
  }
  async listByProject(): Promise<{ data: null; error: { message: string; code?: string } }> {
    return { data: null, error: { message: "Database connection refused (503 Service Unavailable)", code: "ECONNREFUSED" } };
  }
}

describe("Phase 8.13: Degraded-State & Offline Resilience Verification", () => {
  const projectId = "proj-degraded-resilience";
  const userId = "usr-resilience-lead";

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
  });

  it("should gracefully handle syntax errors and invalid code in AST parser without crashing the index", () => {
    const graph = new ProjectKnowledgeGraph(projectId);

    // Completely broken, unparseable code (incomplete braces, invalid tokens)
    const malformedTypeScript = `
      function brokenSyntax( {
        const x = @@@;;;
        return &&&
      // missing closing braces
    `;

    const malformedPython = `
      def broken_py(
        indentation error
        x = = = 5
    `;

    // Indexing malformed files must NOT throw unhandled exceptions
    expect(() => graph.indexFile("src/broken.ts", malformedTypeScript)).not.toThrow();
    expect(() => graph.indexFile("workers/broken.py", malformedPython)).not.toThrow();

    // Files are safely recorded in the knowledge graph
    expect(graph.hasFile("src/broken.ts")).toBe(true);
    expect(graph.hasFile("workers/broken.py")).toBe(true);

    // Hybrid retrieval still operates reliably over the rest of the project
    graph.indexFile("src/valid.ts", "export function validFunction() { return 42; }");
    const retrieval = HybridRetrievalEngine.retrieve({
      query: "validFunction",
      graph,
      limit: 3,
    });

    expect(retrieval.hits.length).toBeGreaterThan(0);
    expect(retrieval.hits[0]?.filePath).toBe("src/valid.ts");
  });

  it("should preserve core local intelligence (retrieval, SAST audit) when offline / network down", () => {
    const graph = new ProjectKnowledgeGraph(projectId);
    graph.indexFile("src/api/login.ts", `
      export async function login(req: any) {
        const query = "SELECT * FROM users WHERE id = '" + req.id + "'";
        return db.query(query);
      }
    `);

    // Passive SAST works 100% locally with zero network calls
    const auditReport = StaticAuditor.runPassiveAudit({ graph, projectId });
    expect(auditReport.findings.length).toBeGreaterThan(0);
    expect(auditReport.findings[0]?.category).toBe("injection");

    // Hybrid retrieval works 100% locally
    const searchResult = HybridRetrievalEngine.retrieve({
      query: "login authentication query",
      graph,
      limit: 3,
    });
    expect(searchResult.hits.length).toBeGreaterThan(0);
    expect(searchResult.hits[0]?.filePath).toBe("src/api/login.ts");
  });

  it("should handle complete external AI provider failure by providing structured deterministic report", async () => {
    const graph = AIOrchestrator.getKnowledgeGraph(projectId);
    graph.indexFile("src/services/billing.ts", "export function processPayment() { return true; }");

    // Force offline/fallback execution
    const orchestratorResult = await AIOrchestrator.process({
      query: "explain the architecture and payment processing",
      projectId,
      userId,
      modelPreference: "builtin",
    });

    expect(orchestratorResult).toBeDefined();
    expect(orchestratorResult.modelUsed).toContain("deterministic");
    expect(orchestratorResult.answer).toBeDefined();
    expect(orchestratorResult.answer.length).toBeGreaterThan(50);
    // Verified evidence items included
    expect(Array.isArray(orchestratorResult.evidence)).toBe(true);
  });

  it("should safely handle database degradation during approval creation by rolling back memory and failing safely", async () => {
    ApprovalGate.setAdapter(new BrokenDatabaseAdapter());

    let caughtError: any = null;
    try {
      await ApprovalGate.createApprovalRequest({
        requestId: "req-db-fail-001",
        projectId,
        userId,
        toolName: "apply_patch",
        summary: "Fix payment logic",
        rationale: "Resolves security vulnerability",
        filesAffected: ["src/services/billing.ts"],
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(ExternalServiceError);
    expect(caughtError.message).toContain("Failed to persist approval request to authoritative database");

    // Cache must be cleanly rolled back: zero pending approvals in memory
    const pending = ApprovalGate.listPending(projectId);
    expect(pending.length).toBe(0);
  });
});
