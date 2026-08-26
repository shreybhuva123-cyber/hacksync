import { z } from "zod";

/**
 * Domain Validation Schemas for HackSync
 * Validates all client and server inputs to ensure data integrity and prevent injection attacks.
 */

// ─── Enums & Identifiers ──────────────────────────────────────────────────

export const roleEnum = z.enum(["frontend", "backend", "database", "lead", "owner", "member"]);
export type ProjectRole = z.infer<typeof roleEnum>;

export const taskStatusEnum = z.enum(["todo", "in_progress", "review", "done"]);
export const taskPriorityEnum = z.enum(["low", "medium", "high", "critical"]);
export const taskAreaEnum = z.enum(["frontend", "backend", "database", "shared"]);

export const httpMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const contractStatusEnum = z.enum(["planned", "in_progress", "live", "broken", "deprecated"]);
export const testStatusEnum = z.enum(["passing", "failing", "untested"]);
export const migrationStatusEnum = z.enum(["applied", "pending", "drifted"]);

export const uuidSchema = z.string().min(1, "Identifier is required.");

// ─── Project Schemas ───────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters.")
    .max(80, "Project name cannot exceed 80 characters."),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters.").optional().nullable(),
  repo_url: z
    .string()
    .trim()
    .url("Repository URL must be a valid URL.")
    .max(255, "Repository URL cannot exceed 255 characters.")
    .optional()
    .nullable()
    .or(z.literal("")),
  default_branch: z.string().trim().min(1).max(50).default("main"),
  role: roleEnum.default("lead"),
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters.").max(50),
  userId: z.string().min(1, "User ID is required."),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  repo_url: z.string().trim().url().max(255).optional().nullable().or(z.literal("")),
  default_branch: z.string().trim().min(1).max(50).optional(),
  schema_version: z.string().trim().min(1).max(20).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const joinProjectSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4, "Invite code must be at least 4 characters.")
    .max(12, "Invite code cannot exceed 12 characters.")
    .toUpperCase(),
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters.").max(50),
  role: roleEnum.default("frontend"),
  userId: z.string().min(1, "User ID is required."),
});

export type JoinProjectInput = z.infer<typeof joinProjectSchema>;

// ─── Task Schemas ──────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  project_id: uuidSchema,
  title: z.string().trim().min(2, "Task title must be at least 2 characters.").max(200),
  area: taskAreaEnum.default("frontend"),
  priority: taskPriorityEnum.default("medium"),
  status: taskStatusEnum.default("todo"),
  assignee_role: roleEnum.optional().nullable(),
  depends_on: z.string().trim().max(100).optional().nullable(),
  blocker: z.string().trim().max(200).optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  area: taskAreaEnum.optional(),
  priority: taskPriorityEnum.optional(),
  status: taskStatusEnum.optional(),
  assignee_role: roleEnum.optional().nullable(),
  depends_on: z.string().trim().max(100).optional().nullable(),
  blocker: z.string().trim().max(200).optional().nullable(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ─── API Contract Schemas ──────────────────────────────────────────────────

export const createContractSchema = z.object({
  project_id: uuidSchema,
  method: httpMethodEnum.default("GET"),
  route: z
    .string()
    .trim()
    .min(1, "Route path is required.")
    .max(200)
    .regex(/^\/[a-zA-Z0-9_\-/:*]*$/, "Route must begin with '/' and contain valid URL path characters."),
  summary: z.string().trim().max(255).optional().nullable(),
  request_schema: z.string().max(10000).optional().nullable(),
  response_schema: z.string().max(10000).optional().nullable(),
  auth_required: z.boolean().default(false),
  status: contractStatusEnum.default("planned"),
  owner_role: roleEnum.default("backend"),
  version: z.string().trim().min(1).max(20).default("v1"),
  test_status: testStatusEnum.default("untested"),
  locked: z.boolean().default(false),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z.object({
  method: httpMethodEnum.optional(),
  route: z.string().trim().min(1).max(200).regex(/^\/[a-zA-Z0-9_\-/:*]*$/).optional(),
  summary: z.string().trim().max(255).optional().nullable(),
  request_schema: z.string().max(10000).optional().nullable(),
  response_schema: z.string().max(10000).optional().nullable(),
  auth_required: z.boolean().optional(),
  status: contractStatusEnum.optional(),
  owner_role: roleEnum.optional(),
  version: z.string().trim().min(1).max(20).optional(),
  test_status: testStatusEnum.optional(),
  locked: z.boolean().optional(),
});

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// ─── Database Schema Schemas ───────────────────────────────────────────────

export const createDbTableSchema = z.object({
  project_id: uuidSchema,
  name: z
    .string()
    .trim()
    .min(1, "Table name is required.")
    .max(63, "Table name cannot exceed 63 characters.")
    .regex(/^[a-z_][a-z0-9_]*$/, "Table name must be snake_case starting with a letter or underscore."),
  description: z.string().trim().max(255).optional().nullable(),
  owner_role: roleEnum.default("database"),
  schema_version: z.string().trim().min(1).max(20).default("v1"),
  migration_status: migrationStatusEnum.default("pending"),
  sql_definition: z.string().max(10000).optional().nullable(),
});

export type CreateDbTableInput = z.infer<typeof createDbTableSchema>;

export const createDbColumnSchema = z.object({
  table_id: uuidSchema,
  project_id: uuidSchema,
  name: z
    .string()
    .trim()
    .min(1, "Column name is required.")
    .max(63)
    .regex(/^[a-z_][a-z0-9_]*$/, "Column name must be snake_case."),
  data_type: z.string().trim().min(1).max(50),
  is_nullable: z.boolean().default(true),
  is_primary: z.boolean().default(false),
  is_indexed: z.boolean().default(false),
  references_table: z.string().trim().max(63).optional().nullable(),
  ordinal: z.number().int().min(0).default(0),
});

export type CreateDbColumnInput = z.infer<typeof createDbColumnSchema>;

// ─── AI Query & Copilot Schemas ────────────────────────────────────────────

export const aiQuerySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "Prompt cannot be empty.")
    .max(4000, "Prompt cannot exceed 4,000 characters."),
  projectId: z.string().optional().nullable(),
  model: z.enum(["gemini-2.0-flash", "gpt-4o-mini", "builtin"]).default("builtin"),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

export type AIQueryInput = z.infer<typeof aiQuerySchema>;
