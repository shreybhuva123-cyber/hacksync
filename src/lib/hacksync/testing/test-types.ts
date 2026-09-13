/**
 * Testing Intelligence Type Contracts — HackSync Phase 4
 */

import type { Patch } from "../fixing/fix-types";

export interface TestFrameworkInfo {
  framework: string;
  language: string;
  configFiles: string[];
  testFilePatterns: string[];
  packageManager?: string | undefined;
  confidence: number;
}

export interface TestSuite {
  filePath: string;
  name: string;
  testNames: string[];
  framework: string;
}

export interface TestDiscoveryResult {
  projectId: string;
  frameworkInfo: TestFrameworkInfo;
  testFiles: string[];
  suites: TestSuite[];
  fileCoverageMapping: Record<string, { testFile: string; confidence: "high" | "medium" | "low" }[]>;
  testCommands: string[];
}

export interface TestCase {
  id: string;
  name: string;
  type:
    | "unit"
    | "integration"
    | "api"
    | "database"
    | "security"
    | "e2e"
    | "regression";
  targetFile?: string | undefined;
  targetSymbol?: string | undefined;
  rationale: string;
  expectedBehavior: string;
  priority: "low" | "medium" | "high" | "critical";
  existing: boolean;
  confidence: number;
}

export interface TestPlan {
  id: string;
  projectId: string;
  targetFiles: string[];
  targetSymbols: string[];
  tests: TestCase[];
  priority: "low" | "medium" | "high" | "critical";
  reasoning: string;
  confidence: number;
}

export interface GeneratedTestProposal {
  targetFile: string;
  testFile: string;
  framework: string;
  rationale: string;
  patch: Patch;
  confidence: number;
}

export interface TestFailure {
  testName: string;
  file?: string | undefined;
  line?: number | undefined;
  message: string;
  stack?: string | undefined;
  classification?:
    | "assertion"
    | "runtime"
    | "compile"
    | "dependency"
    | "environment"
    | "timeout"
    | "unknown"
    | undefined;
}

export interface TestRun {
  id: string;
  projectId: string;
  framework: string;
  command: string;
  startedAt: string;
  finishedAt: string;
  status:
    | "passed"
    | "failed"
    | "timeout"
    | "blocked"
    | "unavailable";
  exitCode?: number | undefined;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  stdout: string;
  stderr: string;
  failures: TestFailure[];
  confidence: number;
}

export interface TestRunnerOptions {
  timeoutMs?: number | undefined;
  maxBufferBytes?: number | undefined;
  testFilter?: string | undefined;
  targetFile?: string | undefined;
  workspacePath?: string | undefined;
}
