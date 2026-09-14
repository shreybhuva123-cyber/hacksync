/**
 * HackSync Senior Engineering Hardening: Auth & Approval Security Regression Suite
 * Tests P0 security invariants:
 * - Direct rejection of mock identity fallbacks ('default-project', 'system-user')
 * - Enforcement of strict authentication and project membership in AI Tools
 * - Authoritative approval state transition and immutability
 * - Cross-tenant approval isolation and replay attack prevention
 * - Timing-safe diff hash tampering prevention
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { SecurityScanTool } from "@/lib/hacksync/ai/tools/security-scan";
import { DependencyVulnerabilitiesTool } from "@/lib/hacksync/ai/tools/dependency-vulnerabilities";
import { ApplyPatchTool } from "@/lib/hacksync/ai/tools/apply-patch";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { FixPlanner } from "@/lib/hacksync/fixing/fix-planner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { registerTestMembership, clearTestMemberships } from "@/lib/ai/ai-gateway";

describe("Senior Engineering Hardening: Authentication & Authoritative Approval Gate", () => {
  const validProjectId = "proj-hardening-prod-1";
  const validOwnerId = "usr-lead-1";
  const validMemberId = "usr-dev-member-1";
  const crossTenantProjectId = "proj-other-tenant-9";

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(validProjectId, validOwnerId, "owner");
    registerTestMembership(validProjectId, validMemberId, "member");
    registerTestMembership(crossTenantProjectId, "usr-other-user", "owner");
  });

  describe("1. Rejection of Mock / Default Identities in AI Tools & Fix Planner", () => {
    it("should throw AuthorizationError when FixPlanner is called with 'default-project'", () => {
      const graph = new ProjectKnowledgeGraph("default-project");
      expect(() => {
        FixPlanner.planFix(graph, {
          projectId: "default-project",
          filePath: "src/index.ts",
          issueDescription: "test fix",
        });
      }).toThrow(AuthorizationError);
    });

    it("should throw AuthorizationError when FixPlanner is called with empty projectId", () => {
      const graph = new ProjectKnowledgeGraph("test-proj");
      expect(() => {
        FixPlanner.planFix(graph, {
          projectId: "",
          filePath: "src/index.ts",
          issueDescription: "test fix",
        });
      }).toThrow(AuthorizationError);
    });

    it("should throw AuthenticationError when AI Tool is invoked with 'system-user'", async () => {
      const graph = new ProjectKnowledgeGraph(validProjectId);
      // Direct tool call throws AuthenticationError
      await expect(
        ApplyPatchTool.execute(
          graph,
          { approvalId: "appr-1", patch: { id: "p-1" } as any },
          validProjectId,
          "system-user",
        ),
      ).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthorizationError when AI Tool is invoked with 'default-project'", async () => {
      const graph = new ProjectKnowledgeGraph("default-project");
      // Direct tool call throws AuthorizationError
      expect(() => {
        DependencyVulnerabilitiesTool.execute(
          graph,
          { packageJsonPath: "package.json" },
          "default-project",
          validOwnerId,
        );
      }).toThrow(AuthorizationError);

      // AIToolExecutor execution captures and redacts error
      const executor = new AIToolExecutor(
        graph,
        {
          projectId: "default-project",
          userId: validOwnerId,
          role: "owner",
          membershipChecked: true,
          allowedFilePaths: ["package.json"],
        },
        "req-auth-test-2",
      );
      const res = await executor.execute("dependency_vulnerabilities", { packageJsonPath: "package.json" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Authorized projectId is mandatory");
    });
  });

  describe("2. Authoritative Approval Gate Security & Role Permissions", () => {
    it("should allow owner to request and authoritatively approve code modifications", async () => {
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Security hardening patch",
        rationale: "Fix security issues",
        risk: "medium",
        projectId: validProjectId,
        userId: validOwnerId,
        filesAffected: ["src/security.ts"],
        patchHash: "sha256-original-hash",
      } as any);

      expect(approval.status).toBe("pending");

      const resolved = await ApprovalGate.approve(approval.id, validOwnerId, {
        role: "owner",
        projectId: validProjectId,
      });

      expect(resolved.status).toBe("approved");

      const authoritative = await ApprovalGate.getAuthoritativeApproval(
        approval.id,
        validOwnerId,
        validProjectId,
      );
      expect(authoritative.status).toBe("approved");
      expect(authoritative.resolvedBy).toBe(validOwnerId);
    });

    it("should block non-lead/non-owner member from approving patch proposals", async () => {
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Unauthorized attempt",
        rationale: "Testing member permission blocking",
        risk: "high",
        projectId: validProjectId,
        userId: validOwnerId,
        filesAffected: ["src/billing.ts"],
      } as any);

      await expect(
        ApprovalGate.approve(approval.id, validMemberId, {
          role: "member",
          projectId: validProjectId,
        }),
      ).rejects.toThrow(AuthorizationError);

      const authoritative = await ApprovalGate.getAuthoritativeApproval(
        approval.id,
        validOwnerId,
        validProjectId,
      );
      expect(authoritative.status).toBe("pending");
    });

    it("should prevent cross-project approval resolution", async () => {
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Cross project attempt",
        rationale: "Testing tenant isolation",
        risk: "high",
        projectId: validProjectId,
        userId: validOwnerId,
        filesAffected: ["src/core.ts"],
      } as any);

      await expect(
        ApprovalGate.approve(approval.id, "usr-other-user", {
          role: "owner",
          projectId: crossTenantProjectId,
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject diff tampering during approval resolution using timingSafeEqual", async () => {
      const diff = "--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1 +1 @@\n-old\n+new\n";
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        summary: "Tamper detection test",
        rationale: "Testing diff integrity verification",
        projectId: validProjectId,
        userId: validOwnerId,
        filesAffected: ["src/auth.ts"],
        diffPreview: diff,
      });

      await expect(
        ApprovalGate.resolveApproval({
          approvalId: approval.id,
          decision: "approved",
          userId: validOwnerId,
          projectId: validProjectId,
          expectedDiffHash: "tampered-diff-hash-attempt",
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject double-application replay attacks when consuming approval", async () => {
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: "p-5" },
        reason: "Atomic consumption test",
        risk: "low",
        projectId: validProjectId,
        userId: validOwnerId,
        targetFiles: ["src/utils.ts"],
        patchHash: "sha256-valid-hash",
      });

      await ApprovalGate.approve(approval.id, validOwnerId, {
        role: "owner",
        projectId: validProjectId,
      });

      // First consumption succeeds: approved -> applied
      const consumed = await ApprovalGate.consumeAuthoritativeApproval({
        approvalId: approval.id,
        userId: validOwnerId,
        projectId: validProjectId,
        expectedDiffHash: "sha256-valid-hash",
      });
      expect(consumed.status).toBe("applied");

      // Second consumption must fail (replay attack blocked)
      await expect(
        ApprovalGate.consumeAuthoritativeApproval({
          approvalId: approval.id,
          userId: validOwnerId,
          projectId: validProjectId,
          expectedDiffHash: "sha256-valid-hash",
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
