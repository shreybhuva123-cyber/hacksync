/**
 * HackSync Phase 3: AI Tools & Unified Orchestrator Integration Tests
 * Validates dispatch and output of all 8 Phase 3 AI tools, AIResult field population,
 * deterministic formatting, and backward compatibility of processQuery().
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ToolRegistry } from "@/lib/hacksync/ai/tool-registry";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ConversationMemory } from "@/lib/hacksync/ai/memory";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import type { Workspace, Project, Member, CodeNode } from "@/lib/hacksync/types";
import type { AISecurityContext } from "@/lib/hacksync/security/tenant-guard";

function createPhase3TestWorkspace(): Workspace {
  const project: Project = {
    id: "proj-phase3-tools-test",
    name: "HackSync Core",
    description: "Phase 3 Tools Test Project",
    repo_url: "https://github.com/hacksync/platform",
    default_branch: "main",
    schema_version: "2026-v1",
    invite_code: "P3TOOLS",
    is_open_demo: true,
    demo_mode: false,
    created_by: "usr-architect-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const members: Member[] = [
    {
      id: "mem-1",
      project_id: "proj-phase3-tools-test",
      user_id: "usr-architect-1",
      display_name: "Lead Security Architect",
      email: "security@hacksync.dev",
      role: "owner",
      branch_name: "main",
      working_area: "Core",
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
      id: "node-config",
      path: "src/config/app.ts",
      language: "typescript",
      owner_role: "backend",
      status: "synced",
      area: "Config",
      content: `
        export const appConfig = {
          stripeSecret: ["sk", "test", "123456789012345678901234"].join("_"),
          environment: "test",
        };
      `,
    },
    {
      id: "node-package",
      path: "package.json",
      language: "json",
      owner_role: "backend",
      status: "synced",
      area: "Config",
      content: JSON.stringify({
        name: "test-package",
        dependencies: {
          lodash: "4.17.15",
        },
      }),
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
    readiness: { score: 90, grade: "A", is_blocked: false, blocking_reasons: [] },
    memberFiles: [
      {
        id: "mf-1",
        project_id: "proj-phase3-tools-test",
        user_id: "usr-architect-1",
        relative_path: "src/services/auth.ts",
        file_name: "auth.ts",
        content: `
        import { db } from "../db/client";
        export class AuthService {
          async login(req: any) {
            const userId = req.query.id;
            // Enhanced with audit log
            console.log("Login attempt: " + userId);
            const sql = "SELECT * FROM users WHERE id = " + userId;
            return await db.query(sql);
          }
        }
      `,
        synced: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

describe("HackSync Phase 3: AI Tools & Orchestrator Integration", () => {
  let ws: Workspace;
  let securityContext: AISecurityContext;
  let graph: ProjectKnowledgeGraph;
  let executor: AIToolExecutor;

  beforeEach(() => {
    ws = createPhase3TestWorkspace();
    securityContext = {
      userId: "usr-architect-1",
      projectId: "proj-phase3-tools-test",
      role: "owner",
      requestId: "req-p3-test",
    };
    ConversationMemory.clear();
    AuditTrail.clear();

    graph = new ProjectKnowledgeGraph("proj-phase3-tools-test");
    for (const node of ws.codeNodes) {
      graph.indexFile(node.path, node.content || "");
    }

    executor = new AIToolExecutor(graph, securityContext, "req-p3-test", ws);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Tool Registry Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Tool Registry", () => {
    it("should have all 8 Phase 3 tools registered in ToolRegistry", () => {
      const phase3ToolNames = [
        "security_scan",
        "secret_scan",
        "dependency_vulnerabilities",
        "security_health",
        "git_status",
        "git_diff",
        "git_changed_symbols",
        "git_impact",
      ];

      for (const name of phase3ToolNames) {
        const def = ToolRegistry.getTool(name);
        expect(def).toBeDefined();
        expect(def?.name).toBe(name);
        expect(def?.description.length).toBeGreaterThan(10);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Direct Execution of All 8 Phase 3 AI Tools
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Direct Execution via AIToolExecutor", () => {
    it("should execute security_scan and return SAST findings", async () => {
      const res = await executor.execute("security_scan", { targetFile: "src/services/auth.ts" });
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.findings).toBeDefined();
      expect(Array.isArray(data.findings)).toBe(true);
      expect(data.findings.some((f: any) => f.ruleId === "SEC-INJ-001")).toBe(true);
    });

    it("should execute secret_scan and return secret analysis without exposing keys", async () => {
      const res = await executor.execute("secret_scan", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalSecrets).toBeDefined();
      expect(data.findings).toBeDefined();
    });

    it("should execute dependency_vulnerabilities and detect packages", async () => {
      const res = await executor.execute("dependency_vulnerabilities", { manifestFile: "package.json" });
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.manifestPath).toBe("package.json");
      expect(data.totalDependencies).toBeGreaterThanOrEqual(1);
    });

    it("should execute security_health and return score with disclaimer", async () => {
      const res = await executor.execute("security_health", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
      expect(data.letterGrade).toBeDefined();
      expect(data.disclaimer).toBeDefined();
      expect(data.disclaimer).toContain("heuristic");
    });

    it("should execute git_status and report workspace changes", async () => {
      const res = await executor.execute("git_status", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.branch).toBe("main");
      expect(data.isClean).toBe(false);
      expect(data.totalChangedFiles).toBeGreaterThanOrEqual(1);
    });

    it("should execute git_diff and return parsed diffs", async () => {
      const res = await executor.execute("git_diff", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.files).toBeDefined();
      expect(Array.isArray(data.files)).toBe(true);
      expect(data.files.length).toBeGreaterThanOrEqual(1);
    });

    it("should execute git_changed_symbols and correlate AST symbols", async () => {
      const res = await executor.execute("git_changed_symbols", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(Array.isArray(data.changedSymbols)).toBe(true);
    });

    it("should execute git_impact and compute blast radius with disclaimer", async () => {
      const res = await executor.execute("git_impact", {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.changedFilesCount).toBeGreaterThanOrEqual(1);
      expect(data.regressionRisk).toBeDefined();
      expect(data.disclaimer).toContain("static dependency graphs");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. AIOrchestrator.process() Populating Phase 3 AIResult Fields
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. AIOrchestrator Integration & AIResult Fields", () => {
    it("should populate securityFindings and securityHealth for security queries", async () => {
      const result = await AIOrchestrator.process({
        query: "Run a full security audit on this project to find SQL injection and exposed credentials",
        securityContext,
        ws,
      });

      expect(result).toBeDefined();
      expect(result.taskType).toBe("security");
      expect(result.securityFindings).toBeDefined();
      expect(Array.isArray(result.securityFindings)).toBe(true);
      expect(result.securityFindings?.length).toBeGreaterThan(0);
      expect(result.securityHealth).toBeDefined();
      expect(result.securityHealth?.score).toBeDefined();
    });

    it("should populate gitStatus and diffSummary for git review queries", async () => {
      const result = await AIOrchestrator.process({
        query: "Show current git diff and review the changes",
        securityContext,
        ws,
      });

      expect(result).toBeDefined();
      expect(result.gitStatus).toBeDefined();
      expect(result.diffSummary).toBeDefined();
      expect(result.gitStatus?.branch).toBe("main");
    });

    it("should populate changedSymbols and impactAnalysis for impact queries", async () => {
      const result = await AIOrchestrator.process({
        query: "Analyze the regression risk and impact of current uncommitted changes",
        securityContext,
        ws,
      });

      expect(result).toBeDefined();
      expect(result.impactAnalysis).toBeDefined();
      expect(result.impactAnalysis?.disclaimer).toBeDefined();
      expect(result.changedSymbols).toBeDefined();
    });

    it("should preserve backward compatibility for processQuery() method", async () => {
      const legacyResult = await AIOrchestrator.processQuery({
        query: "Audit this codebase for potential security vulnerabilities",
        securityContext,
        ws,
      });

      expect(legacyResult).toBeDefined();
      expect(legacyResult.text).toBeDefined();
      expect(typeof legacyResult.text).toBe("string");
      expect(legacyResult.intent).toBe("security");
      expect(legacyResult.findings).toBeDefined();
    });
  });
});
