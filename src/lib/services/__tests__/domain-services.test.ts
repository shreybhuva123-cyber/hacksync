import { describe, it, expect } from "bun:test";
import {
  createProjectSchema,
  updateProjectSchema,
  joinProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  createContractSchema,
  updateContractSchema,
  createDbTableSchema,
  createDbColumnSchema,
  aiQuerySchema,
} from "@/lib/validation/schemas";
import {
  canDeleteProject,
  canManageMembers,
  canManageContracts,
  canManageSchema,
  canEditProject,
  canViewProject,
} from "@/lib/hacksync/permissions";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
} from "@/lib/errors";

describe("Domain Validation Schemas (Zod)", () => {
  describe("createProjectSchema", () => {
    it("should accept valid project creation inputs", () => {
      const valid = {
        name: "HackSync Core",
        description: "Integration platform",
        repo_url: "https://github.com/hacksync/app",
        role: "lead",
        displayName: "Arjun",
        userId: "usr-123",
      };
      const result = createProjectSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject project with too short name", () => {
      const invalid = {
        name: "A",
        role: "lead",
        displayName: "Arjun",
        userId: "usr-123",
      };
      const result = createProjectSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("createContractSchema", () => {
    it("should accept standard REST contracts", () => {
      const valid = {
        project_id: "p1",
        method: "POST",
        route: "/api/users/register",
        owner_role: "backend",
        auth_required: true,
        version: "v1.0",
      };
      const result = createContractSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject invalid HTTP methods", () => {
      const invalid = {
        project_id: "p1",
        method: "INVALID_METHOD",
        route: "/api/test",
        owner_role: "backend",
      };
      const result = createContractSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject route that does not start with /", () => {
      const invalid = {
        project_id: "p1",
        method: "GET",
        route: "api/test",
        owner_role: "backend",
      };
      const result = createContractSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("createDbTableSchema", () => {
    it("should accept clean SQL table names", () => {
      const valid = {
        project_id: "p1",
        name: "user_accounts",
        owner_role: "database",
      };
      const result = createDbTableSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject table names with SQL injection characters or spaces", () => {
      const invalid = {
        project_id: "p1",
        name: "users; DROP TABLE users;--",
        owner_role: "database",
      };
      const result = createDbTableSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("aiQuerySchema", () => {
    it("should accept valid AI prompts and allowed models", () => {
      const valid = {
        prompt: "Analyze the database schema for missing foreign key indexes.",
        model: "gemini-2.0-flash",
      };
      const result = aiQuerySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject prompt exceeding 4000 characters", () => {
      const invalid = {
        prompt: "A".repeat(4001),
        model: "builtin",
      };
      const result = aiQuerySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

describe("Granular RBAC Matrix & Role Capabilities", () => {
  it("should permit owner to perform all operations", () => {
    expect(canDeleteProject("owner")).toBe(true);
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageContracts("owner")).toBe(true);
    expect(canManageSchema("owner")).toBe(true);
    expect(canEditProject("owner")).toBe(true);
    expect(canViewProject("owner")).toBe(true);
  });

  it("should permit lead to manage contracts and members, but NOT delete project", () => {
    expect(canDeleteProject("lead")).toBe(false);
    expect(canManageMembers("lead")).toBe(true);
    expect(canManageContracts("lead")).toBe(true);
    expect(canManageSchema("lead")).toBe(true);
    expect(canEditProject("lead")).toBe(true);
  });

  it("should permit backend role to manage contracts, but NOT members", () => {
    expect(canManageContracts("backend")).toBe(true);
    expect(canManageMembers("backend")).toBe(false);
    expect(canDeleteProject("backend")).toBe(false);
  });

  it("should permit database role to manage schema, but NOT members", () => {
    expect(canManageSchema("database")).toBe(true);
    expect(canManageMembers("database")).toBe(false);
  });

  it("should permit read-only members to view only", () => {
    expect(canViewProject("member")).toBe(true);
    expect(canManageContracts("member")).toBe(false);
    expect(canManageSchema("member")).toBe(false);
    expect(canManageMembers("member")).toBe(false);
    expect(canDeleteProject("member")).toBe(false);
  });
});

describe("Typed Error Hierarchy", () => {
  it("should construct typed Application errors with correct HTTP status codes", () => {
    const authErr = new AuthenticationError("Invalid token");
    expect(authErr.statusCode).toBe(401);
    expect(authErr.name).toBe("AuthenticationError");

    const authzErr = new AuthorizationError("Insufficient permissions");
    expect(authzErr.statusCode).toBe(403);

    const valErr = new ValidationError("Missing field", { field: "email" });
    expect(valErr.statusCode).toBe(400);

    const rateErr = new RateLimitError("Too many requests");
    expect(rateErr.statusCode).toBe(429);
  });
});
