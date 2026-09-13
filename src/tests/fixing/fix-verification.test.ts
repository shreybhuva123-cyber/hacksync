import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { FixPlanner } from "@/lib/hacksync/fixing/fix-planner";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import { PatchValidator } from "@/lib/hacksync/fixing/patch-validator";
import { PatchApplier } from "@/lib/hacksync/fixing/patch-applier";
import { FixVerificationEngine } from "@/lib/hacksync/fixing/fix-verification";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import type { SecurityFinding } from "@/lib/hacksync/security/finding-types";
import type { Patch, FixIterationState } from "@/lib/hacksync/fixing/fix-types";
import { AuthorizationError } from "@/lib/errors";
import { registerTestMembership, clearTestMemberships } from "@/lib/ai/ai-gateway";

describe("HackSync Phase 4: Fix Engine & Multi-Dimensional Verification", () => {
  const projectId = "proj-fix-verify-1";
  const userId = "usr-engineer-1";

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
  });

  function createSampleGraph(): ProjectKnowledgeGraph {
    const graph = new ProjectKnowledgeGraph(projectId);
    graph.indexFile(
      "src/services/auth.ts",
      `export function authenticateUser(username: string, pass: string): boolean {
  const query = "SELECT * FROM users WHERE name = '" + username + "'";
  return true;
}`,
    );
    graph.indexFile(
      "src/services/payment.ts",
      `export function chargeCard(token: string, amount: number): boolean {
  if (amount <= 0) return false;
  return true;
}`,
    );
    return graph;
  }

  const sampleFinding: SecurityFinding = {
    id: "SEC-SQL-99",
    ruleId: "SQL_INJECTION",
    title: "SQL Injection in authenticateUser",
    severity: "critical",
    confidence: "very_high",
    filePath: "src/services/auth.ts",
    startLine: 2,
    endLine: 2,
    snippet: `const query = "SELECT * FROM users WHERE name = '" + username + "';";`,
    description: "Dynamic string concatenation in SQL statement",
    remediation: "Use parameterized query bindings",
    category: "OWASP_A03_INJECTION",
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Fix Proposal Generation
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Fix Proposal Generation (Evidence-First & Human-in-the-Loop)", () => {
    it("should formulate structured FixProposal with root cause, verified evidence, and regression risks", () => {
      const graph = createSampleGraph();
      const proposal = FixPlanner.planFix({
        graph,
        projectId,
        finding: sampleFinding,
        filePath: "src/services/auth.ts",
        issueDescription: "Fix the SQL injection in authenticateUser",
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.projectId).toBe(projectId);
      expect(proposal.findingId).toBe("SEC-SQL-99");
      expect(proposal.title).toContain("authenticateUser");
      expect(proposal.rootCause).toContain("concatenation");
      expect(proposal.evidence.length).toBeGreaterThan(0);
      expect(proposal.affectedFiles).toContain("src/services/auth.ts");
      expect(proposal.regressionRisks.length).toBeGreaterThan(0);
      expect(proposal.patch).toBeDefined();
      expect(proposal.patch.diffHash).toBeDefined();
      expect(proposal.patch.baseStateHash).toBeDefined();

      // STRICT RULE: requiresApproval must always be true
      expect(proposal.requiresApproval).toBe(true);
    });

    it("should compute SHA-256 base and diff hashes on patches", () => {
      const original = "export const x = 1;\n";
      const modified = "export const x = 2;\n";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/utils.ts",
        originalContent: original,
        modifiedContent: modified,
      });

      expect(patch.baseStateHash).toHaveLength(64); // SHA-256 hex
      expect(patch.diffHash).toHaveLength(64);
      expect(patch.files[0]?.oldHash).toHaveLength(64);
      expect(patch.files[0]?.newHash).toHaveLength(64);
      expect(patch.files[0]?.diff).toContain("-export const x = 1;");
      expect(patch.files[0]?.diff).toContain("+export const x = 2;");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Patch Validator
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Patch Validator (Integrity, Traversal & Containment)", () => {
    it("should accept valid patch when base matches and files are approved", () => {
      const graph = createSampleGraph();
      const content = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: content,
        modifiedContent: content.replace("SELECT *", "SELECT id, name"),
      });

      const validation = PatchValidator.validate({
        patch,
        graph,
        approvedFiles: ["src/services/auth.ts"],
      });

      expect(validation.valid).toBe(true);
      expect(validation.baseHashesMatched).toBe(true);
      expect(validation.diffHashMatched).toBe(true);
    });

    it("should reject patch when base state has been modified (PATCH_BASE_STATE_MISMATCH)", () => {
      const graph = createSampleGraph();
      const originalContent = "export const v = 1;\n";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent,
        modifiedContent: "export const v = 2;\n",
      });

      // Graph currently has different content -> base hash will mismatch!
      const validation = PatchValidator.validate({
        patch,
        graph,
        approvedFiles: ["src/services/auth.ts"],
      });

      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe("PATCH_BASE_STATE_MISMATCH");
      expect(validation.errorMessage).toContain("Base state mismatch");
    });

    it("should reject patch containing unapproved or unexpected files", () => {
      const graph = createSampleGraph();
      const content = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: content,
        modifiedContent: content + "\n// modified",
      });

      // Approved list only allows payment.ts, not auth.ts
      const validation = PatchValidator.validate({
        patch,
        graph,
        approvedFiles: ["src/services/payment.ts"],
      });

      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe("UNEXPECTED_PATCH_FILE");
    });

    it("should reject path traversal in patch target path", () => {
      const graph = createSampleGraph();
      const patch: Patch = {
        id: "patch-traversal",
        projectId,
        baseStateHash: "0".repeat(64),
        diffHash: "0".repeat(64),
        createdAt: new Date().toISOString(),
        files: [
          {
            path: "../../etc/passwd",
            operation: "modify",
            diff: "root:x:0:0::/root:/bin/bash",
          },
        ],
      };

      const validation = PatchValidator.validate({
        patch,
        graph,
      });

      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe("PATCH_PATH_FORBIDDEN");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Patch Applier & Atomic Rollback
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Patch Applier (Transactional Application & Atomic Rollback)", () => {
    it("should apply valid patch successfully when approved", async () => {
      const graph = createSampleGraph();
      const authContent = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: authContent,
        modifiedContent: authContent.replace("WHERE name = '", "WHERE name = ? --"),
      });

      // Request and approve through ApprovalGate
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: patch.id },
        reason: "Fix SQL injection",
        risk: "medium",
        projectId,
        userId,
        patchHash: patch.diffHash,
        targetFiles: ["src/services/auth.ts"],
      });

      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      const result = await PatchApplier.apply({
        patch,
        graph,
        approvalId: approval.id,
        userId,
        projectId,
        approvedFiles: ["src/services/auth.ts"],
      });

      expect(result.success).toBe(true);
      expect(result.appliedFiles).toContain("src/services/auth.ts");
      expect(result.rolledBack).toBe(false);

      // Verify file was updated in knowledge graph
      const updated = graph.getFileContent("src/services/auth.ts");
      expect(updated).toContain("WHERE name = ? --");
    });

    it("should block patch application without prior human approval", async () => {
      const graph = createSampleGraph();
      const authContent = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: authContent,
        modifiedContent: authContent + "\n// extra line",
      });

      expect(
        PatchApplier.apply({
          patch,
          graph,
          approvalId: "non-existent-approval-id",
          userId,
          projectId,
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("should atomically roll back all files if patch fails midway", async () => {
      const graph = createSampleGraph();
      const authContent = graph.getFileContent("src/services/auth.ts") || "";

      // Multi-file patch where second file has corrupt/mismatched base
      const patch: Patch = {
        id: "patch-multi-fail",
        projectId,
        baseStateHash: "dummy",
        diffHash: "dummy",
        createdAt: new Date().toISOString(),
        files: [
          {
            path: "src/services/auth.ts",
            operation: "modify",
            diff: "@@ -1,4 +1,4 @@\n-export function\n+export async function",
          },
          {
            path: "src/services/non_existent.ts",
            operation: "modify", // modify non-existent file will fail
            diff: "@@ -1,1 +1,1 @@\n-old\n+new",
          },
        ],
      };

      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: patch.id },
        reason: "Test rollback",
        risk: "high",
        projectId,
        userId,
        patchHash: patch.diffHash,
        targetFiles: ["src/services/auth.ts", "src/services/non_existent.ts"],
      });
      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      const result = await PatchApplier.apply({
        patch,
        graph,
        approvalId: approval.id,
        userId,
        projectId,
      });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);

      // Verify original file state in auth.ts was restored
      const restored = graph.getFileContent("src/services/auth.ts");
      expect(restored).toBe(authContent);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Multi-Dimensional Fix Verification & 3-Iteration Guard
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Fix Verification Engine & 3-Iteration Limit", () => {
    it("should execute verification pipeline and confirm bug resolution", async () => {
      const graph = createSampleGraph();
      const authContent = graph.getFileContent("src/services/auth.ts") || "";
      const fixedContent = `export function authenticateUser(username: string, pass: string): boolean {
  const query = "SELECT * FROM users WHERE name = $1";
  return true;
}`;

      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: authContent,
        modifiedContent: fixedContent,
      });

      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: patch.id },
        reason: "Param query fix",
        risk: "medium",
        projectId,
        userId,
        patchHash: patch.diffHash,
        targetFiles: ["src/services/auth.ts"],
      });
      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      // Apply fix
      await PatchApplier.apply({
        patch,
        graph,
        approvalId: approval.id,
        userId,
        projectId,
        approvedFiles: ["src/services/auth.ts"],
      });

      // Run verification
      const verifyOutcome = await FixVerificationEngine.verify({
        projectId,
        userId,
        graph,
        patch,
        approvalId: approval.id,
        originalFinding: sampleFinding,
        testCommand: "bun test src/tests/auth.test.ts",
      });

      expect(verifyOutcome.verification.reindexPassed).toBe(true);
      expect(verifyOutcome.verification.patchIntegrityPassed).toBe(true);
      expect(verifyOutcome.verification.securityPassed).toBe(true);
      expect(verifyOutcome.iterationState.iteration).toBe(1);
    });

    it("should halt after maximum 3 fix iterations and require brand new approval for subsequent proposals", async () => {
      const graph = createSampleGraph();
      const authContent = graph.getFileContent("src/services/auth.ts") || "";

      // Create a patch that does NOT fix the vulnerability
      const brokenPatch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: authContent,
        modifiedContent: authContent + "\n// still broken",
      });

      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: brokenPatch.id },
        reason: "Iterative attempt",
        risk: "medium",
        projectId,
        userId,
        patchHash: brokenPatch.diffHash,
        targetFiles: ["src/services/auth.ts"],
      });
      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      let iterState: FixIterationState = {
        iteration: 0,
        maxIterations: 3,
        history: [],
      };

      // Iteration 1
      const res1 = await FixVerificationEngine.verify({
        projectId,
        userId,
        graph,
        patch: brokenPatch,
        approvalId: approval.id,
        originalFinding: sampleFinding,
        testCommand: "bun test --non-existent-test-to-fail",
        iterationState: iterState,
      });

      expect(res1.iterationState.iteration).toBe(1);
      expect(res1.nextProposal).toBeDefined();
      // MANDATORY CRITICAL RULE: Next proposal requires a brand new approval!
      expect(res1.nextProposal?.requiresApproval).toBe(true);

      // Iteration 2
      const res2 = await FixVerificationEngine.verify({
        projectId,
        userId,
        graph,
        patch: brokenPatch,
        approvalId: approval.id,
        originalFinding: sampleFinding,
        testCommand: "bun test --non-existent-test-to-fail",
        iterationState: res1.iterationState,
      });
      expect(res2.iterationState.iteration).toBe(2);
      expect(res2.nextProposal?.requiresApproval).toBe(true);

      // Iteration 3
      const res3 = await FixVerificationEngine.verify({
        projectId,
        userId,
        graph,
        patch: brokenPatch,
        approvalId: approval.id,
        originalFinding: sampleFinding,
        testCommand: "bun test --non-existent-test-to-fail",
        iterationState: res2.iterationState,
      });
      expect(res3.iterationState.iteration).toBe(3);
      // At iteration 3 (max), no further proposal should be generated
      expect(res3.nextProposal).toBeUndefined();
      expect(res3.verification.explanation).toContain("Maximum fix iterations (3) reached");
    });
  });
});
