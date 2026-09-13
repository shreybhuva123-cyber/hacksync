import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { StaticAuditor } from "@/lib/hacksync/security/static-auditor";
import { FixPlanner } from "@/lib/hacksync/fixing/fix-planner";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import { PatchApplier } from "@/lib/hacksync/fixing/patch-applier";
import { FixVerificationEngine } from "@/lib/hacksync/fixing/fix-verification";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { registerTestMembership, clearTestMemberships } from "@/lib/security/tenant-verifier";
import type { SecurityFinding } from "@/lib/hacksync/security/finding-types";
import type { Patch } from "@/lib/hacksync/fixing/fix-types";

describe("Phase 8.4: Fix -> Test -> Verify Closed Loop End-to-End Suite", () => {
  const projectId = "proj-e2e-fix-verify";
  const userId = "usr-security-lead";

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
  });

  it("should successfully execute full closed loop: Finding -> Root Cause -> Proposal -> Approval -> Apply -> Test -> Rescan -> VERIFIED", async () => {
    const graph = new ProjectKnowledgeGraph(projectId);

    const vulnerableCode = `import { db } from "../db";

export async function findUserByEmail(email: string) {
  // Vulnerable to SQL injection via string concatenation
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.query(query);
}
`;
    graph.indexFile("src/api/users.ts", vulnerableCode);

    // 1. Finding Detection via Passive SAST
    const scanReport = StaticAuditor.runPassiveAudit({ graph, projectId });
    const sqlFinding = scanReport.findings.find(
      (f) => f.ruleId === "SQL_INJECTION" || f.category === "injection"
    );

    expect(sqlFinding).toBeDefined();
    expect(sqlFinding?.filePath).toBe("src/api/users.ts");

    // 2. Fix Planning with Root Cause Analysis
    const proposal = FixPlanner.planFix({
      graph,
      projectId,
      finding: sqlFinding!,
      filePath: "src/api/users.ts",
      issueDescription: "Convert raw concatenated SQL to parameterized query",
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.requiresApproval).toBe(true);
    expect(proposal.rootCause).toBeDefined();
    expect(proposal.affectedFiles).toContain("src/api/users.ts");
    expect(proposal.patch).toBeDefined();

    // 3. Structured Unified Diff Generation & Hashing
    const fixedCode = `import { db } from "../db";

export async function findUserByEmail(email: string) {
  // Parameterized query prevents SQL injection
  const query = "SELECT * FROM users WHERE email = $1";
  return db.query(query, [email]);
}
`;
    const patch = PatchGenerator.generate({
      projectId,
      filePath: "src/api/users.ts",
      originalContent: vulnerableCode,
      modifiedContent: fixedCode,
    });

    expect(patch.diffHash).toBeDefined();
    expect(patch.baseStateHash).toBeDefined();

    // 4. Human Approval Request & Resolution
    const approval = ApprovalGate.requestApproval({
      toolName: "apply_patch",
      arguments: { patchId: patch.id },
      reason: "Remediate SQL injection in findUserByEmail",
      risk: "medium",
      projectId,
      userId,
      patchHash: patch.diffHash,
      targetFiles: ["src/api/users.ts"],
    });

    await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

    // 5. Atomic Patch Application
    const applyResult = await PatchApplier.apply({
      patch,
      graph,
      approvalId: approval.id,
      userId,
      projectId,
      approvedFiles: ["src/api/users.ts"],
    });

    expect(applyResult.success).toBe(true);
    expect(graph.getFileContent("src/api/users.ts")).toBe(fixedCode);

    // 6. Fix Verification Pipeline: Re-index, Targeted Test, Security Rescan
    const verifyOutcome = await FixVerificationEngine.verify({
      projectId,
      userId,
      graph,
      patch,
      approvalId: approval.id,
      originalFinding: sqlFinding,
      testCommand: "bun test",
    });

    expect(verifyOutcome.verification.reindexPassed).toBe(true);
    expect(verifyOutcome.verification.patchIntegrityPassed).toBe(true);
    expect(verifyOutcome.verification.securityPassed).toBe(true);
    expect(verifyOutcome.iterationState.iteration).toBe(1);

    // Rescan should report no remaining injection findings in this file
    const postScanReport = StaticAuditor.runPassiveAudit({
      graph,
      projectId,
      targetFile: "src/api/users.ts",
    });
    const remainingInjections = postScanReport.findings.filter(
      (f) => f.filePath === "src/api/users.ts" && (f.ruleId === "SQL_INJECTION" || f.category === "injection")
    );
    expect(remainingInjections.length).toBe(0);
  });

  it("should fail verification when patch fails to remediate the vulnerability (Negative Test)", async () => {
    const graph = new ProjectKnowledgeGraph(projectId);
    const mockStripeSecret = ["sk", "live", "1234567890abcdef1234567890"].join("_");

    const vulnerableCode = `export function getPaymentSecret() {
  const secret = "${mockStripeSecret}";
  return secret;
}
`;
    graph.indexFile("src/keys.ts", vulnerableCode);

    // Detect finding dynamically using StaticAuditor so ruleId matches
    const initialReport = StaticAuditor.runPassiveAudit({ graph, projectId, targetFile: "src/keys.ts" });
    expect(initialReport.findings.length).toBeGreaterThan(0);
    const finding = initialReport.findings[0];

    // Attacker / bad patch merely renames variable but still keeps secret!
    const fakeFixCode = `export function getPaymentSecret() {
  const renamedSecret = "${mockStripeSecret}"; // renamed
  return renamedSecret;
}
`;

    const patch = PatchGenerator.generate({
      projectId,
      filePath: "src/keys.ts",
      originalContent: vulnerableCode,
      modifiedContent: fakeFixCode,
    });

    const approval = ApprovalGate.requestApproval({
      toolName: "apply_patch",
      arguments: { patchId: patch.id },
      reason: "Attempted fix",
      risk: "high",
      projectId,
      userId,
      patchHash: patch.diffHash,
      targetFiles: ["src/keys.ts"],
    });
    await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

    await PatchApplier.apply({
      patch,
      graph,
      approvalId: approval.id,
      userId,
      projectId,
    });

    // Verification must catch that vulnerability persists
    const verifyOutcome = await FixVerificationEngine.verify({
      projectId,
      userId,
      graph,
      patch,
      approvalId: approval.id,
      originalFinding: finding,
    });

    // Security rescan must NOT pass!
    expect(verifyOutcome.verification.securityPassed).toBe(false);
  });

  it("should fail verification when patch causes targeted tests to fail (Negative Test)", async () => {
    const graph = new ProjectKnowledgeGraph(projectId);
    const originalCode = "export function add(a: number, b: number) { return a + b; }";
    graph.indexFile("src/math.ts", originalCode);

    // Broken patch introducing invalid logic
    const brokenCode = "export function add(a: number, b: number) { return a - b; }";

    const patch = PatchGenerator.generate({
      projectId,
      filePath: "src/math.ts",
      originalContent: originalCode,
      modifiedContent: brokenCode,
    });

    const approval = ApprovalGate.requestApproval({
      toolName: "apply_patch",
      arguments: { patchId: patch.id },
      reason: "Refactor add function",
      risk: "low",
      projectId,
      userId,
      patchHash: patch.diffHash,
      targetFiles: ["src/math.ts"],
    });
    await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

    await PatchApplier.apply({
      patch,
      graph,
      approvalId: approval.id,
      userId,
      projectId,
    });

    // Simulate failing test suite by running with workspacePath pointing to current directory
    const verifyOutcome = await FixVerificationEngine.verify({
      projectId,
      userId,
      graph,
      patch,
      approvalId: approval.id,
      workspacePath: process.cwd(),
      testCommand: "bun test non-existent-file.test.ts",
    });

    // Tests must not pass!
    expect(verifyOutcome.verification.testsPassed).toBe(false);
  });
});
