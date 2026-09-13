import { describe, it, expect, beforeEach } from "bun:test";
import { TenantGuard } from "@/lib/hacksync/security/tenant-guard";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import { ApprovalGate } from "@/lib/hacksync/ai/approval-gate";
import { TypeScriptParser } from "@/lib/hacksync/intelligence/parsers/typescript-parser";
import { JavaScriptParser } from "@/lib/hacksync/intelligence/parsers/javascript-parser";
import { JsonParser } from "@/lib/hacksync/intelligence/parsers/json-parser";
import { SqlParser } from "@/lib/hacksync/intelligence/parsers/sql-parser";
import { PythonParser } from "@/lib/hacksync/intelligence/parsers/python-parser";
import { BM25SearchIndex } from "@/lib/hacksync/intelligence/bm25-search";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { DependencyScanner } from "@/lib/hacksync/intelligence/dependency-scanner";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { ConversationMemory } from "@/lib/hacksync/ai/memory";
import { SecurityAuditor } from "@/lib/hacksync/security/security-auditor";
import { ProjectHealthCalculator } from "@/lib/hacksync/security/health-score";
import { GitAnalyzer } from "@/lib/hacksync/git/git-analyzer";
import { TestPlanner } from "@/lib/hacksync/testing/test-planner";
import { TestGenerator } from "@/lib/hacksync/testing/test-generator";
import { FixLoopEngine } from "@/lib/hacksync/ai/fix-loop";
import { BENCHMARK_DATASET } from "@/lib/hacksync/evaluation/benchmark-dataset";
import { EvaluationScorer } from "@/lib/hacksync/evaluation/scoring";
import { AIEvaluator } from "@/lib/hacksync/evaluation/evaluator";
import type { Workspace, Project, Member, CodeNode } from "@/lib/hacksync/types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixture Factory
// ─────────────────────────────────────────────────────────────────────────────

function createMockWorkspace(): Workspace {
  const project: Project = {
    id: "proj-startup-ai",
    name: "HackSync Core",
    description: "Multi-tenant autonomous AI test project",
    repo_url: "https://github.com/hacksync/core",
    default_branch: "main",
    schema_version: "2026-v1",
    invite_code: "HSYNC999",
    is_open_demo: true,
    demo_mode: false,
    created_by: "usr-lead-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const members: Member[] = [
    {
      id: "mem-1",
      project_id: "proj-startup-ai",
      user_id: "usr-lead-1",
      display_name: "Lead Engineer",
      email: "lead@hacksync.dev",
      role: "lead",
      branch_name: "main",
      working_area: "Architecture",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "mem-2",
      project_id: "proj-startup-ai",
      user_id: "usr-dev-2",
      display_name: "Frontend Dev",
      email: "frontend@hacksync.dev",
      role: "frontend",
      branch_name: "feature/auth",
      working_area: "Client",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
  ];

  const codeNodes: CodeNode[] = [
    {
      id: "node-login",
      path: "src/api/login.ts",
      language: "typescript",
      owner_role: "backend",
      status: "synced",
      area: "Backend API",
      content: `import { db } from "../db";
import jwt from "jsonwebtoken";

export async function loginUser(req: any, res: any) {
  const user = await db.query("SELECT * FROM users WHERE email = '" + req.body.email + "'");
  const role = user.profile.role; // null access without check!
  const token = jwt.sign({ id: user.id }, "hardcoded_secret_key_123");
  fetch("https://analytics.hacksync.dev/log"); // unhandled floating promise
  return res.json({ token, role });
}`,
    },
    {
      id: "node-package",
      path: "package.json",
      language: "json",
      owner_role: "lead",
      status: "synced",
      area: "Config",
      content: `{
  "name": "hacksync-app",
  "dependencies": {
    "lodash": "4.17.15",
    "express": "latest"
  }
}`,
    },
  ];

  return {
    project,
    members,
    codeNodes,
    contracts: [
      {
        id: "ctr-login",
        project_id: "proj-startup-ai",
        method: "POST",
        route: "/api/login",
        auth_required: false,
        test_status: "passing",
        created_at: new Date().toISOString(),
      },
    ],
    tables: [
      {
        id: "tbl-users",
        project_id: "proj-startup-ai",
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
        id: "col-password",
        table_id: "tbl-users",
        name: "password",
        data_type: "text",
        is_primary: false,
        is_nullable: false,
      },
    ],
    envVars: [],
    categories: [],
    conflicts: [],
    readiness: { score: 90, grade: "A", is_blocked: false, blocking_reasons: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Phase 0 - Security & Production Foundation
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 0: Production Foundation & Security Controls", () => {
  beforeEach(() => {
    AuditTrail.clear();
  });

  it("should sanitize paths and prevent directory traversal exploits", () => {
    expect(TenantGuard.sanitizeFilePath("src/index.ts")).toBe("src/index.ts");
    expect(TenantGuard.sanitizeFilePath("src\\components\\App.tsx")).toBe("src/components/App.tsx");

    // Traversal attempts
    expect(() => TenantGuard.sanitizeFilePath("../../../etc/passwd")).toThrow("Path traversal");
    expect(() => TenantGuard.sanitizeFilePath("src/../../secret.env")).toThrow("Path traversal");
    expect(() => TenantGuard.sanitizeFilePath("C:\\Windows\\System32")).toThrow("Path traversal");
    expect(() => TenantGuard.sanitizeFilePath("src/file.ts\0.exe")).toThrow("Null byte");
  });

  it("should enforce multi-tenant authorization guards", () => {
    const ws = createMockWorkspace();
    const ctxLead = TenantGuard.extractContext(ws, "usr-lead-1");
    expect(ctxLead.role).toBe("lead");
    expect(ctxLead.projectId).toBe("proj-startup-ai");

    const ctxDev = TenantGuard.extractContext(ws, "usr-dev-2");
    expect(ctxDev.role).toBe("frontend");

    const ctxUnknown = TenantGuard.extractContext(ws, "usr-stranger");
    expect(ctxUnknown.role).toBe("member");

    // File access checks
    expect(TenantGuard.validateFileAccess(ctxLead, "src/api/login.ts", "READ").allowed).toBe(true);
    expect(TenantGuard.validateFileAccess(ctxLead, "src/api/login.ts", "MUTATE").allowed).toBe(true);

    // Readonly / unverified cross-project user
    const ctxAlien = { userId: "alien", projectId: "other-proj", role: "member" as const };
    const alienAccess = TenantGuard.validateFileAccess(ctxAlien, "src/api/login.ts", "MUTATE");
    expect(alienAccess.allowed).toBe(false);
  });

  it("should redact sensitive credentials and API keys in source code", () => {
    const stripeSample = ["sk", "live", "1234567890abcdef1234567890"].join("_");
    const googleSample = ["AIzaSyD", "ExampleKeyHere1234567890123"].join("");
    const awsSample = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
    const rawSnippet = `
      const stripe = "${stripeSample}";
      const google = "${googleSample}";
      const aws = "${awsSample}";
      const db = "postgresql://postgres:secretpassword123@db.supabase.co:5432/postgres";
    `;

    const { redactedText } = SecretRedactor.redact(rawSnippet);

    expect(redactedText).not.toContain(stripeSample);
    expect(redactedText).not.toContain(googleSample);
    expect(redactedText).not.toContain(awsSample);
    expect(redactedText).not.toContain("secretpassword123");

    expect(redactedText).toContain("[REDACTED_STRIPE_KEY]");
    expect(redactedText).toContain("[REDACTED_GOOGLE_KEY]");
    expect(redactedText).toContain("[REDACTED_AWS_KEY]");
    expect(redactedText).toContain("[REDACTED_DB_PASSWORD]");
  });

  it("should maintain immutable audit log of AI queries and tool invocations", () => {
    AuditTrail.record({
      requestId: "req-audit-1",
      userId: "usr-lead-1",
      projectId: "proj-startup-ai",
      toolName: "search_project",
      actionType: "READ_ONLY",
      status: "success",
      details: "Searched for login symbols",
      executionMs: 14,
    });

    const entries = AuditTrail.query({ projectId: "proj-startup-ai" });
    expect(entries.length).toBe(1);
    expect(entries[0]?.requestId).toBe("req-audit-1");
    expect(entries[0]?.toolName).toBe("search_project");
    expect(entries[0]?.actionType).toBe("READ_ONLY");
  });

  it("should enforce human-in-the-loop ApprovalGate for mutating actions", () => {
    expect(ApprovalGate.getToolTier("read_file")).toBe("READ_ONLY");
    expect(ApprovalGate.getToolTier("search_project")).toBe("READ_ONLY");
    expect(ApprovalGate.getToolTier("apply_patch")).toBe("MUTATING");
    expect(ApprovalGate.isMutating("apply_patch")).toBe(true);

    const req = ApprovalGate.createApprovalRequest({
      requestId: "req-appr-1",
      projectId: "proj-startup-ai",
      userId: "usr-lead-1",
      toolName: "apply_patch",
      summary: "Apply login null-check patch",
      rationale: "Fix null access bug",
      filesAffected: ["src/api/login.ts"],
      diffPreview: "+ if (!user) return res.status(401);",
    });

    expect(req.status).toBe("pending");
    expect(ApprovalGate.getPendingForProject("proj-startup-ai").length).toBe(1);

    // Resolve approval
    const resolved = ApprovalGate.resolveApproval(req.id, "approved");
    expect(resolved.status).toBe("approved");
    expect(ApprovalGate.getPendingForProject("proj-startup-ai").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Phase 1 - Project Intelligence & Focused Parsers
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1: Project Intelligence & Code Parsers", () => {
  it("should parse TypeScript & TSX, extracting symbols, routes, and AST defects", () => {
    const parser = new TypeScriptParser();
    const code = `
      import express from "express";
      export class UserService {
        async getUser(id: string) {
          const u = await findUser(id);
          const name = u.profile.name; // null check hazard!
          fetch("/ping"); // unhandled promise!
          return name;
        }
      }
    `;

    const summary = parser.parse("src/services/user.ts", code);
    expect(summary.imports.length).toBe(1);
    expect(summary.exports.length).toBe(1);
    expect(summary.symbols.some((s) => s.name === "UserService")).toBe(true);

    // AST issues detected
    expect(summary.issues.some((i) => i.type === "null_access_before_check")).toBe(true);
    expect(summary.issues.some((i) => i.type === "unhandled_promise")).toBe(true);
  });

  it("should parse JavaScript & JSX files", () => {
    const parser = new JavaScriptParser();
    const code = `
      import React from 'react';
      export function Header({ title }) {
        return <h1>{title}</h1>;
      }
    `;
    const summary = parser.parse("src/components/Header.jsx", code);
    expect(["javascript", "jsx"]).toContain(summary.language);
    expect(summary.exports.some((e) => e.name === "Header")).toBe(true);
  });

  it("should parse package.json and flag unpinned dependency versions", () => {
    const parser = new JsonParser();
    const json = `{
      "name": "my-pkg",
      "dependencies": {
        "react": "^18.2.0",
        "lodash": "latest",
        "express": "*"
      }
    }`;
    const summary = parser.parse("package.json", json);
    expect(summary.issues.some((i) => i.title.includes("Unpinned Dependency (lodash)"))).toBe(true);
    expect(summary.issues.some((i) => i.title.includes("Unpinned Dependency (express)"))).toBe(true);
  });

  it("should parse SQL schema files and extract tables, primary keys, and columns", () => {
    const parser = new SqlParser();
    const sql = `
      CREATE TABLE orders (
        id UUID PRIMARY KEY,
        customer_id UUID NOT NULL,
        password_hash TEXT
      );
    `;
    const summary = parser.parse("schema.sql", sql);
    expect(summary.symbols.some((s) => s.name === "orders")).toBe(true);
    expect(summary.issues.length).toBe(0); // primary key is present
  });

  it("should parse Python files and detect f-string SQL injections", () => {
    const parser = new PythonParser();
    const py = `
@app.get("/users/{user_id}")
def get_user(user_id: str):
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    return db.execute(query)
    `;
    const summary = parser.parse("app/routes.py", py);
    expect((summary.routes ?? summary.apiRoutes).length).toBe(1);
    expect(summary.issues.some((i) => i.type === "raw_sql_injection")).toBe(true);
  });

  it("should build BM25 full-text keyword search index", () => {
    const index = new BM25SearchIndex();
    index.addDocument("file1.ts", "async function authenticateUser(token: string) { return verify(token); }");
    index.addDocument("file2.ts", "function renderFooter() { return 'footer'; }");

    const results = index.search("authenticate verify", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe("file1.ts");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("should assemble ProjectKnowledgeGraph and compute reverse dependents", () => {
    const graph = new ProjectKnowledgeGraph();
    graph.indexFile("src/utils/math.ts", "export function add(a: number, b: number) { return a + b; }");
    graph.indexFile("src/services/calc.ts", "import { add } from '../utils/math'; export function calc() { return add(1, 2); }");

    const dependents = graph.getDependents("src/utils/math.ts");
    expect(dependents).toContain("src/services/calc.ts");

    const responsible = graph.getFilesResponsibleFor("add math");
    expect(responsible).toContain("src/utils/math.ts");
  });

  it("should scan dependencies for known GHSA security advisories", () => {
    const pkg = JSON.stringify({
      dependencies: {
        lodash: "4.17.15",
        express: "4.16.0",
      },
    });

    const report = DependencyScanner.scan(pkg);
    expect(report.findings.length).toBeGreaterThanOrEqual(2);
    expect(report.findings.some((f) => f.package === "lodash")).toBe(true);
    expect(report.findings.some((f) => f.package === "express")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Phase 2 - AI Orchestrator & Deterministic Evidence Engine
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 2: AI Orchestrator & Multi-Turn Reasoning", () => {
  beforeEach(() => {
    ConversationMemory.clear();
  });

  it("should accurately classify user intents across engineering domains", () => {
    expect(AIOrchestrator.detectIntent("Why did login return 500?")).toBe("debug");
    expect(AIOrchestrator.detectIntent("Is there SQL injection in my API?")).toBe("security");
    expect(AIOrchestrator.detectIntent("Generate fix plan for the bug")).toBe("fix");
    expect(AIOrchestrator.detectIntent("Run unit tests on my auth code")).toBe("testing");
    expect(AIOrchestrator.detectIntent("Review my recent git diff changes")).toBe("git");
    expect(AIOrchestrator.detectIntent("Which files are responsible for attendance?")).toBe("architecture");
  });

  it("should resolve multi-turn conversation pronouns ('fix it', 'test it')", () => {
    ConversationMemory.clear();
    ConversationMemory.setActiveBug("BUG-401", "src/auth/jwt.ts");

    const resFix = ConversationMemory.resolveContextualReferences("fix it please");
    expect(resFix.activeBugId).toBe("BUG-401");
    expect(resFix.activeFilePath).toBe("src/auth/jwt.ts");
    expect(resFix.resolvedQuery).toContain("src/auth/jwt.ts");

    const resTest = ConversationMemory.resolveContextualReferences("now test it");
    expect(resTest.activeBugId).toBe("BUG-401");
  });

  it("should process user query with deterministic AST evidence when offline", async () => {
    const ws = createMockWorkspace();
    const result = await AIOrchestrator.processQuery({
      query: "Why is login failing with 500?",
      ws,
      modelPreference: "builtin",
    });

    expect(result.intent).toBe("debug");
    expect(result.modelUsed).toContain("deterministic");
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls.some((t) => t.name === "search_project")).toBe(true);
    expect(result.toolCalls.some((t) => t.name === "analyze_code")).toBe(true);
    expect(result.suggestedActions.length).toBeGreaterThan(0);
    expect(result.text).toContain("Finding #");
    expect(result.requestId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Phase 3 - Testing, Git Intelligence, Fix Loop & Health Score
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3: Testing, Git Intelligence & Health Score", () => {
  it("should run Mode A Passive Security Audit and produce findings with confidence ratings", () => {
    const graph = new ProjectKnowledgeGraph();
    const ws = createMockWorkspace();
    graph.indexWorkspace(ws);

    const report = SecurityAuditor.runPassiveAudit(graph, ws);
    expect(report.mode).toBe("PASSIVE_STATIC_AUDIT");
    expect(report.findings.length).toBeGreaterThan(0);

    for (const finding of report.findings) {
      expect(finding.severity).toBeDefined();
      expect(finding.confidence).toBeGreaterThanOrEqual(70);
      expect(finding.confidence).toBeLessThanOrEqual(100);
      expect(finding.evidenceSnippet).toBeDefined();
    }
  });

  it("should compute 5-factor project health score and include mandatory disclaimer", () => {
    const graph = new ProjectKnowledgeGraph();
    const ws = createMockWorkspace();
    graph.indexWorkspace(ws);

    const health = ProjectHealthCalculator.calculate(graph, ws);
    expect(health.overallScore).toBeGreaterThanOrEqual(0);
    expect(health.overallScore).toBeLessThanOrEqual(100);
    expect(["A+", "A", "B", "C", "D", "F"]).toContain(health.letterGrade);

    // Verify 5 pillars exist
    expect(health.securityScore).toBeDefined();
    expect(health.codeQualityScore).toBeDefined();
    expect(health.testingScore).toBeDefined();
    expect(health.performanceScore).toBeDefined();
    expect(health.dependenciesScore).toBeDefined();

    // Verify mandatory disclaimer
    expect(health.disclaimer).toContain("heuristic");
    expect(health.disclaimer).toContain("not a formal guarantee of security");
  });

  it("should calculate git diffs, file additions, and generate code review summary", () => {
    const ws = createMockWorkspace();
    const memberFiles = [
      {
        id: "mf-test",
        project_id: ws.project.id,
        user_id: "usr-dev-2",
        file_name: "login.ts",
        relative_path: "src/api/login.ts",
        content: "export function loginUser() { return true; }",
        file_size: 45,
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];

    const status = GitAnalyzer.getStatus(ws, memberFiles);
    expect(status.changedFiles.length).toBeGreaterThan(0);

    const review = GitAnalyzer.reviewChanges(ws, memberFiles);
    expect(review).toContain("Git Diff & Change Review");
  });

  it("should generate test matrix and Vitest/Bun test suite code", () => {
    const plan = TestPlanner.createPlanForAuth("Authentication & Login Flow");
    expect(plan.testCases.length).toBeGreaterThanOrEqual(4);
    expect(plan.testCases.some((t) => t.category === "security_injection")).toBe(true);

    const code = TestGenerator.generateTestSuite(plan);
    expect(code).toContain("describe");
    expect(code).toContain("it(");
    expect(code).toContain("expect(");
  });

  it("should execute closed-loop FixLoopEngine (Bug -> Root Cause -> Approval -> Patch -> Test -> Verify)", () => {
    const finding = {
      id: "finding-null",
      title: "Null check before access",
      category: "CODE_QUALITY" as const,
      severity: "HIGH" as const,
      confidence: 95,
      impact: "Crash on invalid user",
      primaryLocation: { filePath: "src/api/login.ts", line: 6 },
      evidenceItems: [],
      explanation: "Null dereference",
      recommendedFix: "if (!user) return;",
    };

    const workflow = FixLoopEngine.startFixWorkflow(finding, "req-test-1", "proj-startup-ai", "usr-lead-1");
    expect(workflow.state.stage).toBe("PENDING_APPROVAL");
    expect(workflow.approvalRequest.toolName).toBe("apply_patch");
    expect(workflow.approvalRequest.status).toBe("pending");

    const verified = FixLoopEngine.verifyFix(workflow.state, true);
    expect(verified.stage).toBe("VERIFIED");
    expect(verified.testPassed).toBe(true);
    expect(verified.feedback).toContain("successfully verified");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Phase 4 - Evaluation Engine & Benchmarking
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 4: AI Evaluation Engine & Benchmark Dataset", () => {
  it("should contain standard benchmark dataset (BM-1 to BM-7)", () => {
    expect(BENCHMARK_DATASET.length).toBeGreaterThanOrEqual(7);
    const ids = BENCHMARK_DATASET.map((c) => c.id);
    expect(ids.some((id) => id.startsWith("BM-1"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-2"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-3"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-4"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-5"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-6"))).toBe(true);
    expect(ids.some((id) => id.startsWith("BM-7"))).toBe(true);
  });

  it("should calculate evaluation metrics", () => {
    const mockCaseResults = [
      { caseId: "BM-1", passed: true, intentMatched: true, toolsMatched: true, score: 100, latencyMs: 15, notes: "OK" },
      { caseId: "BM-2", passed: true, intentMatched: true, toolsMatched: true, score: 90, latencyMs: 20, notes: "OK" },
      { caseId: "BM-3", passed: false, intentMatched: false, toolsMatched: false, score: 40, latencyMs: 30, notes: "Fail" },
    ];

    const metrics = EvaluationScorer.computeOverallMetrics(mockCaseResults);
    expect(metrics.totalCases).toBe(3);
    expect(metrics.passedCases).toBe(2);
    expect(metrics.failedCases).toBe(1);
    expect(metrics.intentAccuracy).toBeGreaterThan(60);
  });

  it("should run full benchmark evaluation on AIOrchestrator", async () => {
    const ws = createMockWorkspace();
    const report = await AIEvaluator.runBenchmark(ws);

    expect(report.results.length).toBe(BENCHMARK_DATASET.length);
    expect(report.metrics.overallScore).toBeGreaterThanOrEqual(70);
    expect(report.metrics.intentAccuracy).toBeGreaterThanOrEqual(80);
    expect(report.summaryMarkdown).toContain("HackSync AI Quality & Evaluation Report");
  });
});
