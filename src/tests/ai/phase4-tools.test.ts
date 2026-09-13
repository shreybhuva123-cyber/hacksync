/**
 * HackSync Phase 4: AI Tools & Unified Orchestrator Integration Tests
 * Validates dispatch and output of all 8 Phase 4 AI tools, AIResult field population,
 * deterministic formatting, and task orchestration for testing & fix verification.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ToolRegistry } from "@/lib/hacksync/ai/tool-registry";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ConversationMemory } from "@/lib/hacksync/ai/memory";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { registerTestMembership, clearTestMemberships } from "@/lib/ai/ai-gateway";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";
import type { Workspace, Project, Member, CodeNode } from "@/lib/hacksync/types";
import type { AISecurityContext } from "@/lib/hacksync/security/tenant-guard";

function createPhase4TestWorkspace(): Workspace {
  const project: Project = {
    id: "proj-phase4-tools-test",
    name: "HackSync Testing Core",
    description: "Phase 4 Tools Test Project",
    repo_url: "https://github.com/hacksync/platform",
    default_branch: "main",
    schema_version: "2026-v1",
    invite_code: "P4TOOLS",
    is_open_demo: true,
    demo_mode: false,
    created_by: "usr-lead-engineer",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const members: Member[] = [
    {
      id: "mem-lead",
      project_id: "proj-phase4-tools-test",
      user_id: "usr-lead-engineer",
      display_name: "Lead QA & Security Engineer",
      email: "lead@hacksync.dev",
      role: "owner",
      branch_name: "main",
      working_area: "Testing",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
  ];

  const codeNodes: CodeNode[] = [
    {
      id: "node-auth",
      path: "src/services/auth.ts",
      language: "typescript",
      owner_role: "backend",
      status: "synced",
      area: "Auth",
      content: `
        import { db } from "../db/client";
        export class AuthService {
          async login(req: any) {
            const userId = req.query.id;
            const sql = "SELECT * FROM users WHERE id = " + userId;
            return await db.query(sql);
          }
        }
      `,
    },
    {
      id: "node-auth-test",
      path: "src/services/auth.test.ts",
      language: "typescript",
      owner_role: "qa",
      status: "synced",
      area: "Auth",
      content: `
        import { describe, it, expect } from "vitest";
        import { AuthService } from "./auth";

        describe("AuthService", () => {
          it("should authenticate valid user", async () => {
            const auth = new AuthService();
            expect(auth).toBeDefined();
          });
        });
      `,
    },
    {
      id: "node-vitest-config",
      path: "vitest.config.ts",
      language: "typescript",
      owner_role: "devops",
      status: "synced",
      area: "Config",
      content: `export default { test: { globals: true } };`,
    },
  ];

  return {
    project,
    members,
    codeNodes,
    contracts: [],
    tables: [],
    columns: [],
    envVars: [],
    categories: [],
    conflicts: [],
    readiness: { score: 95, grade: "A", is_blocked: false, blocking_reasons: [] },
    memberFiles: [],
  };
}

describe("HackSync Phase 4: AI Tools & Orchestrator Integration", () => {
  const projectId = "proj-phase4-tools-test";
  const userId = "usr-lead-engineer";
  let workspace: Workspace;
  let graph: ProjectKnowledgeGraph;
  let securityContext: AISecurityContext;
  let executor: AIToolExecutor;

  beforeEach(() => {
    ApprovalGate.clear();
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
    ConversationMemory.clear();

    workspace = createPhase4TestWorkspace();
    graph = new ProjectKnowledgeGraph(projectId);
    for (const node of workspace.codeNodes) {
      graph.indexFile(node.path, node.content || "");
    }

    securityContext = {
      userId,
      projectId,
      role: "owner",
      requestId: "req-p4-test",
    };

    executor = new AIToolExecutor(graph, securityContext, "req-p4-test", workspace);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Tool Registry Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Tool Registry & Permission Tiers", () => {
    it("should register all 8 Phase 4 tools in ToolRegistry", () => {
      const phase4ToolNames = [
        "find_tests",
        "test_plan",
        "generate_tests",
        "run_tests",
        "generate_fix",
        "validate_patch",
        "apply_patch",
        "verify_fix",
      ];

      for (const name of phase4ToolNames) {
        expect(ToolRegistry.has(name)).toBe(true);
        const def = ToolRegistry.get(name);
        expect(def).toBeDefined();
        expect(def?.name).toBe(name);
      }
    });

    it("should mark apply_patch as MUTATING and other Phase 4 tools as READ_ONLY", () => {
      expect(ApprovalGate.getToolTier("apply_patch")).toBe("MUTATING");
      expect(ApprovalGate.isMutating("apply_patch")).toBe(true);

      const readOnlyPhase4Tools = [
        "find_tests",
        "test_plan",
        "generate_tests",
        "generate_fix",
        "validate_patch",
        "verify_fix",
      ];

      for (const tool of readOnlyPhase4Tools) {
        expect(ApprovalGate.getToolTier(tool)).toBe("READ_ONLY");
        expect(ApprovalGate.isMutating(tool)).toBe(false);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Individual Tool Execution via AIToolExecutor
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Tool Execution via AIToolExecutor", () => {
    it("find_tests should discover suites and framework in project", async () => {
      const result = await executor.execute("find_tests", { targetFile: "src/services/auth.ts" });

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.frameworkInfo.framework).toBe("vitest");
      expect(data.testFiles).toContain("src/services/auth.test.ts");
      expect(data.suites.length).toBeGreaterThanOrEqual(1);
    });

    it("test_plan should generate targeted test plan", async () => {
      const result = await executor.execute("test_plan", {
        targetFiles: ["src/services/auth.ts"],
      });

      expect(result.success).toBe(true);
      const plan = result.data as any;
      expect(plan.projectId).toBe(projectId);
      expect(plan.targetFiles).toContain("src/services/auth.ts");
      expect(plan.tests.length).toBeGreaterThanOrEqual(1);
    });

    it("generate_tests should propose a test suite patch diff without mutating files", async () => {
      const result = await executor.execute("generate_tests", {
        targetFile: "src/services/auth.ts",
        testType: "regression",
      });

      expect(result.success).toBe(true);
      const proposal = result.data as any;
      expect(proposal.testFile).toContain("auth.test.ts");
      expect(proposal.patch.files[0]?.diff).toContain("+");
      expect(proposal.patch).toBeDefined();
    });

    it("run_tests should reject command injection attempts", async () => {
      const result = await executor.execute("run_tests", {
        command: "bun test; rm -rf /",
      });

      expect(result.success).toBe(true);
      expect((result.data as any).status).toBe("failed");
      expect((result.data as any).stderr).toContain("allowlist");
    });

    it("generate_fix should produce structured FixProposal with root cause and diff", async () => {
      const result = await executor.execute("generate_fix", {
        filePath: "src/services/auth.ts",
        finding: {
          id: "FINDING-SQL-1",
          ruleId: "SQL_INJECTION",
          title: "SQL injection via query concat",
          severity: "critical",
          confidence: "high",
          category: "injection",
          filePath: "src/services/auth.ts",
          startLine: 6,
          endLine: 6,
          evidence: 'const sql = "SELECT * FROM users WHERE id = " + userId;',
        },
      });

      expect(result.success).toBe(true);
      const proposal = result.data as any;
      expect(proposal.rootCause).toContain("concatenation");
      expect(proposal.patch.diffHash).toHaveLength(64);
      expect(proposal.requiresApproval).toBe(true);
    });

    it("validate_patch should detect unexpected files and return valid: false", async () => {
      const original = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: original,
        modifiedContent: original + "\n// patched",
      });

      const result = await executor.execute("validate_patch", {
        patch,
        approvedFiles: ["different-file.ts"],
      });

      expect(result.success).toBe(true);
      expect((result.data as any).valid).toBe(false);
      expect((result.data as any).errorCode).toBe("UNEXPECTED_PATCH_FILE");
    });

    it("apply_patch should fail without approval and succeed with valid approval", async () => {
      const original = graph.getFileContent("src/services/auth.ts") || "";
      const patch = PatchGenerator.generate({
        projectId,
        filePath: "src/services/auth.ts",
        originalContent: original,
        modifiedContent: original.replace("SELECT *", "SELECT id, name"),
      });

      // 1. Without approval -> should fail
      const unapprovedResult = await executor.execute("apply_patch", {
        approvalId: "non-existent-approval",
        patch,
      });

      expect(unapprovedResult.success).toBe(false);

      // 2. With valid approval -> should succeed
      const approval = ApprovalGate.requestApproval({
        toolName: "apply_patch",
        arguments: { patchId: patch.id },
        reason: "Fix query fields",
        risk: "medium",
        projectId,
        userId,
        patchHash: patch.diffHash,
        targetFiles: ["src/services/auth.ts"],
      });

      await ApprovalGate.approve(approval.id, userId, { role: "owner", projectId });

      const approvedResult = await executor.execute("apply_patch", {
        approvalId: approval.id,
        patch,
      });

      expect(approvedResult.success).toBe(true);
      expect((approvedResult.data as any).appliedFiles).toContain("src/services/auth.ts");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. AI Orchestrator Integration for Fix, Test & Verify Tasks
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. AI Orchestrator End-to-End Task Handling", () => {
    it("should classify and execute a test plan query with testPlan in result", async () => {
      const result = await AIOrchestrator.process({
        query: "Find tests and plan test execution for auth service",
        securityContext,
        ws: workspace,
      });

      expect(result).toBeDefined();
      expect(result.taskType).toBe("test");
      expect(result.testPlan).toBeDefined();
      expect(result.answer).toContain("Testing Intelligence");
    });

    it("should classify and execute a fix query with fixProposal requiring human approval", async () => {
      const result = await AIOrchestrator.process({
        query: "Fix the SQL injection vulnerability in src/services/auth.ts",
        securityContext,
        ws: workspace,
      });

      expect(result).toBeDefined();
      expect(result.taskType).toBe("fix");
      expect(result.fixProposal).toBeDefined();
      expect(result.approvalRequest).toBeDefined();
      // MANDATORY CRITICAL RULE: Fix proposal MUST require approval
      expect(result.fixProposal?.requiresApproval).toBe(true);
      expect(result.answer).toContain("Proposal");
      expect(result.answer).toContain("Human Approval Gate");
    });

    it("should classify and execute a verify query with testPlan in result", async () => {
      const result = await AIOrchestrator.process({
        query: "Verify fix and re-scan tests for auth.ts",
        securityContext,
        ws: workspace,
      });

      expect(result).toBeDefined();
      expect(result.taskType).toBe("verify");
      expect(result.testPlan).toBeDefined();
      expect(result.verificationResult).toBeDefined();
      expect(result.answer).toContain("Verification");
    });
  });
});
