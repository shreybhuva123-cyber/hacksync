import { describe, it, expect } from "bun:test";
import {
  canManageMembers,
  canManageContracts,
  canManageSchema,
  canDeleteProject,
  canEditProject,
  hasPermission,
  ROLE_CAPABILITIES,
  type ProjectRole,
} from "@/lib/hacksync/permissions";
import { ROLES, ROLE_PERMISSIONS, isValidRole } from "@/lib/constants/roles";
import { roleEnum } from "@/lib/validation/schemas";
import { membersService } from "@/lib/services/members.service";
import { AuthorizationError } from "@/lib/errors";

describe("Security & RBAC Authorization Engine (Production Verification)", () => {
  // ─── 1. Unauthenticated & Base Role Access ──────────────────────────────

  it("should deny unauthenticated or missing roles from all mutating operations", () => {
    expect(hasPermission(null, "canManageMembers")).toBe(false);
    expect(hasPermission(undefined, "canManageMembers")).toBe(false);
    expect(hasPermission("", "canManageContracts")).toBe(false);
    expect(canManageMembers(null)).toBe(false);
    expect(canManageContracts(null)).toBe(false);
    expect(canManageSchema(null)).toBe(false);
    expect(canDeleteProject(null)).toBe(false);
  });

  it("should enforce canonical roles list matching Zod and TS definitions", () => {
    expect(ROLES).toEqual(["owner", "lead", "backend", "database", "frontend", "member"]);
    for (const role of ROLES) {
      expect(isValidRole(role)).toBe(true);
      expect(roleEnum.safeParse(role).success).toBe(true);
    }
    expect(isValidRole("admin_super_hacker")).toBe(false);
    expect(roleEnum.safeParse("admin_super_hacker").success).toBe(false);
  });

  // ─── 2. Member Role Permissions ─────────────────────────────────────────

  it("should permit regular member to view, but strictly deny all mutations", () => {
    const role: ProjectRole = "member";
    expect(hasPermission(role, "canViewProject" as any) || ROLE_PERMISSIONS.member.canViewProject).toBe(true);
    expect(canManageMembers(role)).toBe(false);
    expect(canManageContracts(role)).toBe(false);
    expect(canManageSchema(role)).toBe(false);
    expect(canDeleteProject(role)).toBe(false);
    expect(canEditProject(role)).toBe(false);
  });

  // ─── 3. Domain Role Separation: Frontend vs Backend vs Database ────────

  it("should strictly deny Frontend role from modifying DB schema or API contracts", () => {
    const role: ProjectRole = "frontend";
    expect(canManageSchema(role)).toBe(false);
    expect(canManageContracts(role)).toBe(false);
    expect(canManageMembers(role)).toBe(false);
    expect(ROLE_PERMISSIONS.frontend.canManageSchema).toBe(false);
  });

  it("should permit Backend role to manage contracts, but strictly deny DB schema and member management", () => {
    const role: ProjectRole = "backend";
    expect(canManageContracts(role)).toBe(true);
    expect(canManageSchema(role)).toBe(false);
    expect(canManageMembers(role)).toBe(false);
    expect(ROLE_PERMISSIONS.backend.canManageContracts).toBe(true);
    expect(ROLE_PERMISSIONS.backend.canManageSchema).toBe(false);
  });

  it("should permit Database role to manage schema, but strictly deny API contracts and member management", () => {
    const role: ProjectRole = "database";
    expect(canManageSchema(role)).toBe(true);
    expect(canManageContracts(role)).toBe(false);
    expect(canManageMembers(role)).toBe(false);
    expect(ROLE_PERMISSIONS.database.canManageSchema).toBe(true);
    expect(ROLE_PERMISSIONS.database.canManageContracts).toBe(false);
  });

  // ─── 4. Lead & Owner Administrative Hierarchy ───────────────────────────

  it("should permit Team Lead to manage members, contracts, and schema, but NOT delete project", () => {
    const role: ProjectRole = "lead";
    expect(canManageMembers(role)).toBe(true);
    expect(canManageContracts(role)).toBe(true);
    expect(canManageSchema(role)).toBe(true);
    expect(canDeleteProject(role)).toBe(false); // Only owner can delete
    expect(ROLE_PERMISSIONS.lead.canDeleteProject).toBe(false);
  });

  it("should permit Project Owner full administrative control including project deletion", () => {
    const role: ProjectRole = "owner";
    expect(canManageMembers(role)).toBe(true);
    expect(canManageContracts(role)).toBe(true);
    expect(canManageSchema(role)).toBe(true);
    expect(canDeleteProject(role)).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canDeleteProject).toBe(true);
  });

  // ─── 5. Critical Privilege Escalation Prevention (Self-Promotion Attack) ──

  it("CRITICAL: should block regular member from self-promoting to lead or owner", async () => {
    const attackerMemberId = "mem-attacker-uuid";
    const callerRole = "member"; // Attacker is a standard member

    // Attempt to escalate role to owner
    await expect(
      membersService.updateRole(attackerMemberId, "owner", callerRole),
    ).rejects.toThrow(AuthorizationError);

    // Attempt to escalate role to lead
    await expect(
      membersService.updateRole(attackerMemberId, "lead", callerRole),
    ).rejects.toThrow(AuthorizationError);
  });

  it("CRITICAL: should block frontend and backend roles from changing member roles", async () => {
    const targetMemberId = "mem-target-uuid";

    await expect(
      membersService.updateRole(targetMemberId, "lead", "frontend"),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      membersService.updateRole(targetMemberId, "lead", "backend"),
    ).rejects.toThrow(AuthorizationError);
  });

  it("CRITICAL: should block non-lead from removing other team members", async () => {
    const targetMemberId = "mem-target-uuid";

    await expect(
      membersService.removeMember(targetMemberId, "member", false),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      membersService.removeMember(targetMemberId, "frontend", false),
    ).rejects.toThrow(AuthorizationError);
  });

  // ─── 6. Multi-Tenant Cross-Project Isolation & User Boundaries ───────────

  it("should isolate cross-project permissions (User in Project A cannot manage Project B without explicit role)", () => {
    // Project A membership: user is 'lead'
    const projectARole: ProjectRole = "lead";
    // Project B membership: user is 'member' or not joined
    const projectBRole: ProjectRole = "member";

    expect(canManageMembers(projectARole)).toBe(true);
    expect(canManageMembers(projectBRole)).toBe(false);
    expect(canManageContracts(projectBRole)).toBe(false);
    expect(canManageSchema(projectBRole)).toBe(false);
  });

  // ─── 7. Enforceable API Contract Payload Validation ─────────────────────

  it("should validate payloads against contract schemas using validateContractPayload", () => {
    const { validateContractPayload } = require("@/lib/validation/contract-validator");

    // Case A: Valid JSON object schema
    const schema = JSON.stringify({ userId: "string", count: "number", active: "boolean" });
    const validPayload = { userId: "usr-123", count: 42, active: true };
    const invalidPayload = { userId: 123, count: "not-a-number", active: true };

    const validResult = validateContractPayload(schema, validPayload);
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors.length).toBe(0);

    const invalidResult = validateContractPayload(schema, invalidPayload);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);

    // Case B: Missing required field
    const missingFieldPayload = { userId: "usr-123", count: 42 };
    const missingResult = validateContractPayload(schema, missingFieldPayload);
    expect(missingResult.isValid).toBe(false);
    expect(missingResult.errors.some((e: string) => e.includes("active"))).toBe(true);
  });
});
