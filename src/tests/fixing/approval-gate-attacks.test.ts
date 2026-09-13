import { describe, it, expect, beforeEach } from "bun:test";
import {
  ApprovalGate,
  computeDiffHash,
  timingSafeEqual,
  InMemoryApprovalDatabaseAdapter,
} from "@/lib/hacksync/ai/approval-gate";
import { PatchValidator } from "@/lib/hacksync/fixing/patch-validator";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { registerTestMembership, clearTestMemberships } from "@/lib/security/tenant-verifier";
import type { Patch } from "@/lib/hacksync/fixing/fix-types";

describe("Phase 8.3: Adversarial Testing — Approval Gate & Cryptographic Diff Integrity Attacks", () => {
  const projectId = "proj-approval-attack-test";
  const leadUserId = "usr-lead-reviewer";
  const memberUserId = "usr-member-attacker";

  let graph: ProjectKnowledgeGraph;

  beforeEach(() => {
    clearTestMemberships();
    ApprovalGate.setAdapter(new InMemoryApprovalDatabaseAdapter());
    registerTestMembership(projectId, leadUserId, "lead");
    registerTestMembership(projectId, memberUserId, "member");

    graph = new ProjectKnowledgeGraph(projectId);
    graph.indexFile("src/auth/token.ts", "export const secret = 'dev-secret';");
  });

  it("should successfully process a valid approval when signatures, roles, and hashes match", async () => {
    const originalCode = "export const secret = 'dev-secret';";
    const patchedCode = "export const secret = process.env.TOKEN_SECRET || '';";
    const diff = `--- a/src/auth/token.ts\n+++ b/src/auth/token.ts\n@@ -1,1 +1,1 @@\n-export const secret = 'dev-secret';\n+export const secret = process.env.TOKEN_SECRET || '';\n`;

    const diffHash = await computeDiffHash(diff);

    const request = await ApprovalGate.createApprovalRequest({
      requestId: "req-valid-1",
      projectId,
      userId: leadUserId,
      toolName: "apply_patch",
      operation: "Remediate hardcoded secret",
      summary: "Replace hardcoded secret with environment variable",
      rationale: "CWE-798 security remediation",
      filesAffected: ["src/auth/token.ts"],
      diffPreview: diff,
    });

    expect(request.status).toBe("pending");
    expect(request.diffHash).toBe(diffHash);

    // Resolve as Lead
    const resolved = await ApprovalGate.resolveApproval({
      approvalId: request.id,
      userId: leadUserId,
      projectId,
      decision: "approved",
      expectedDiffHash: diffHash,
    });

    expect(resolved.status).toBe("approved");

    // PatchValidator verification
    const patch: Patch = {
      id: "patch-valid",
      proposalId: "prop-1",
      projectId,
      files: [
        {
          path: "src/auth/token.ts",
          originalContent: originalCode,
          patchedContent: patchedCode,
          baseHash: PatchGenerator.sha256(originalCode),
          patchHash: PatchGenerator.sha256(patchedCode),
          diff,
        },
      ],
      diff,
      diffHash,
      createdAt: new Date().toISOString(),
    };

    const validation = PatchValidator.validate({
      projectId,
      patch,
      graph,
      approvedFiles: ["src/auth/token.ts"],
      expectedDiffHash: diffHash,
    });

    expect(validation.valid).toBe(true);
    expect(validation.diffHashMatched).toBe(true);
    expect(validation.baseHashesMatched).toBe(true);
  });

  it("should reject an expired approval request when past the expiration window", async () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n";
    const diffHash = await computeDiffHash(diff);

    // Create an approval with negative TTL (already expired)
    const request = await ApprovalGate.createApprovalRequest({
      requestId: "req-expired",
      projectId,
      userId: leadUserId,
      toolName: "apply_patch",
      operation: "Test operation",
      summary: "Summary",
      rationale: "Rationale",
      filesAffected: ["src/auth/token.ts"],
      diffPreview: diff,
      ttlMs: -10000,
    });

    // Attempting to resolve expired approval must throw AuthorizationError
    await expect(
      ApprovalGate.resolveApproval({
        approvalId: request.id,
        userId: leadUserId,
        projectId,
        decision: "approved",
        expectedDiffHash: diffHash,
      })
    ).rejects.toThrow();
  });

  it("should prevent replay attacks on already-used approval requests", async () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n";
    const diffHash = await computeDiffHash(diff);

    const request = await ApprovalGate.createApprovalRequest({
      requestId: "req-replay",
      projectId,
      userId: leadUserId,
      toolName: "apply_patch",
      operation: "Test operation",
      summary: "Summary",
      rationale: "Rationale",
      filesAffected: ["src/auth/token.ts"],
      diffPreview: diff,
    });

    // First resolution succeeds
    await ApprovalGate.resolveApproval({
      approvalId: request.id,
      userId: leadUserId,
      projectId,
      decision: "approved",
      expectedDiffHash: diffHash,
    });

    // Second resolution attempt must fail closed (already resolved)
    await expect(
      ApprovalGate.resolveApproval({
        approvalId: request.id,
        userId: leadUserId,
        projectId,
        decision: "approved",
        expectedDiffHash: diffHash,
      })
    ).rejects.toThrow();
  });

  it("should block non-lead users from approving patch proposals", async () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n";
    const diffHash = await computeDiffHash(diff);

    const request = await ApprovalGate.createApprovalRequest({
      requestId: "req-role-attack",
      projectId,
      userId: leadUserId,
      toolName: "apply_patch",
      operation: "Test operation",
      summary: "Summary",
      rationale: "Rationale",
      filesAffected: ["src/auth/token.ts"],
      diffPreview: diff,
    });

    // Regular member attempts to approve
    await expect(
      ApprovalGate.resolveApproval({
        approvalId: request.id,
        userId: memberUserId, // member role
        projectId,
        decision: "approved",
        expectedDiffHash: diffHash,
      })
    ).rejects.toThrow();
  });

  it("should reject diff tampering when the patch content is altered post-approval", async () => {
    const approvedDiff = "--- a/src/auth/token.ts\n+++ b/src/auth/token.ts\n-safe\n+safe_fix\n";
    const approvedDiffHash = await computeDiffHash(approvedDiff);

    const tamperedDiff = "--- a/src/auth/token.ts\n+++ b/src/auth/token.ts\n-safe\n+backdoor();\n";
    const tamperedDiffHash = await computeDiffHash(tamperedDiff);

    const patch: Patch = {
      id: "patch-tampered",
      proposalId: "prop-tampered",
      projectId,
      files: [
        {
          path: "src/auth/token.ts",
          originalContent: "safe",
          patchedContent: "backdoor();",
          baseHash: PatchGenerator.sha256("safe"),
          patchHash: PatchGenerator.sha256("backdoor();"),
          diff: tamperedDiff,
        },
      ],
      diff: tamperedDiff,
      diffHash: tamperedDiffHash, // Attacker calculated hash for tampered diff
      createdAt: new Date().toISOString(),
    };

    // PatchValidator compares against the authoritative expectedDiffHash that human approved
    const validation = PatchValidator.validate({
      projectId,
      patch,
      graph,
      approvedFiles: ["src/auth/token.ts"],
      expectedDiffHash: approvedDiffHash, // What human approved
    });

    expect(validation.valid).toBe(false);
    expect(validation.errorCode).toBe("PATCH_HASH_MISMATCH");
    expect(validation.diffHashMatched).toBe(false);
  });

  it("should detect base-state changes and reject stale patches (TOCTOU prevention)", () => {
    const initialContent = "export const secret = 'dev-secret';";
    const diff = "--- a/src/auth/token.ts\n+++ b/src/auth/token.ts\n";
    const diffHash = PatchGenerator.sha256(diff);

    const patch: Patch = {
      id: "patch-stale",
      proposalId: "prop-stale",
      projectId,
      files: [
        {
          path: "src/auth/token.ts",
          operation: "modify",
          originalContent: initialContent,
          patchedContent: "export const safe = true;",
          oldHash: PatchGenerator.sha256(initialContent),
          baseHash: PatchGenerator.sha256(initialContent),
          patchHash: PatchGenerator.sha256("export const safe = true;"),
          diff,
        },
      ],
      diff,
      diffHash,
      createdAt: new Date().toISOString(),
    };

    // Another developer concurrently modified the file on disk/graph
    graph.indexFile("src/auth/token.ts", "export const secret = 'concurrently-modified-content';");

    const validation = PatchValidator.validate({
      projectId,
      patch,
      graph,
      approvedFiles: ["src/auth/token.ts"],
      expectedDiffHash: diffHash,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errorCode).toBe("PATCH_BASE_STATE_MISMATCH");
    expect(validation.baseHashesMatched).toBe(false);
  });

  it("should reject patch application targeting an incorrect or cross-tenant project", () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n";
    const diffHash = PatchGenerator.sha256(diff);

    const patch: Patch = {
      id: "patch-wrong-proj",
      proposalId: "prop-wrong-proj",
      projectId: "proj-alien-tenant", // Different project
      files: [],
      diff,
      diffHash,
      createdAt: new Date().toISOString(),
    };

    const validation = PatchValidator.validate({
      projectId: "proj-target-tenant",
      patch,
      graph,
      approvedFiles: [],
      expectedDiffHash: diffHash,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errorCode).toBe("PATCH_PROJECT_MISMATCH");
  });
});
