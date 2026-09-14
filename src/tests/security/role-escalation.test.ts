/**
 * HackSync Security Hardening: Role Escalation Prevention Tests
 * Verifies that members cannot escalate their own role to lead/owner.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { registerTestMembership, clearTestMemberships, verifyProjectMembership } from "@/lib/security/tenant-verifier";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";

describe("Security Hardening: Role Escalation Prevention", () => {
  const projectId = "proj-role-escalation-test";
  const memberUserId = "user-basic-member";
  const leadUserId = "user-lead-approver";

  beforeEach(() => {
    clearTestMemberships();
    ApprovalGate.clear();
    registerTestMembership(projectId, memberUserId, "member");
    registerTestMembership(projectId, leadUserId, "lead");
  });

  afterEach(() => {
    clearTestMemberships();
    ApprovalGate.clear();
  });

  it("should verify member role is correctly returned as 'member'", async () => {
    const result = await verifyProjectMembership(memberUserId, projectId);
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("member");
  });

  it("should verify lead role is correctly returned as 'lead'", async () => {
    const result = await verifyProjectMembership(leadUserId, projectId);
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("lead");
  });

  it("should deny approval resolution by a member (role too low)", async () => {
    // Create an approval request
    const approval = await ApprovalGate.requestApproval({
      projectId,
      userId: leadUserId,
      toolName: "apply-patch",
      summary: "Test fix",
      risk: "medium",
      diffPreview: "--- a/test.ts\n+++ b/test.ts\n@@ -1 +1 @@\n-old\n+new",
      filesAffected: ["test.ts"],
    });

    // Member tries to approve — should be rejected
    await expect(
      ApprovalGate.resolveApproval(approval.id, "approved", memberUserId, projectId)
    ).rejects.toThrow(/insufficient.*role|member.*cannot|not authorized/i);
  });

  it("should deny access for non-member users", async () => {
    const result = await verifyProjectMembership("user-not-a-member", projectId);
    expect(result.allowed).toBe(false);
  });

  it("should deny access for empty userId", async () => {
    const result = await verifyProjectMembership("", projectId);
    expect(result.allowed).toBe(false);
  });

  it("should deny access for empty projectId", async () => {
    const result = await verifyProjectMembership(memberUserId, "");
    expect(result.allowed).toBe(false);
  });
});
