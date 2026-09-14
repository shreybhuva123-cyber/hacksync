/**
 * HackSync Senior Engineering Hardening: Authoritative Patch Application & Verification Test Suite
 * Tests P0/P1 invariants:
 * - Authoritative approval consumption during patch application
 * - Full-fidelity unified diff hunk application preserving surrounding file context
 * - Post-application SHA-256 hash verification with automatic atomic rollback
 * - Replay attack prevention (double patch application blocked)
 * - FixVerificationEngine detecting real out-of-scope unexpected modifications and hash tampering
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import { PatchApplier, applyUnifiedDiff } from "@/lib/hacksync/fixing/patch-applier";
import { FixVerificationEngine } from "@/lib/hacksync/fixing/fix-verification";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import type { Patch } from "@/lib/hacksync/fixing/fix-types";
import { AuthorizationError } from "@/lib/errors";
import { registerTestMembership, clearTestMemberships } from "@/lib/ai/ai-gateway";

describe("Senior Hardening: Authoritative Patch Application & Verification Integrity", () => {
  const projectId = "proj-authoritative-patch-1";
  const userId = "usr-lead-engineer";

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
  });

  describe("1. Full-Fidelity Unified Diff Hunk Application", () => {
    it("should preserve surrounding context lines when applying a partial hunk", () => {
      const originalLines = [
        "line 1: header",
        "line 2: import { a } from 'a';",
        "line 3: import { b } from 'b';",
        "line 4: function calculate(x: number) {",
        "line 5:   const factor = 10;",
        "line 6:   return x * factor;",
        "line 7: }",
        "line 8: export default calculate;",
      ];
      const original = originalLines.join("\n");

      // Modify only lines 5 and 6
      const diff = [
        "--- a/math.ts",
        "+++ b/math.ts",
        "@@ -4,4 +4,5 @@",
        " line 4: function calculate(x: number) {",
        "-line 5:   const factor = 10;",
        "-line 6:   return x * factor;",
        "+line 5:   const factor = 20;",
        "+line 5.5:   const bonus = 5;",
        "+line 6:   return (x * factor) + bonus;",
        " line 7: }",
      ].join("\n");

      const patched = applyUnifiedDiff(diff, original);
      const patchedLines = patched.split("\n");

      // Verify lines 1-4 and 7-8 are completely preserved
      expect(patchedLines[0]).toBe("line 1: header");
      expect(patchedLines[1]).toBe("line 2: import { a } from 'a';");
      expect(patchedLines[2]).toBe("line 3: import { b } from 'b';");
      expect(patchedLines[3]).toBe("line 4: function calculate(x: number) {");
      expect(patchedLines[4]).toBe("line 5:   const factor = 20;");
      expect(patchedLines[5]).toBe("line 5.5:   const bonus = 5;");
      expect(patchedLines[6]).toBe("line 6:   return (x * factor) + bonus;");
      expect(patchedLines[7]).toBe("line 7: }");
      expect(patchedLines[8]).toBe("line 8: export default calculate;");
    });
  });

  describe("2. Authoritative Approval Consumption & Replay Prevention", () => {
    it("should atomically consume approval during application and block double application", async () => {
      const graph = new ProjectKnowledgeGraph(projectId);
      const initialCode = "const API_KEY = 'secret';\nexport function getKey() { return API_KEY; }";
      graph.indexFile("src/keys.ts", initialCode);

      const fixedCode = "export function getKey() { return process.env['API_KEY'] || ''; }";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/keys.ts",
        originalContent: initialCode,
        modifiedContent: fixedCode,
      });

      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Remediate hardcoded key",
        rationale: "Replace hardcoded secret with env var",
        risk: "medium",
        projectId,
        userId,
        filesAffected: ["src/keys.ts"],
        diffHash: patch.diffHash,
      } as any);

      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      // First application: succeeds and consumes the approval
      const result1 = await PatchApplier.apply({
        patch,
        graph,
        approvalId: approval.id,
        userId,
        projectId,
      });

      expect(result1.success).toBe(true);
      expect(result1.appliedFiles).toContain("src/keys.ts");

      // Verify approval status in authoritative store transitioned from 'approved' to 'applied'
      const authoritative = await ApprovalGate.getAuthoritativeApproval(approval.id, userId, projectId);
      expect(authoritative.status).toBe("applied");

      // Second application with the same approval ID must be rejected (replay attack)
      await expect(
        PatchApplier.apply({
          patch,
          graph,
          approvalId: approval.id,
          userId,
          projectId,
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("3. Post-Application Hash Verification & Atomic Rollback", () => {
    it("should atomically roll back when post-application SHA-256 hash does not match newHash", async () => {
      const graph = new ProjectKnowledgeGraph(projectId);
      const initialCode = "export const version = '1.0.0';";
      graph.indexFile("src/version.ts", initialCode);

      const patch: Patch = {
        id: "patch-tampered-post-hash",
        projectId,
        baseStateHash: PatchGenerator.sha256(`src/version.ts:${PatchGenerator.sha256(initialCode)}\n`),
        diffHash: "diff-hash-123",
        createdAt: new Date().toISOString(),
        files: [
          {
            path: "src/version.ts",
            operation: "modify",
            oldHash: PatchGenerator.sha256(initialCode),
            newHash: "0000000000000000000000000000000000000000000000000000000000000000", // Corrupt expected hash
            diff: "@@ -1,1 +1,1 @@\n-export const version = '1.0.0';\n+export const version = '2.0.0';",
          },
        ],
      };

      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Version bump",
        rationale: "Bump to 2.0.0",
        risk: "low",
        projectId,
        userId,
        filesAffected: ["src/version.ts"],
        diffHash: patch.diffHash,
      } as any);

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
      expect(result.error).toContain("Post-application SHA-256 hash mismatch");

      // Verify file was restored to pristine original content
      expect(graph.getFileContent("src/version.ts")).toBe(initialCode);
    });
  });

  describe("4. FixVerificationEngine Diff Integrity & Scope Verification", () => {
    it("should fail verification if an unapproved file was unexpectedly modified outside patch scope", async () => {
      const graph = new ProjectKnowledgeGraph(projectId);
      const authCode = "function authenticate() { return true; }";
      const billingCode = "function charge() { return 100; }";
      graph.indexFile("src/auth.ts", authCode);
      graph.indexFile("src/billing.ts", billingCode);

      const fixedAuthCode = "function authenticate() { return false; }";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/auth.ts",
        originalContent: authCode,
        modifiedContent: fixedAuthCode,
      });

      // Pre-patch snapshot of file hashes
      const prePatchHashes = new Map<string, string>([
        ["src/auth.ts", PatchGenerator.sha256(authCode)],
        ["src/billing.ts", PatchGenerator.sha256(billingCode)],
      ]);

      // Apply approved patch to auth.ts
      graph.indexFile("src/auth.ts", fixedAuthCode);
      // Malicious or accidental side effect: modify billing.ts outside patch scope!
      graph.indexFile("src/billing.ts", "function charge() { return 0; } // backdoor");

      const outcome = await FixVerificationEngine.verify({
        projectId,
        userId,
        graph,
        patch,
        approvalId: "appr-dummy",
        prePatchFileHashes: prePatchHashes,
      });

      expect(outcome.verification.success).toBe(false);
      expect(outcome.verification.patchIntegrityPassed).toBe(false);
      expect(outcome.verification.unexpectedChanges.some((c) => c.includes("src/billing.ts"))).toBe(true);
    });
  });
});
