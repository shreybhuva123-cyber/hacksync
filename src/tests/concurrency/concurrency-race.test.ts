import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { StaticAuditor } from "@/lib/hacksync/security/static-auditor";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import { PatchApplier } from "@/lib/hacksync/fixing/patch-applier";
import { registerTestMembership, clearTestMemberships } from "@/lib/security/tenant-verifier";
import { RepositoryFixtures } from "../validation/repository-fixtures";

describe("Phase 8.9: Concurrency & Multi-Tenant Race Condition Stress", () => {
  beforeEach(() => {
    ProjectIndexManager.clear();
    ApprovalGate.clear();
    clearTestMemberships();
  });

  it("should process 10 simultaneous AI operations on 10 distinct projects with zero cross-tenant data leakage", async () => {
    const projectCount = 10;
    const projectIds = Array.from({ length: projectCount }, (_, i) => `proj-concurrent-${i + 1}`);

    // Pre-register memberships for each project
    projectIds.forEach((pid, i) => {
      registerTestMembership(pid, `usr-${i + 1}`, "owner");
    });

    // Run 10 parallel asynchronous indexing, SAST scanning, and retrieval tasks
    const tasks = projectIds.map(async (pid, idx) => {
      const graph = ProjectIndexManager.getGraph(pid);

      // Distinct, unique file content per project
      const secretMarker = `SECRET_TOKEN_PROJECT_${idx + 1}`;
      const uniquePath = `src/services/tenant_${idx + 1}.ts`;
      const code = `
        export const TENANT_ID = "${pid}";
        export function getTenantData() {
          return "${secretMarker}";
        }
      `;

      graph.indexFile(uniquePath, code);
      graph.indexFile("src/common.ts", `export const commonVal = ${idx + 1};`);

      // Run passive security audit
      const audit = StaticAuditor.runPassiveAudit({ graph, projectId: pid });

      // Run hybrid retrieval query
      const retrieval = HybridRetrievalEngine.retrieve({
        query: `getTenantData ${pid}`,
        graph,
        limit: 5,
      });

      return {
        projectId: pid,
        uniquePath,
        secretMarker,
        indexedFiles: graph.getAllFilePaths(),
        retrievalHits: retrieval.hits.map((h) => h.filePath),
        auditFindings: audit.findings,
      };
    });

    const results = await Promise.all(tasks);

    expect(results.length).toBe(projectCount);

    // Verify absolute isolation across all 10 concurrent operations
    for (let i = 0; i < results.length; i++) {
      const current = results[i];
      if (!current) continue;

      // Must contain its own unique file
      expect(current.indexedFiles).toContain(current.uniquePath);

      // Must NOT contain any other project's unique file
      for (let j = 0; j < results.length; j++) {
        if (i !== j) {
          const other = results[j];
          if (!other) continue;
          expect(current.indexedFiles).not.toContain(other.uniquePath);
          expect(current.retrievalHits).not.toContain(other.uniquePath);
        }
      }
    }
  });

  it("should handle simultaneous queries during active repository indexing without corruption", async () => {
    const projectId = "proj-concurrent-indexing";
    const graph = new ProjectKnowledgeGraph(projectId);
    const files = RepositoryFixtures.generateSmallRepo();

    // Start background asynchronous indexing
    const indexPromise = (async () => {
      for (const file of files) {
        graph.indexFile(file.path, file.content);
        // Micro-yield to simulate real async I/O interleaving
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    })();

    // Concurrently fire 5 hybrid retrieval queries while indexing is actively progressing
    const queryPromises = Array.from({ length: 5 }, async (_, i) => {
      await new Promise((resolve) => setTimeout(resolve, i * 2));
      return HybridRetrievalEngine.retrieve({
        query: "jwt authentication token",
        graph,
        limit: 3,
      });
    });

    const [_, queryResults] = await Promise.all([indexPromise, Promise.all(queryPromises)]);

    // Ensure all concurrent queries succeeded without crashing
    expect(queryResults.length).toBe(5);
    for (const res of queryResults) {
      expect(res.hits).toBeDefined();
      expect(Array.isArray(res.hits)).toBe(true);
    }

    // Verify graph is fully indexed and healthy post-concurrency
    expect(graph.getAllFilePaths().length).toBe(files.length);
  });

  it("should handle race conditions on patch application: second conflicting patch is safely rejected (TOCTOU)", async () => {
    const projectId = "proj-patch-race";
    const userId = "usr-lead";
    registerTestMembership(projectId, userId, "owner");

    const graph = new ProjectKnowledgeGraph(projectId);
    const initialContent = `export function calculateRate(amount: number) {\n  return amount * 0.1;\n}\n`;
    graph.indexFile("src/billing/rates.ts", initialContent);

    // User A creates Patch 1 from initial base
    const patch1 = PatchGenerator.generate({
      projectId,
      filePath: "src/billing/rates.ts",
      originalContent: initialContent,
      modifiedContent: `export function calculateRate(amount: number) {\n  return amount * 0.15; // User A update\n}\n`,
    });

    // User B creates Patch 2 from the SAME initial base
    const patch2 = PatchGenerator.generate({
      projectId,
      filePath: "src/billing/rates.ts",
      originalContent: initialContent,
      modifiedContent: `export function calculateRate(amount: number) {\n  return amount * 0.20; // User B conflicting update\n}\n`,
    });

    // Both get approved
    const app1 = ApprovalGate.requestApproval({
      toolName: "apply_patch",
      arguments: { patchId: patch1.id },
      reason: "User A adjustment",
      risk: "low",
      projectId,
      userId,
      patchHash: patch1.diffHash,
      targetFiles: ["src/billing/rates.ts"],
    });
    await ApprovalGate.approve(app1.id, userId, { role: "owner", projectId });

    const app2 = ApprovalGate.requestApproval({
      toolName: "apply_patch",
      arguments: { patchId: patch2.id },
      reason: "User B adjustment",
      risk: "low",
      projectId,
      userId,
      patchHash: patch2.diffHash,
      targetFiles: ["src/billing/rates.ts"],
    });
    await ApprovalGate.approve(app2.id, userId, { role: "owner", projectId });

    // User A applies Patch 1 first -> Succeeds!
    const outcome1 = await PatchApplier.apply({
      patch: patch1,
      graph,
      approvalId: app1.id,
      userId,
      projectId,
    });
    expect(outcome1.success).toBe(true);

    // User B attempts to apply Patch 2 now -> Must fail because base state changed!
    const outcome2 = await PatchApplier.apply({
      patch: patch2,
      graph,
      approvalId: app2.id,
      userId,
      projectId,
    });

    expect(outcome2.success).toBe(false);
    expect(outcome2.rolledBack).toBe(true);
    expect(outcome2.error).toContain("PATCH_BASE_STATE_MISMATCH");

    // File content remains User A's modification without corrupt partial state
    expect(graph.getFileContent("src/billing/rates.ts")).toContain("User A update");
    expect(graph.getFileContent("src/billing/rates.ts")).not.toContain("User B conflicting update");
  });

  it("should support multiple concurrent pending approvals without interference", async () => {
    const projectId = "proj-multi-approvals";
    const userId = "usr-lead";
    registerTestMembership(projectId, userId, "owner");

    const approvals = Array.from({ length: 5 }, (_, i) => {
      return ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { fixIndex: i },
        reason: `Fix batch item #${i + 1}`,
        risk: i % 2 === 0 ? "low" : "high",
        projectId,
        userId,
        patchHash: `sha256_hash_mock_${i}`,
        targetFiles: [`src/module_${i}.ts`],
      });
    });

    const pendingList = ApprovalGate.listPending(projectId);
    expect(pendingList.length).toBe(5);

    // Approve items #1, #3, #5 and reject item #2, keep #4 pending
    await ApprovalGate.approve(approvals[0]!.id, userId, { role: "owner", projectId });
    await ApprovalGate.reject(approvals[1]!.id, userId, "Rejected in review");
    await ApprovalGate.approve(approvals[2]!.id, userId, { role: "owner", projectId });

    const remainingPending = ApprovalGate.listPending(projectId);
    expect(remainingPending.length).toBe(2);
    expect(remainingPending.some((a) => a.id === approvals[3]!.id)).toBe(true);
    expect(remainingPending.some((a) => a.id === approvals[4]!.id)).toBe(true);
  });
});
