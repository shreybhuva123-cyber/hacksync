import { describe, it, expect, beforeEach } from "bun:test";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { TaskClassifier } from "@/lib/hacksync/ai/task-classifier";
import { ContextPlanner } from "@/lib/hacksync/ai/context-planner";
import { ExecutionBudgetManager } from "@/lib/hacksync/ai/execution-budget";
import { OutputValidator } from "@/lib/hacksync/ai/output-validator";
import { ModelRouter } from "@/lib/ai/model-router";
import { OllamaProvider } from "@/lib/ai/providers/ollama-provider";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ConversationMemory } from "@/lib/hacksync/ai/memory";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import type { Workspace, Project, Member, CodeNode } from "@/lib/hacksync/types";
import type { AISecurityContext } from "@/lib/hacksync/security/tenant-guard";

function createTestWorkspace(): Workspace {
  const project: Project = {
    id: "proj-orchestrator-test",
    name: "HackSync Platform",
    description: "Phase 2 Orchestrator Test Project",
    repo_url: "https://github.com/hacksync/platform",
    default_branch: "main",
    schema_version: "2026-v1",
    invite_code: "PHASE2TEST",
    is_open_demo: true,
    demo_mode: false,
    created_by: "usr-architect-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const members: Member[] = [
    {
      id: "mem-1",
      project_id: "proj-orchestrator-test",
      user_id: "usr-architect-1",
      display_name: "Lead Architect",
      email: "architect@hacksync.dev",
      role: "owner",
      branch_name: "main",
      working_area: "Core",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "mem-2",
      project_id: "proj-orchestrator-test",
      user_id: "usr-engineer-2",
      display_name: "Staff Engineer",
      email: "engineer@hacksync.dev",
      role: "lead",
      branch_name: "feature/api",
      working_area: "API",
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
      area: "Auth Service",
      content: `import { db } from "../db/client";
import { hashPassword } from "../utils/crypto";

export interface UserSession {
  userId: string;
  role: string;
}

export class AuthService {
  async authenticateUser(email: string, pass: string): Promise<UserSession | null> {
    const user = await db.query("SELECT * FROM users WHERE email = '" + email + "'");
    if (!user) return null;
    return { userId: user.id, role: user.role };
  }
}`,
    },
    {
      id: "node-login-route",
      path: "src/routes/login.ts",
      language: "typescript",
      owner_role: "backend",
      status: "synced",
      area: "API Routes",
      content: `import { AuthService } from "../services/auth";

export async function handleLogin(req: any, res: any) {
  const auth = new AuthService();
  const session = await auth.authenticateUser(req.body.email, req.body.password);
  return res.json({ session });
}`,
    },
    {
      id: "node-crypto",
      path: "src/utils/crypto.ts",
      language: "typescript",
      owner_role: "backend",
      status: "synced",
      area: "Utilities",
      content: `export function hashPassword(plain: string): string {
  return "hashed:" + plain;
}`,
    },
    {
      id: "node-package",
      path: "package.json",
      language: "json",
      owner_role: "lead",
      status: "synced",
      area: "Config",
      content: JSON.stringify({
        name: "hacksync-platform",
        dependencies: {
          express: "4.18.2",
          jsonwebtoken: "9.0.2",
        },
      }),
    },
  ];

  return {
    project,
    members,
    codeNodes,
    contracts: [
      {
        id: "ctr-login",
        project_id: "proj-orchestrator-test",
        method: "POST",
        route: "/api/v1/login",
        auth_required: false,
        test_status: "passing",
        created_at: new Date().toISOString(),
      },
    ],
    tables: [
      {
        id: "tbl-users",
        project_id: "proj-orchestrator-test",
        name: "users",
        created_at: new Date().toISOString(),
      },
    ],
    columns: [
      {
        id: "col-id",
        table_id: "tbl-users",
        name: "id",
        data_type: "uuid",
        is_primary: true,
        is_nullable: false,
      },
      {
        id: "col-email",
        table_id: "tbl-users",
        name: "email",
        data_type: "text",
        is_primary: false,
        is_nullable: false,
      },
    ],
    envVars: [],
    categories: [],
    conflicts: [],
    readiness: { score: 95, grade: "A", is_blocked: false, blocking_reasons: [] },
  };
}

describe("HackSync Phase 2: Unified AI Orchestrator + Model Router + Typed Tool System", () => {
  let ws: Workspace;
  let securityContext: AISecurityContext;

  beforeEach(() => {
    ws = createTestWorkspace();
    securityContext = {
      userId: "usr-architect-1",
      projectId: "proj-orchestrator-test",
      role: "owner",
      requestId: "req-phase2-test",
    };
    ConversationMemory.clear();
    AuditTrail.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Task Classification & Planning Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Task Classification & Planning", () => {
    it("should classify requests across all 11 task categories", () => {
      expect(TaskClassifier.classify("Why did the login API return 500?").taskType).toBe("debug");
      expect(TaskClassifier.classify("Check my authentication code for SQL injection vulnerabilities").taskType).toBe("security");
      expect(TaskClassifier.classify("Explain the AuthService class and its lifecycle").taskType).toBe("explain");
      expect(TaskClassifier.classify("What is the architecture layer breakdown of this project?").taskType).toBe("architecture");
      expect(TaskClassifier.classify("Generate unit tests for hashPassword").taskType).toBe("test");
      expect(TaskClassifier.classify("Find symbol AuthService across files").taskType).toBe("code_search");
      expect(TaskClassifier.classify("What is the blast radius and downstream impact of changing auth.ts?").taskType).toBe("impact");
      expect(TaskClassifier.classify("Audit package.json for outdated or vulnerable dependencies").taskType).toBe("dependency");
      expect(TaskClassifier.classify("Give me a complete project overview and file tree").taskType).toBe("project_overview");
      expect(TaskClassifier.classify("Review recent git diff changes in auth.ts").taskType).toBe("git");
      expect(TaskClassifier.classify("Hello, how can I improve my codebase?").taskType).toBe("general");
    });

    it("should generate bounded TaskPlans with allowed tools and budget limits", () => {
      const planSec = TaskClassifier.plan("Audit auth.ts for vulnerabilities");
      expect(planSec.taskType).toBe("security");
      expect(planSec.allowedTools).toContain("analyze_security");
      expect(planSec.allowedTools).toContain("retrieve_code");
      expect(planSec.maxToolCalls).toBeLessThanOrEqual(8);
      expect(planSec.confidence).toBeGreaterThan(0.8);

      const planImpact = TaskClassifier.plan("What breaks if I modify crypto.ts?");
      expect(planImpact.taskType).toBe("impact");
      expect(planImpact.allowedTools).toContain("dependency_impact");
    });

    it("should convert bidirectionally between TaskType and legacy AIIntentType", () => {
      expect(TaskClassifier.toLegacyIntent("security")).toBe("security");
      expect(TaskClassifier.toLegacyIntent("debug")).toBe("debug");
      expect(TaskClassifier.toLegacyIntent("test")).toBe("testing");
      expect(TaskClassifier.toLegacyIntent("explain")).toBe("architecture");
      expect(TaskClassifier.fromLegacyIntent("testing")).toBe("test");
      expect(TaskClassifier.fromLegacyIntent("security")).toBe("security");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Context Planning & Bounded Retrieval
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Context Planning & Bounded Retrieval", () => {
    it("should plan minimal high-signal context without prompt bloat", () => {
      const graph = new ProjectKnowledgeGraph();
      graph.indexWorkspace(ws);

      const plan = TaskClassifier.plan("How does AuthService work?");
      const planned = ContextPlanner.planContext({
        plan,
        query: "How does AuthService work?",
        graph,
        ws,
        options: { maxChars: 4000, maxSnippets: 4 },
      });

      expect(planned.targetSymbols).toContain("AuthService");
      expect(planned.targetFiles).toContain("src/services/auth.ts");
      expect(planned.characterCount).toBeLessThanOrEqual(4000);
      expect(planned.hasSufficientEvidence).toBe(true);
      expect(planned.formattedContext).toContain("AuthService");
    });

    it("should redact secrets from planned context snippets", () => {
      const graph = new ProjectKnowledgeGraph();
      const rawSecret = ["sk", "live", "1234567890abcdef1234567890"].join("_");
      const secretFile = `export const key = "${rawSecret}";`;
      graph.indexFile("src/secret.ts", secretFile);

      const plan = TaskClassifier.plan("Read secret file");
      const planned = ContextPlanner.planContext({
        plan,
        query: "Read secret file",
        graph,
        options: { activeFilePath: "src/secret.ts" },
      });

      expect(planned.formattedContext).not.toContain(rawSecret);
      expect(planned.formattedContext).toContain("[REDACTED_STRIPE_KEY]");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Secure Typed Read-Only Tools
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Secure Typed Read-Only Tools", () => {
    let graph: ProjectKnowledgeGraph;
    let executor: AIToolExecutor;

    beforeEach(() => {
      graph = new ProjectKnowledgeGraph();
      graph.indexWorkspace(ws);
      executor = new AIToolExecutor(graph, securityContext, "req-tool-test", ws);
    });

    it("search_symbols: should find exact and partial AST symbols with lines", async () => {
      const res = await executor.execute("search_symbols", { name: "AuthService" });
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data[0].name).toBe("AuthService");
      expect(res.data[0].filePath).toBe("src/services/auth.ts");
      expect(res.data[0].exactStartLine).toBeDefined();
    });

    it("find_references: should find direct and transitive callers", async () => {
      const res = await executor.execute("find_references", { target: "src/services/auth.ts" });
      expect(res.success).toBe(true);
      expect(res.data.directDependents).toContain("src/routes/login.ts");
    });

    it("get_project_structure: should return structural tree and metrics", async () => {
      const res = await executor.execute("get_project_structure", {});
      expect(res.success).toBe(true);
      expect(res.data.metrics.indexedFilesCount).toBe(4);
      expect(res.data.structure).toContain("src/services/auth.ts");
    });

    it("retrieve_code: should sanitize path and return bounded lines with secret scrubbing", async () => {
      const res = await executor.execute("retrieve_code", {
        path: "src/services/auth.ts",
        startLine: 1,
        endLine: 10,
      });
      expect(res.success).toBe(true);
      expect(res.data.path).toBe("src/services/auth.ts");
      expect(res.data.content).toContain("export class AuthService");
      expect(res.data.totalLines).toBeGreaterThanOrEqual(10);
    });

    it("find_api_routes: should locate both AST routes and workspace contracts", async () => {
      const res = await executor.execute("find_api_routes", {});
      expect(res.success).toBe(true);
      expect(res.data.some((r: any) => r.route === "/api/v1/login")).toBe(true);
    });

    it("find_database_usage: should identify tables and referencing files", async () => {
      const res = await executor.execute("find_database_usage", { tableName: "users" });
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data[0].name).toBe("users");
    });

    it("architecture_summary: should return architectural layer breakdown", async () => {
      const res = await executor.execute("architecture_summary", {});
      expect(res.success).toBe(true);
      expect(res.data.summary).toBeDefined();
      expect(res.data.layerCounts).toBeDefined();
    });

    it("dependency_impact: should compute blast radius and risk tier", async () => {
      const res = await executor.execute("dependency_impact", { target: "src/services/auth.ts" });
      expect(res.success).toBe(true);
      expect(res.data.directDependents).toContain("src/routes/login.ts");
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(res.data.riskTier);
      expect(res.data.blastRadiusScore).toBeGreaterThan(0);
      expect(res.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Execution Budget, Loop Guard & Tenant Confinement
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Execution Budget, Loop Guard & Tenant Confinement", () => {
    it("should prevent duplicate tool executions with identical arguments", () => {
      const budget = new ExecutionBudgetManager({ maxToolCalls: 5 });
      expect(budget.checkCanExecute("retrieve_code", { path: "src/app.ts" }).allowed).toBe(true);
      budget.recordCall("retrieve_code", { path: "src/app.ts" });

      // Duplicate execution attempt
      const dupCheck = budget.checkCanExecute("retrieve_code", { path: "src/app.ts" });
      expect(dupCheck.allowed).toBe(false);
      expect(dupCheck.reason).toContain("Duplicate tool call suppressed");
    });

    it("should block infinite tool loops when a tool is called 3 times consecutively", () => {
      const budget = new ExecutionBudgetManager({ maxToolCalls: 10 });
      budget.recordCall("search_symbols", { name: "foo" });
      budget.recordCall("search_symbols", { name: "bar" });
      budget.recordCall("search_symbols", { name: "baz" });

      const loopCheck = budget.checkCanExecute("search_symbols", { name: "qux" });
      expect(loopCheck.allowed).toBe(false);
      expect(loopCheck.reason).toContain("Infinite loop guard");
    });

    it("should halt tool execution when maximum budget is depleted", () => {
      const budget = new ExecutionBudgetManager({ maxToolCalls: 2 });
      budget.recordCall("search_symbols", { name: "sym1" });
      budget.recordCall("search_symbols", { name: "sym2" });

      const overCheck = budget.checkCanExecute("retrieve_code", { path: "src/test.ts" });
      expect(overCheck.allowed).toBe(false);
      expect(overCheck.reason).toContain("Execution budget depleted");
    });

    it("should reject cross-tenant projectId parameter injection attempts", async () => {
      const graph = new ProjectKnowledgeGraph();
      const executor = new AIToolExecutor(graph, securityContext, "req-jailbreak-test");

      const jailbreakRes = await executor.execute("search_symbols", {
        name: "User",
        projectId: "proj-alien-victim",
      });

      expect(jailbreakRes.success).toBe(false);
      expect(jailbreakRes.error).toContain("Cross-project parameter escape prevented");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Model Router & Fallbacks
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Model Router & Fallbacks", () => {
    it("should route to available providers or fallback to deterministic offline intelligence", () => {
      const autoRes = ModelRouter.getBestProvider("auto", "debug");
      expect(autoRes.modelName).toBeDefined();

      const builtinRes = ModelRouter.getBestProvider("builtin");
      expect(builtinRes.provider).toBeNull();
      expect(builtinRes.modelName).toContain("deterministic");
    });

    it("should instantiate OllamaProvider and target local LLM host", () => {
      const ollama = new OllamaProvider();
      expect(ollama.name).toBe("ollama");
      expect(typeof ollama.isAvailable()).toBe("boolean");
    });

    it("executeWithFallback should cascade to deterministic report if external calls fail", async () => {
      const failingProvider = {
        name: "openai" as const,
        isAvailable: () => true,
        chat: async () => {
          throw new Error("503 Upstream Provider Offline");
        },
      };

      const result = await ModelRouter.executeWithFallback(failingProvider, [], [
        { role: "user", content: "hello" },
      ]);

      expect(result.response).toBeNull();
      expect(result.usedModel).toContain("deterministic");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Citation Validation & Grounding
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Citation Validation & Grounding", () => {
    it("should extract file citations and line ranges accurately", () => {
      const text = "Bug identified in `src/services/auth.ts:12-18` and `src/routes/login.ts` (Line 5).";
      const citations = OutputValidator.extractCitations(text);

      expect(citations.length).toBeGreaterThanOrEqual(2);
      expect(citations.some((c) => c.filePath === "src/services/auth.ts" && c.lineStart === 12)).toBe(true);
      expect(citations.some((c) => c.filePath === "src/routes/login.ts" && c.lineStart === 5)).toBe(true);
    });

    it("should penalize confidence and flag unverified citations in uncertainty", () => {
      const graph = new ProjectKnowledgeGraph();
      graph.indexWorkspace(ws);

      const hallucinatedText = "The bug is located in `src/nonexistent/database.ts:99`.";
      const result = OutputValidator.validate({
        text: hallucinatedText,
        taskType: "debug",
        graph,
        evidence: [],
      });

      expect(result.uncertainty.length).toBeGreaterThan(0);
      expect(result.uncertainty[0]).toContain("does not exist in the indexed project files");
      expect(result.confidence).toBeLessThan(0.8);
    });

    it("should accept valid codebase citations without uncertainty", () => {
      const graph = new ProjectKnowledgeGraph();
      graph.indexWorkspace(ws);

      const validText = "The logic is defined in `src/services/auth.ts` (Line 10).";
      const result = OutputValidator.validate({
        text: validText,
        taskType: "explain",
        graph,
        evidence: [
          {
            file: "src/services/auth.ts",
            lineStart: 10,
            lineEnd: 20,
            snippet: "export class AuthService",
            confidence: 0.95,
          },
        ],
      });

      expect(result.uncertainty).toBeUndefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. End-to-End AIOrchestrator.process() Pipeline
  // ───────────────────────────────────────────────────────────────────────────
  describe("7. End-to-End AIOrchestrator.process() Pipeline", () => {
    it("should execute full pipeline and return structured AIResult with verified evidence", async () => {
      const result = await AIOrchestrator.process({
        query: "Why is login failing?",
        ws,
        userId: "usr-architect-1",
        securityContext,
        modelPreference: "builtin",
      });

      expect(result.requestId).toBe("req-phase2-test");
      expect(result.taskType).toBe("debug");
      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(50);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0].file).toBeDefined();
      expect(result.evidence[0].confidence).toBeDefined();
      expect(result.modelUsed).toContain("deterministic");
      expect(result.toolCalls.length).toBeGreaterThan(0);
      expect(result.actionsRequired).toBeDefined();
      expect(result.metrics?.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should enforce tenant security boundary and reject cross-tenant execution", async () => {
      const foreignContext: AISecurityContext = {
        userId: "usr-intruder",
        projectId: "proj-different-tenant",
        role: "member",
        requestId: "req-sec-violation",
      };

      await expect(
        AIOrchestrator.process({
          query: "Find secrets",
          projectId: "proj-orchestrator-test", // Target project doesn't match context
          securityContext: foreignContext,
        }),
      ).rejects.toThrow("Cross-tenant violation");
    });

    it("should support backward-compatible processQuery returning OrchestrationResult", async () => {
      const legacyRes = await AIOrchestrator.processQuery({
        query: "What is the project architecture?",
        ws,
        userId: "usr-architect-1",
        securityContext,
        modelPreference: "builtin",
      });

      expect(legacyRes.intent).toBe("architecture");
      expect(legacyRes.modelUsed).toBeDefined();
      expect(legacyRes.toolCalls.length).toBeGreaterThan(0);
      expect(legacyRes.text).toBeDefined();
      expect(legacyRes.suggestedActions.length).toBeGreaterThan(0);
      expect(legacyRes.requestId).toBe("req-phase2-test");
    });

    it("should support multi-turn resolution in full pipeline", async () => {
      ConversationMemory.setActiveBug("BUG-SQL-1", "src/services/auth.ts", "usr-architect-1");

      const result = await AIOrchestrator.process({
        query: "Generate a prompt to fix it",
        ws,
        userId: "usr-architect-1",
        securityContext,
      });

      expect(result.taskType).toBe("debug");
      expect(result.toolCalls.some((t) => t.name === "generate_fix")).toBe(true);
    });
  });
});
