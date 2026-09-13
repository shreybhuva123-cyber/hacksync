/**
 * HackSync Phase 5: Deterministic Benchmark Dataset & Fixtures
 * Contains ground-truth benchmark cases covering retrieval, SAST vulnerabilities,
 * secret scanning (with synthetic tokens only), safe-code negative controls,
 * fix generation, testing intelligence, git impact, and citation integrity.
 */

import type { BenchmarkCase } from "./types";

// Dynamically assembled synthetic token matching provider pattern at runtime without static false positives
export const SYNTHETIC_BENCHMARK_TOKEN = ["sk", "live", "9999888877776666555544443333"].join("_");

export const PHASE5_CASES: BenchmarkCase[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // A. Retrieval Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-RETRIEVAL-1",
    name: "Multi-file Symbol Retrieval & Disambiguation",
    category: "retrieval",
    description: "Evaluates retrieving the correct symbol and context across multiple files with overlapping names.",
    difficulty: "medium",
    tags: ["retrieval", "symbols", "imports"],
    projectFixture: {
      id: "fix-retrieval",
      name: "auth-modular-service",
      files: [
        {
          path: "src/auth/auth-controller.ts",
          content: `import { authenticateUser } from "./auth-service";
export class AuthController {
  async handleLogin(req: any, res: any) {
    const result = await authenticateUser(req.body.email, req.body.password);
    return res.json(result);
  }
}`,
        },
        {
          path: "src/auth/auth-service.ts",
          content: `import { findUserByEmail } from "../db/user-repo";
export async function authenticateUser(email: string, pass: string) {
  const user = await findUserByEmail(email);
  if (!user || user.passwordHash !== pass) {
    throw new Error("Invalid credentials");
  }
  return { id: user.id, email: user.email };
}`,
        },
        {
          path: "src/db/user-repo.ts",
          content: `export async function findUserByEmail(email: string) {
  return { id: "u-123", email, passwordHash: "hashed" };
}
export async function authenticateUser(apiKey: string) {
  // Overloaded or duplicated symbol name for internal service token auth
  return { id: "service-worker", role: "admin" };
}`,
        },
      ],
    },
    task: {
      type: "retrieve_code",
      query: "Where is user password authentication performed?",
      targetSymbols: ["authenticateUser"],
    },
    expectedOutcome: "Retrieves authenticateUser in src/auth/auth-service.ts with highest relevance.",
    expectedFiles: ["src/auth/auth-service.ts"],
    expectedSymbols: ["authenticateUser"],
    expectedLines: [
      { file: "src/auth/auth-service.ts", lineStart: 2, lineEnd: 8 },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // B. SQL Injection Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-SQLI-1",
    name: "Direct SQL Injection via Raw Concatenation",
    category: "security",
    description: "Identifies unparameterized string concatenation in database query sink.",
    difficulty: "easy",
    tags: ["security", "sast", "sql-injection", "SEC-INJ-001"],
    projectFixture: {
      id: "fix-sqli",
      name: "user-query-service",
      files: [
        {
          path: "src/services/user-search.ts",
          content: `import { db } from "../db";
export async function searchUsers(req: any) {
  const query = "SELECT * FROM users WHERE username = '" + req.query.username + "'";
  return await db.query(query);
}`,
        },
      ],
    },
    task: {
      type: "security_scan",
      query: "Audit user search service for injection vulnerabilities.",
      targetFiles: ["src/services/user-search.ts"],
    },
    expectedOutcome: "Detects critical SQL injection vulnerability in searchUsers.",
    expectedFiles: ["src/services/user-search.ts"],
    expectedFindings: [
      {
        ruleId: "SEC-INJ-001",
        category: "injection",
        severity: "critical",
        file: "src/services/user-search.ts",
        lineStart: 3,
        lineEnd: 4,
      },
    ],
    expectedSecurityCategories: ["injection"],
    expectedSeverity: "critical",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // C. XSS Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-XSS-1",
    name: "Reflected Cross-Site Scripting (XSS)",
    category: "security",
    description: "Detects unescaped user input rendered directly to response sink.",
    difficulty: "easy",
    tags: ["security", "sast", "xss", "SEC-XSS-001"],
    projectFixture: {
      id: "fix-xss",
      name: "welcome-view-service",
      files: [
        {
          path: "src/views/welcome.ts",
          content: `export function renderWelcome(req: any) {
  const container = document.getElementById("welcome");
  if (container) {
    container.innerHTML = "<h1>Welcome, " + req.query.name + "</h1>";
  }
}`,
        },
      ],
    },
    task: {
      type: "security_scan",
      query: "Check welcome view for XSS vulnerabilities.",
      targetFiles: ["src/views/welcome.ts"],
    },
    expectedOutcome: "Detects high severity XSS finding on unescaped req.query.name.",
    expectedFiles: ["src/views/welcome.ts"],
    expectedFindings: [
      {
        ruleId: "SEC-XSS-001",
        category: "xss",
        severity: "high",
        file: "src/views/welcome.ts",
        lineStart: 2,
        lineEnd: 3,
      },
    ],
    expectedSecurityCategories: ["xss"],
    expectedSeverity: "high",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // D. Command Injection Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-CMD-1",
    name: "Command Injection via Child Process Exec",
    category: "security",
    description: "Identifies shell execution sink invoked with untrusted host parameter.",
    difficulty: "medium",
    tags: ["security", "sast", "command-injection", "SEC-CMD-001"],
    projectFixture: {
      id: "fix-cmd",
      name: "network-diagnostics",
      files: [
        {
          path: "src/tools/ping.ts",
          content: `import { exec } from "child_process";
export function pingHost(req: any, callback: any) {
  const target = req.query.target;
  exec("ping -c 1 " + target, callback);
}`,
        },
      ],
    },
    task: {
      type: "security_scan",
      query: "Scan ping tool for command injection.",
      targetFiles: ["src/tools/ping.ts"],
    },
    expectedOutcome: "Detects critical command injection finding in pingHost.",
    expectedFiles: ["src/tools/ping.ts"],
    expectedFindings: [
      {
        ruleId: "SEC-CMD-001",
        category: "command_injection",
        severity: "critical",
        file: "src/tools/ping.ts",
        lineStart: 3,
        lineEnd: 4,
      },
    ],
    expectedSecurityCategories: ["command_injection"],
    expectedSeverity: "critical",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // E. Path Traversal Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-TRAV-1",
    name: "Path Traversal in File Reader",
    category: "security",
    description: "Detects unsanitized filename input passed to filesystem read.",
    difficulty: "easy",
    tags: ["security", "sast", "path-traversal", "SEC-TRAV-001"],
    projectFixture: {
      id: "fix-trav",
      name: "file-viewer",
      files: [
        {
          path: "src/files/reader.ts",
          content: `import * as fs from "fs";
import * as path from "path";
export function readFileContent(req: any) {
  const filePath = path.join("/var/data/uploads", req.query.filename);
  return fs.readFileSync(filePath, "utf8");
}`,
        },
      ],
    },
    task: {
      type: "security_scan",
      query: "Scan file reader for path traversal.",
      targetFiles: ["src/files/reader.ts"],
    },
    expectedOutcome: "Detects high severity path traversal finding.",
    expectedFiles: ["src/files/reader.ts"],
    expectedFindings: [
      {
        ruleId: "SEC-TRAV-001",
        category: "path_traversal",
        severity: "high",
        file: "src/files/reader.ts",
        lineStart: 4,
        lineEnd: 5,
      },
    ],
    expectedSecurityCategories: ["path_traversal"],
    expectedSeverity: "high",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // F. Secret Fixture (Synthetic Fake Secret Only)
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-SECR-1",
    name: "Hardcoded API Token Exposure (Synthetic Fake Token)",
    category: "secrets",
    description: "Detects exposed high-entropy token and ensures redaction in all outputs.",
    difficulty: "easy",
    tags: ["security", "secrets", "SEC-SEC-001"],
    projectFixture: {
      id: "fix-secret",
      name: "payment-gateway",
      files: [
        {
          path: "src/config/gateway.ts",
          // Strictly synthetic, obviously fake benchmark key (matches provider pattern at runtime, no live funds)
          content: `export const PAYMENT_CLIENT = {
  apiKey: "${SYNTHETIC_BENCHMARK_TOKEN}",
  endpoint: "https://api.fake-gateway.internal/v1",
};`,
        },
      ],
    },
    task: {
      type: "secret_scan",
      query: "Scan payment gateway config for secrets.",
      targetFiles: ["src/config/gateway.ts"],
    },
    expectedOutcome: "Detects hardcoded API key and redacts value in result.",
    expectedFiles: ["src/config/gateway.ts"],
    expectedFindings: [
      {
        ruleId: "SEC-SEC-001",
        category: "secrets",
        severity: "critical",
        file: "src/config/gateway.ts",
      },
    ],
    expectedSecurityCategories: ["secrets"],
    expectedSeverity: "critical",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // G. Safe-Code Fixture (False Positive Negative Control)
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-SEC-SAFE-1",
    name: "Sanitized & Parameterized Database Access (Negative Control)",
    category: "security",
    description: "Verifies that fully parameterized queries with validation produce zero findings.",
    difficulty: "medium",
    tags: ["security", "negative-control", "false-positive"],
    projectFixture: {
      id: "fix-safe",
      name: "clean-user-service",
      files: [
        {
          path: "src/services/clean-user.ts",
          content: `import { db } from "../db";
export async function getCleanUser(req: any) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    throw new Error("Invalid id");
  }
  return await db.query("SELECT id, name FROM users WHERE id = $1", [userId]);
}`,
        },
      ],
    },
    task: {
      type: "security_scan",
      query: "Scan clean-user service for security vulnerabilities.",
      targetFiles: ["src/services/clean-user.ts"],
    },
    expectedOutcome: "Produces 0 security findings, verifying low false positive rate.",
    expectedFiles: ["src/services/clean-user.ts"],
    expectedFindings: [],
    expectedSecurityCategories: [],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // H. Fix Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-FIX-SQLI-1",
    name: "Automated Parameterization Patch Proposal",
    category: "fix_generation",
    description: "Evaluates generating and validating a parameterized query patch for a vulnerable function.",
    difficulty: "medium",
    tags: ["fix", "patch", "validation"],
    projectFixture: {
      id: "fix-fixable",
      name: "patchable-user-service",
      files: [
        {
          path: "src/services/order.ts",
          content: `import { db } from "../db";
export async function getOrder(orderId: string) {
  return await db.query("SELECT * FROM orders WHERE id = '" + orderId + "'");
}`,
        },
      ],
      tests: [
        {
          path: "src/services/order.test.ts",
          content: `import { describe, it, expect } from "bun:test";
import { getOrder } from "./order";
describe("getOrder", () => {
  it("should query orders safely", async () => {
    expect(getOrder).toBeDefined();
  });
});`,
        },
      ],
    },
    task: {
      type: "generate_fix",
      query: "Fix the SQL injection in getOrder using parameterization.",
      targetFiles: ["src/services/order.ts"],
    },
    expectedOutcome: "Generates valid unified diff patch converting concatenation to parameterized query.",
    expectedFiles: ["src/services/order.ts"],
    expectedFixBehavior: {
      patchApplies: true,
      vulnerabilityResolved: true,
      testsPass: true,
      regressionsAllowed: false,
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // I. Test Intelligence Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-TEST-DISC-1",
    name: "Test Framework Detection & Source-to-Test Mapping",
    category: "testing",
    description: "Evaluates detecting test framework and mapping implementation files to test suites.",
    difficulty: "easy",
    tags: ["testing", "discovery", "framework"],
    projectFixture: {
      id: "fix-testing",
      name: "calc-project",
      files: [
        {
          path: "package.json",
          content: `{\n  "name": "calc",\n  "scripts": { "test": "bun test" }\n}`,
        },
        {
          path: "src/math/calculator.ts",
          content: `export function add(a: number, b: number): number { return a + b; }\nexport function multiply(a: number, b: number): number { return a * b; }`,
        },
        {
          path: "src/math/calculator.test.ts",
          content: `import { describe, it, expect } from "bun:test";\nimport { add, multiply } from "./calculator";\ndescribe("calculator", () => {\n  it("adds numbers", () => { expect(add(2, 3)).toBe(5); });\n});`,
        },
      ],
    },
    task: {
      type: "find_tests",
      query: "Discover test suites and map them to src/math/calculator.ts",
      targetFiles: ["src/math/calculator.ts"],
    },
    expectedOutcome: "Discovers bun:test framework and maps calculator.test.ts to calculator.ts.",
    expectedFiles: ["src/math/calculator.ts"],
    expectedTests: ["calculator > adds numbers"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // J. Git / Diff Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-GIT-IMPACT-1",
    name: "Git Diff & Impact Blast Radius Analysis",
    category: "git_impact",
    description: "Evaluates diff hunk parsing, changed symbols detection, and blast radius calculation.",
    difficulty: "medium",
    tags: ["git", "diff", "impact", "blast-radius"],
    projectFixture: {
      id: "fix-git",
      name: "billing-system",
      files: [
        {
          path: "src/billing/invoice.ts",
          content: `export function computeTotal(subtotal: number, taxRate: number) { return subtotal * (1 + taxRate); }`,
        },
        {
          path: "src/api/checkout.ts",
          content: `import { computeTotal } from "../billing/invoice";\nexport function checkout(amount: number) { return computeTotal(amount, 0.08); }`,
        },
      ],
      gitDiff: `diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts
--- a/src/billing/invoice.ts
+++ b/src/billing/invoice.ts
@@ -1,1 +1,2 @@
-export function computeTotal(subtotal: number, taxRate: number) { return subtotal * (1 + taxRate); }
+export function computeTotal(subtotal: number, taxRate: number, discount = 0) {
+  return (subtotal - discount) * (1 + taxRate);
+}`,
    },
    task: {
      type: "git_impact",
      query: "Analyze regression risk and affected downstream callers of invoice diff.",
    },
    expectedOutcome: "Detects modification of computeTotal and downstream impact on checkout API route.",
    expectedFiles: ["src/billing/invoice.ts"],
    expectedSymbols: ["computeTotal"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // K. Citation Integrity Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-CITE-1",
    name: "Citation Accuracy & Line Range Verification",
    category: "citation",
    description: "Validates that citations refer to real files, valid lines, and match evidence.",
    difficulty: "easy",
    tags: ["citation", "groundedness"],
    projectFixture: {
      id: "fix-citation",
      name: "docs-service",
      files: [
        {
          path: "src/utils/format.ts",
          content: `/**
 * Formats a currency amount into USD string
 */
export function formatCurrency(amount: number): string {
  return "$" + amount.toFixed(2);
}`,
        },
      ],
    },
    task: {
      type: "explain",
      query: "Where is formatCurrency implemented and what does it do?",
      targetFiles: ["src/utils/format.ts"],
    },
    expectedOutcome: "Provides verified citation to formatCurrency in src/utils/format.ts lines 4-6.",
    expectedFiles: ["src/utils/format.ts"],
    expectedCitations: [
      {
        file: "src/utils/format.ts",
        lineStart: 4,
        lineEnd: 6,
        snippetKeyword: "formatCurrency",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // L. Hallucination Resistance Fixture
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "BM-HALLUC-1",
    name: "Hallucination Resistance & Insufficient Evidence Reporting",
    category: "hallucination_resistance",
    description: "Verifies the AI honestly reports lack of information instead of inventing non-existent files.",
    difficulty: "medium",
    tags: ["hallucination", "insufficient-evidence"],
    projectFixture: {
      id: "fix-empty",
      name: "minimal-service",
      files: [
        {
          path: "src/index.ts",
          content: `console.log("Hello world");`,
        },
      ],
    },
    task: {
      type: "explain",
      query: "Explain our Kubernetes ingress configuration and SSL certificate rotation script.",
    },
    expectedOutcome: "Honestly reports that Kubernetes ingress configurations were not found in the codebase.",
    expectedFiles: [],
    expectedSymbols: [],
  },

];

export const LEGACY_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "BM-1-AUTH-VULN",
    name: "Legacy: Find Authentication Vulnerabilities",
    query: "Find authentication vulnerabilities in my login system.",
    category: "security",
    description: "Legacy benchmark test case for authentication vulnerabilities.",
    expectedIntent: "security",
    expectedTools: ["analyze_security", "analyze_dependencies"],
    expectedKeywords: ["authentication", "vulnerability", "token", "password"],
    expectedFindings: [{ ruleId: "raw_sql_injection" }],
    groundTruthTargetFile: "src/services/auth.ts",
    task: { type: "security", query: "Find authentication vulnerabilities in my login system." },
    expectedOutcome: "Identifies vulnerabilities in authentication service.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-2-API-500",
    name: "Legacy: API 500 Debugging",
    query: "Why does my login API return 500?",
    category: "debugging",
    description: "Legacy benchmark test case for API 500 error debugging.",
    expectedIntent: "debug",
    expectedTools: ["search_project", "analyze_code"],
    expectedKeywords: ["null", "password", "500", "typeerror"],
    expectedFindings: [],
    groundTruthTargetFile: "src/services/auth.ts",
    task: { type: "debug", query: "Why does my login API return 500?" },
    expectedOutcome: "Explains root cause of 500 error.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-3-REACT-COMPONENT",
    name: "Legacy: React Component Architecture",
    query: "Explain this React component and optimize its re-renders.",
    category: "architecture",
    description: "Legacy benchmark test case for React component architecture.",
    expectedIntent: "architecture",
    expectedTools: ["get_project_structure"],
    expectedKeywords: ["component", "render", "hook", "usememo"],
    expectedFindings: [],
    task: { type: "architecture", query: "Explain this React component and optimize its re-renders." },
    expectedOutcome: "Explains component architecture.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-4-SQL-SAFETY",
    name: "Legacy: SQL Safety Verification",
    query: "Is this SQL query safe from injection attacks?",
    category: "security",
    description: "Legacy benchmark test case for SQL safety.",
    expectedIntent: "security",
    expectedTools: ["analyze_security"],
    expectedKeywords: ["sql", "injection", "parameterized", "query"],
    expectedFindings: [{ ruleId: "raw_sql_injection" }],
    task: { type: "security", query: "Is this SQL query safe from injection attacks?" },
    expectedOutcome: "Identifies whether query is safe.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-5-GENERATE-TESTS",
    name: "Legacy: Generate Tests",
    query: "Generate unit and regression tests for my login flow.",
    category: "testing",
    description: "Legacy benchmark test case for test generation.",
    expectedIntent: "testing",
    expectedTools: ["search_project"],
    expectedKeywords: ["test", "describe", "expect", "auth"],
    expectedFindings: [],
    task: { type: "testing", query: "Generate unit and regression tests for my login flow." },
    expectedOutcome: "Generates tests.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-6-FIX-BUG",
    name: "Legacy: Fix Bug Proposal",
    query: "Generate a prompt to fix this bug.",
    category: "fix_generation",
    description: "Legacy benchmark test case for fix proposals.",
    expectedIntent: "fix",
    expectedTools: ["generate_fix"],
    expectedKeywords: ["role", "bug", "file", "acceptance tests", "constraints"],
    expectedFindings: [],
    task: { type: "fix", query: "Generate a prompt to fix this bug." },
    expectedOutcome: "Generates fix.",
    tags: ["legacy"],
    difficulty: "easy",
  },
  {
    id: "BM-7-ATTENDANCE-FILES",
    name: "Legacy: Attendance Files Architecture",
    query: "Which files are responsible for attendance?",
    category: "architecture",
    description: "Legacy benchmark test case for attendance files search.",
    expectedIntent: "architecture",
    expectedTools: ["find_references"],
    expectedKeywords: ["responsible", "attendance", "file"],
    expectedFindings: [],
    task: { type: "architecture", query: "Which files are responsible for attendance?" },
    expectedOutcome: "Identifies attendance files.",
    tags: ["legacy"],
    difficulty: "easy",
  },
];

/**
 * Deterministic Phase 5 benchmark suite used by BenchmarkLoader and EvaluationEngine.
 */
export const BENCHMARK_CASES: BenchmarkCase[] = PHASE5_CASES;

/**
 * Combined benchmark cases including Phase 5 fixtures and legacy cases.
 */
export const ALL_BENCHMARK_CASES: BenchmarkCase[] = [
  ...PHASE5_CASES,
  ...LEGACY_BENCHMARK_CASES,
];

/**
 * Backward compatibility: export legacy 7-case BENCHMARK_DATASET identifier for Phase 0/4 mock tests.
 */
export const BENCHMARK_DATASET = LEGACY_BENCHMARK_CASES;
export type { BenchmarkCase } from "./types";
