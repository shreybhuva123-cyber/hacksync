/**
 * Test Planner Engine — HackSync Phase 4
 * Consumes AST symbols, Git changes, security findings, and dependency impact
 * to construct targeted, prioritized test plans.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { SecurityFinding } from "../security/finding-types";
import { TestDiscovery } from "./test-discovery";
import type { TestPlan, TestCase } from "./test-types";

export interface TestCasePlan {
  id: string;
  name: string;
  category: "happy_path" | "boundary" | "error_handling" | "security_injection" | "auth_expiry";
  description: string;
  expectedOutcome: string;
}

export interface TestingPlanReport {
  target: string;
  totalTests: number;
  testCases: TestCasePlan[];
}

export interface TestPlannerOptions {
  changedFiles?: string[] | undefined;
  changedSymbols?: string[] | undefined;
  targetFile?: string | undefined;
  securityFinding?: SecurityFinding | undefined;
  query?: string | undefined;
}

export class TestPlanner {
  /**
   * Backward-compatible helper for static architecture and auth test plans.
   */
  static createPlanForAuth(target = "Authentication & Login Flow"): TestingPlanReport {
    const testCases: TestCasePlan[] = [
      {
        id: "TC-AUTH-1",
        name: "Valid User Login",
        category: "happy_path",
        description: "Submit valid credentials for existing user.",
        expectedOutcome: "HTTP 200 OK with valid JWT access and refresh tokens.",
      },
      {
        id: "TC-AUTH-2",
        name: "Non-Existent User Login",
        category: "error_handling",
        description: "Submit email that does not exist in database.",
        expectedOutcome: "HTTP 401 Unauthorized without exposing user non-existence or throwing 500.",
      },
      {
        id: "TC-AUTH-3",
        name: "Invalid Password",
        category: "error_handling",
        description: "Submit valid email with incorrect password.",
        expectedOutcome: "HTTP 401 Unauthorized with generic error message.",
      },
      {
        id: "TC-AUTH-4",
        name: "Empty / Missing Credentials",
        category: "boundary",
        description: "Submit empty email or missing password field.",
        expectedOutcome: "HTTP 400 Bad Request with Zod schema validation errors.",
      },
      {
        id: "TC-AUTH-5",
        name: "SQL Injection Resistance",
        category: "security_injection",
        description: "Submit malicious SQL payload in email (' OR '1'='1).",
        expectedOutcome: "HTTP 401/400 safely rejected via parameterized query bindings.",
      },
      {
        id: "TC-AUTH-6",
        name: "Expired JWT Token Refresh",
        category: "auth_expiry",
        description: "Attempt session refresh with expired or revoked token.",
        expectedOutcome: "HTTP 401 Unauthorized; token rejection and session invalidation.",
      },
    ];

    return {
      target,
      totalTests: testCases.length,
      testCases,
    };
  }

  /**
   * Plans targeted test execution for a given project and context.
   */
  static plan(graph: ProjectKnowledgeGraph, projectId: string, options: TestPlannerOptions = {}): TestPlan {
    const discovery = TestDiscovery.discover(graph, projectId);
    const targetFiles: string[] = [];
    const targetSymbols: string[] = [...(options.changedSymbols || [])];
    const testCases: TestCase[] = [];

    // 1. Resolve Target Files
    if (options.targetFile) {
      targetFiles.push(options.targetFile);
    }
    if (options.changedFiles) {
      for (const f of options.changedFiles) {
        if (!targetFiles.includes(f)) targetFiles.push(f);
      }
    }
    if (options.securityFinding?.filePath && !targetFiles.includes(options.securityFinding.filePath)) {
      targetFiles.push(options.securityFinding.filePath);
    }

    // Default to first discovered source file if none provided
    if (targetFiles.length === 0) {
      const allFiles = graph.getAllFilePaths();
      const firstSource = allFiles.find((f) => !f.includes(".test.") && !f.includes(".spec.") && (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".py")));
      if (firstSource) targetFiles.push(firstSource);
    }

    let planPriority: "low" | "medium" | "high" | "critical" = "medium";
    let reasoning = "";

    // 2. Handle Security Finding context
    if (options.securityFinding) {
      const sf = options.securityFinding;
      planPriority = sf.severity === "critical" ? "critical" : "high";
      reasoning = `Targeted test plan formulated to verify remediation of ${sf.severity.toUpperCase()} security vulnerability '${sf.title}' in ${sf.filePath}.`;

      testCases.push({
        id: `tc-sec-${Date.now()}-1`,
        name: `Security Regression Test: ${sf.title} (${sf.ruleId})`,
        type: "security",
        targetFile: sf.filePath,
        targetSymbol: sf.ruleId,
        rationale: `Ensure that attack vector for ${sf.category} (${sf.ruleId}) is properly defended and neutralized.`,
        expectedBehavior: `Input with malicious payloads must be safely handled, parameterized, sanitized, or rejected with HTTP 400/401/403.`,
        priority: "critical",
        existing: false,
        confidence: 0.95,
      });
    }

    // 3. Correlate Target Files with Existing and Proposed Tests
    for (const file of targetFiles) {
      const mappedTests = discovery.fileCoverageMapping[file] || [];

      if (mappedTests.length > 0) {
        for (const mt of mappedTests) {
          const suite = discovery.suites.find((s) => s.filePath === mt.testFile);
          const testsInSuite = suite?.testNames || [];

          if (testsInSuite.length > 0) {
            for (const tName of testsInSuite.slice(0, 3)) {
              testCases.push({
                id: `tc-unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: tName,
                type: "unit",
                targetFile: file,
                rationale: `Existing unit test in ${mt.testFile} covers modified source file ${file}.`,
                expectedBehavior: `Unit test assertions must continue to pass without regression.`,
                priority: planPriority === "critical" ? "critical" : "high",
                existing: true,
                confidence: mt.confidence === "high" ? 0.95 : mt.confidence === "medium" ? 0.8 : 0.6,
              });
            }
          } else {
            testCases.push({
              id: `tc-suite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: `Execute test suite: ${mt.testFile}`,
              type: "unit",
              targetFile: file,
              rationale: `Existing test suite file directly corresponds to ${file}.`,
              expectedBehavior: `All suite assertions should pass cleanly.`,
              priority: "high",
              existing: true,
              confidence: 0.9,
            });
          }
        }
      } else {
        // No existing test file found for target file: propose targeted test
        testCases.push({
          id: `tc-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Unit Test for ${file}`,
          type: "unit",
          targetFile: file,
          rationale: `No direct test file found covering ${file}; proposed new unit test to establish regression baseline.`,
          expectedBehavior: `Core exported functions in ${file} should behave deterministically under expected and edge-case inputs.`,
          priority: "medium",
          existing: false,
          confidence: 0.85,
        });
      }
    }

    // 4. Downstream / Regression Impact Tests
    if (targetFiles.some((f) => f.includes("auth") || f.includes("db") || f.includes("session") || f.includes("token"))) {
      if (planPriority !== "critical") planPriority = "high";
      testCases.push({
        id: `tc-reg-${Date.now()}-1`,
        name: `Integration & Regression Check for Authentication / Core Infrastructure`,
        type: "regression",
        rationale: `Changes touch critical security/auth infrastructure which has high blast radius across the application.`,
        expectedBehavior: `Session verification, token validation, and access control middleware must remain operational.`,
        priority: "high",
        existing: false,
        confidence: 0.9,
      });
    }

    if (!reasoning) {
      reasoning = `Targeted test plan formulated for ${targetFiles.length} file(s) and ${targetSymbols.length} symbol(s) using detected ${discovery.frameworkInfo.framework} framework.`;
    }

    return {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId,
      targetFiles,
      targetSymbols,
      tests: testCases,
      priority: planPriority,
      reasoning,
      confidence: discovery.frameworkInfo.confidence,
    };
  }
}
