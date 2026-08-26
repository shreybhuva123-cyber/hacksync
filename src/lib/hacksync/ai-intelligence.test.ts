import { describe, it, expect } from "bun:test";
import { auditWorkspaceSecurity } from "./ai-security";
import { analyzeCodeFile, askWorkspaceCopilot } from "./ai-assistant";
import { computeReadiness, computeWarnings } from "./analysis";
import {
  detectWorkspaceConflicts,
  generateTypeScriptSDK,
  generatePrismaSchema,
  generateDrizzleSchema,
  generatePitchScript,
} from "./conflict-radar";
import type { Workspace, CodeNode, ApiContract, DbTable, DbColumn, Project, Member } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Workspace Fixture
// ─────────────────────────────────────────────────────────────────────────────

function createMockWorkspace(): Workspace {
  const project: Project = {
    id: "proj-1",
    name: "HackSync Core",
    description: "Hackathon Integration Center",
    repo_url: "https://github.com/team/hacksync",
    default_branch: "main",
    schema_version: "2026-08-v1",
    invite_code: "HSYNC123",
    is_open_demo: true,
    demo_mode: false,
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const members: Member[] = [
    {
      id: "m-1",
      project_id: "proj-1",
      user_id: "user-1",
      display_name: "Alex Dev",
      email: "alex@team.dev",
      role: "lead",
      branch_name: "feature/auth",
      working_area: "Security",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "m-2",
      project_id: "proj-1",
      user_id: "user-2",
      display_name: "Sam Front",
      email: "sam@team.dev",
      role: "frontend",
      branch_name: "ui/explorer",
      working_area: "Code Explorer",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
  ];

  const codeNodes: CodeNode[] = [
    {
      id: "node-1",
      project_id: "proj-1",
      path: "src/server/db.ts",
      parent_path: "src/server",
      kind: "file",
      area: "backend",
      owner_role: "backend",
      status: "in_progress",
      language: "typescript",
      content: `
        import { db } from './client';
        // Vulnerable query with SQL interpolation
        export async function getUser(userId: string) {
          return db.query("SELECT * FROM users WHERE id = '" + userId + "'");
        }
        // Hardcoded API token leak
        const stripeKey = "jwt_secret = 'super_secret_jwt_token_sample_key'";
      `,
      updated_at: new Date().toISOString(),
    },
    {
      id: "node-2",
      project_id: "proj-1",
      path: "src/utils/helpers.ts",
      parent_path: "src/utils",
      kind: "file",
      area: "shared",
      owner_role: "frontend",
      status: "done",
      language: "typescript",
      content: `
        export function processItems(items: string[]) {
          for (let i = 0; i < items.length; i++) {
            console.log(items[i]);
          }
        }
        export function fetchAsyncData() {
          fetch('/api/v1/data'); // Floating promise bug
        }
      `,
      updated_at: new Date().toISOString(),
    },
  ];

  const contracts: ApiContract[] = [
    {
      id: "c-1",
      project_id: "proj-1",
      method: "POST",
      route: "/api/users/:id/delete",
      summary: "Delete user profile",
      request_schema: '{"confirm": true}',
      response_schema: '{"success": true}',
      auth_required: false, // IDOR vulnerability!
      status: "live",
      owner_role: "backend",
      version: "v1",
      test_status: "passing",
      locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "c-2",
      project_id: "proj-1",
      method: "GET",
      route: "/api/health",
      summary: "Health probe",
      request_schema: null,
      response_schema: '{"status": "ok"}',
      auth_required: false,
      status: "live",
      owner_role: "backend",
      version: "v1",
      test_status: "passing",
      locked: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const tables: DbTable[] = [
    {
      id: "tbl-1",
      project_id: "proj-1",
      name: "users",
      description: "User accounts table",
      owner_role: "database",
      schema_version: "2026-08-v1",
      migration_status: "applied",
      sql_definition: "CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, password TEXT);",
    },
  ];

  const columns: DbColumn[] = [
    {
      id: "col-1",
      table_id: "tbl-1",
      project_id: "proj-1",
      name: "id",
      data_type: "UUID",
      is_primary: true,
      is_nullable: false,
      is_indexed: true,
      references_table: null,
      ordinal: 1,
    },
    {
      id: "col-2",
      table_id: "tbl-1",
      project_id: "proj-1",
      name: "password",
      data_type: "TEXT",
      is_primary: false,
      is_nullable: false,
      is_indexed: false,
      references_table: null,
      ordinal: 2,
    },
  ];

  return {
    project,
    members,
    codeNodes,
    contracts,
    tables,
    columns,
    links: [],
    branches: [],
    envVars: [
      {
        id: "env-1",
        project_id: "proj-1",
        key_name: "DATABASE_URL",
        scope: "backend",
        required: true,
        configured: true,
        used_in: "db.ts",
        description: "Postgres Connection",
        example_value: "postgres://...",
      },
    ],
    checks: [
      {
        id: "chk-1",
        project_id: "proj-1",
        name: "API Health",
        category: "Backend",
        status: "pass",
        detail: "HTTP 200 OK",
        critical: true,
        last_run_at: new Date().toISOString(),
      },
    ],
    tasks: [],
    activity: [],
    notes: [],
    handoffs: [],
    comments: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Cyber Security Scanner Engine", () => {
  it("should detect SQL injection, exposed secret keys, and IDOR vulnerabilities", () => {
    const ws = createMockWorkspace();
    const result = auditWorkspaceSecurity(ws);

    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.summary.total).toBeGreaterThan(0);

    // Verify SQLi detection
    const sqliVuln = result.vulnerabilities.find((v) => v.category === "injection");
    expect(sqliVuln).toBeDefined();
    expect(sqliVuln?.severity).toBe("critical");
    expect(sqliVuln?.location.target).toBe("src/server/db.ts");

    // Verify Secret leak detection
    const secretVuln = result.vulnerabilities.find((v) => v.category === "secrets");
    expect(secretVuln).toBeDefined();
    expect(secretVuln?.title).toContain("Hardcoded Secret / Credential");

    // Verify IDOR detection
    const idorVuln = result.vulnerabilities.find((v) => v.category === "auth_idor");
    expect(idorVuln).toBeDefined();
    expect(idorVuln?.location.target).toContain("/api/users/:id/delete");
    expect(idorVuln?.autoFixable).toBe(true);
  });

  it("should compute correct cyber security grade bounds", () => {
    const ws = createMockWorkspace();
    const result = auditWorkspaceSecurity(ws);
    expect(["A+", "A", "B", "C", "D", "F"]).toContain(result.grade);
  });
});

describe("AI Code Intelligence & Bug Diagnoser", () => {
  it("should detect floating promises and unhandled async bugs", () => {
    const ws = createMockWorkspace();
    const node = ws.codeNodes.find((n) => n.path === "src/utils/helpers.ts")!;
    const analysis = analyzeCodeFile(node, ws);

    expect(analysis.bugs.length).toBeGreaterThan(0);
    const asyncBug = analysis.bugs.find((b) => b.category === "async");
    expect(asyncBug).toBeDefined();
    expect(asyncBug?.title).toContain("Floating Unhandled Promise");
    expect(asyncBug?.debuggingGuide).toBeDefined();
    expect(asyncBug?.suggestedFix).toBeDefined();
  });

  it("should provide construct rationale and for-to-while loop transformations", () => {
    const ws = createMockWorkspace();
    const node = ws.codeNodes.find((n) => n.path === "src/utils/helpers.ts")!;
    const analysis = analyzeCodeFile(node, ws);

    expect(analysis.explanation.constructInsights.length).toBeGreaterThan(0);
    const forLoopInsight = analysis.explanation.constructInsights.find((ci) =>
      ci.construct.includes("for"),
    );
    expect(forLoopInsight).toBeDefined();
    expect(forLoopInsight?.whyUsed).toBeDefined();
    expect(forLoopInsight?.transformationGuide).toBeDefined();
    expect(forLoopInsight?.transformationGuide?.convertedSnippet).toContain("while");
  });
});

describe("Interactive AI Workspace Copilot", () => {
  it("should explain why for loop was used and how to convert it to while loop", async () => {
    const ws = createMockWorkspace();
    const query = "Why did we use a for loop here instead of while loop and how do I change it?";
    const reply = await askWorkspaceCopilot(query, ws);

    expect(reply.role).toBe("assistant");
    expect(reply.content).toContain("Loop Constructs & Algorithmic Trade-offs");
    expect(reply.content).toContain("while");
    expect(reply.content).toContain("typescript");
  });

  it("should answer cyber security questions with workspace specifics", async () => {
    const ws = createMockWorkspace();
    const query = "Audit our cyber security vulnerabilities";
    const reply = await askWorkspaceCopilot(query, ws);

    expect(reply.content).toContain("Cyber Security & Penetration Audit");
    expect(reply.content).toContain(ws.project.name);
  });

  it("should answer API contract questions with live contract list", async () => {
    const ws = createMockWorkspace();
    const query = "List all API contracts";
    const reply = await askWorkspaceCopilot(query, ws);

    expect(reply.content).toContain("/api/users/:id/delete");
  });

  it("should answer out-of-the-box custom engineering questions", async () => {
    const ws = createMockWorkspace();
    const query = "How should we implement rate limiting and caching for our backend?";
    const reply = await askWorkspaceCopilot(query, ws);

    expect(reply.role).toBe("assistant");
    expect(reply.content).toContain("Architectural Analysis");
    expect(reply.content).toContain("Type Safety");
    expect(reply.content).toContain("typescript");
  });

  it("should support multi-turn conversation memory", async () => {
    const ws = createMockWorkspace();
    const history = [
      { id: "1", role: "user" as const, content: "What database do we use?", timestamp: "12:00" },
      { id: "2", role: "assistant" as const, content: "You use PostgreSQL.", timestamp: "12:00" },
    ];
    const reply = await askWorkspaceCopilot("Can you show me the schema?", ws, null, history);
    expect(reply.content).toBeDefined();
    expect(reply.content.length).toBeGreaterThan(10);
  });
});

describe("Workspace Readiness & Warning Engine", () => {
  it("should calculate readiness score without mathematical anomalies", () => {
    const ws = createMockWorkspace();
    const readiness = computeReadiness(ws);
    expect(readiness.score).toBeGreaterThanOrEqual(0);
    expect(readiness.score).toBeLessThanOrEqual(100);
    expect(readiness.factors.length).toBe(7);
  });

  it("should calculate warnings correctly", () => {
    const ws = createMockWorkspace();
    const warnings = computeWarnings(ws);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe("Conflict Radar & Code Generators", () => {
  it("should detect conflicts and compute health score", () => {
    const ws = createMockWorkspace();
    const report = detectWorkspaceConflicts(ws);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.conflicts)).toBe(true);
  });

  it("should generate type-safe TypeScript SDK client with hooks", () => {
    const ws = createMockWorkspace();
    const sdk = generateTypeScriptSDK(ws.contracts);
    expect(sdk).toContain("useQuery");
    expect(sdk).toContain("formatUrl");
    expect(sdk).toContain("/api/users/:id/delete");
  });

  it("should generate Prisma and Drizzle ORM schemas", () => {
    const ws = createMockWorkspace();
    const prisma = generatePrismaSchema(ws.tables, ws.columns);
    expect(prisma).toContain("model Users");
    expect(prisma).toContain("@id");

    const drizzle = generateDrizzleSchema(ws.tables, ws.columns);
    expect(drizzle).toContain("export const users = pgTable");
  });

  it("should generate tailored AI pitch scripts for judges", () => {
    const ws = createMockWorkspace();
    const script60s = generatePitchScript(ws, "60s");
    expect(script60s).toContain("60-Second Elevator Pitch");
    expect(script60s).toContain(ws.project.name);

    const script2min = generatePitchScript(ws, "2min");
    expect(script2min).toContain("2-Minute Demo Presentation");
  });
});

describe("Vibe Coding Local File System & Sync Engine", () => {
  it("should accurately infer programming languages from file extensions", async () => {
    const { inferFileLanguage, isLikelyCodeFile } = await import("./local-filesystem");
    expect(inferFileLanguage("ts")).toBe("typescript");
    expect(inferFileLanguage("tsx")).toBe("typescript");
    expect(inferFileLanguage("py")).toBe("python");
    expect(inferFileLanguage("sql")).toBe("sql");
    expect(inferFileLanguage("json")).toBe("json");

    expect(isLikelyCodeFile("App.tsx")).toBe(true);
    expect(isLikelyCodeFile("server.py")).toBe(true);
    expect(isLikelyCodeFile("image.png")).toBe(false);
  });

  it("should correctly classify file architecture area from directory path", async () => {
    const { inferFileArea } = await import("./local-filesystem");
    expect(inferFileArea("src/components/Navbar.tsx")).toBe("frontend");
    expect(inferFileArea("src/routes/dashboard.tsx")).toBe("frontend");
    expect(inferFileArea("src/server/auth.ts")).toBe("backend");
    expect(inferFileArea("src/api/routes.ts")).toBe("backend");
    expect(inferFileArea("src/database/schema.sql")).toBe("database");
    expect(inferFileArea("src/utils/math.ts")).toBe("shared");
  });

  it("should convert scanned files into valid HackSync CodeNodes", async () => {
    const { convertScannedFilesToCodeNodes } = await import("./local-filesystem");
    const scanned = [
      {
        path: "src/components/Header.tsx",
        name: "Header.tsx",
        extension: "tsx",
        size: 1024,
        content: "export const Header = () => <div />;",
        lastModified: Date.now(),
        area: "frontend" as const,
        language: "typescript",
      },
      {
        path: "src/server/router.ts",
        name: "router.ts",
        extension: "ts",
        size: 2048,
        content: "export const router = new Router();",
        lastModified: Date.now(),
        area: "backend" as const,
        language: "typescript",
      },
    ];

    const nodes = convertScannedFilesToCodeNodes(scanned, "proj-test", "lead");
    expect(nodes.length).toBe(2);
    expect(nodes[0]?.path).toBe("src/components/Header.tsx");
    expect(nodes[0]?.owner_role).toBe("frontend");
    expect(nodes[1]?.owner_role).toBe("backend");
  });
});
