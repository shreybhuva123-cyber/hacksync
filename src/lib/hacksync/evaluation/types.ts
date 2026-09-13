/**
 * HackSync Phase 5: Evaluation & Benchmarking Domain Types
 * Defines comprehensive contracts for benchmarks, test cases, evaluation metrics,
 * execution records, and regression policies.
 */

import type { AIIntentType } from "../ai/types";

export type BenchmarkCategory =
  | "retrieval"
  | "code_understanding"
  | "debugging"
  | "security"
  | "secrets"
  | "dependency_security"
  | "git_impact"
  | "testing"
  | "test_generation"
  | "fix_generation"
  | "verification"
  | "architecture"
  | "citation"
  | "hallucination_resistance";

export type EvaluationMethod =
  | "DETERMINISTIC"
  | "HEURISTIC"
  | "MODEL_BASED"
  | "MANUAL_REVIEW";

export type BenchmarkDifficulty = "easy" | "medium" | "hard";

export type MetricValue = number | "not_applicable";

export interface FixtureFile {
  path: string;
  content: string;
  isBinary?: boolean;
}

export interface BenchmarkProjectFixture {
  id: string;
  name: string;
  files: FixtureFile[];
  gitStatus?: {
    staged?: string[];
    unstaged?: string[];
    untracked?: string[];
    deleted?: string[];
    renamed?: Array<{ from: string; to: string }>;
  };
  gitDiff?: string;
  tests?: FixtureFile[];
}

export interface BenchmarkTask {
  type: string;
  query: string;
  targetFiles?: string[];
  targetSymbols?: string[];
  findingId?: string;
  options?: Record<string, unknown>;
}

export interface ExpectedFinding {
  ruleId?: string;
  category?: string;
  severity?: string;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  confidenceMin?: number;
}

export interface ExpectedCitation {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  snippetKeyword?: string;
}

export interface ExpectedFixBehavior {
  patchApplies?: boolean;
  vulnerabilityResolved?: boolean;
  testsPass?: boolean;
  regressionsAllowed?: boolean;
}

export interface BenchmarkCase {
  id: string;
  name: string;
  category: BenchmarkCategory;
  description: string;
  projectFixture?: BenchmarkProjectFixture;
  task: BenchmarkTask;
  expectedOutcome: string;
  expectedFiles?: string[];
  expectedSymbols?: string[];
  expectedLines?: Array<{ file: string; lineStart: number; lineEnd: number }>;
  expectedFindings?: ExpectedFinding[];
  expectedSecurityCategories?: string[];
  expectedSeverity?: string;
  expectedFixBehavior?: ExpectedFixBehavior;
  expectedTests?: string[];
  expectedCitations?: ExpectedCitation[];
  tags: string[];
  difficulty: BenchmarkDifficulty;

  // Backward compatibility with Phase 0/4 mock dataset
  query?: string;
  expectedIntent?: AIIntentType;
  expectedTools?: string[];
  expectedKeywords?: string[];
  groundTruthTargetFile?: string;
}

export interface ClassificationMetrics {
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: MetricValue;
  recall: MetricValue;
  f1: MetricValue;
  accuracy: MetricValue;
  falsePositiveRate: MetricValue;
}

export interface RetrievalMetrics {
  hitAt1: MetricValue;
  hitAt3: MetricValue;
  hitAt5: MetricValue;
  mrr: MetricValue;
  relevanceScore: MetricValue;
  evidenceCoverage: MetricValue;
  isolatedToProject: boolean;
}

export interface CitationMetrics {
  totalCitations: number;
  validCitations: number;
  invalidCitations: number;
  missingCitations: number;
  hallucinatedCitations: number;
  validityRate: MetricValue;
}

export interface AnswerMetrics {
  grounded: boolean;
  groundednessScore: MetricValue;
  evidenceCoverage: MetricValue;
  unsupportedClaims: number;
  hallucinatedFiles: number;
  hallucinatedSymbols: number;
  insufficientEvidenceReportedCorrectly: boolean;
}

export interface FixMetrics {
  patchGenerated: boolean;
  patchValid: boolean;
  patchApplies: boolean;
  testsPass: boolean;
  vulnerabilityResolved: boolean;
  regressionIntroduced: boolean;
  changedFilesCount: number;
  unnecessaryChangesCount: number;
}

export interface TestingMetrics {
  frameworkDetected: boolean;
  testsDiscoveredCount: number;
  relevantTestsSelectedCount: number;
  generatedTestsValid: boolean;
  executionSuccess: boolean;
}

export interface GitMetrics {
  statusAccuracy: MetricValue;
  diffAccuracy: MetricValue;
  changedSymbolsAccuracy: MetricValue;
  impactAccuracy: MetricValue;
}

export interface CaseEvaluationResult {
  caseId: string;
  name: string;
  category: BenchmarkCategory;
  evaluationMethod: EvaluationMethod;
  passed: boolean;
  score: number; // 0..100
  latencyMs: number;
  metrics: Record<string, MetricValue>;
  findings?: unknown[];
  evidence?: unknown[];
  notes: string;
  error?: string;

  // Backward-compatibility properties
  intentMatched?: boolean;
  toolsMatched?: boolean;
}

export interface DetectedRegression {
  metric: string;
  category?: BenchmarkCategory;
  baselineValue: number;
  currentValue: number;
  relativeDropPct: number;
  absoluteDrop: number;
  threshold: number;
  severity: "critical" | "warning";
  message: string;
}

export interface RegressionThresholds {
  securityF1DropMaxPct: number; // default 5%
  retrievalHit5DropMaxPct: number; // default 5%
  fixVerificationDropMaxPct: number; // default 5%
  citationValidityDropMaxPct: number; // default 5%
  overallScoreDropMaxPct: number; // default 5%
  maxLatencyIncreasePct: number; // default 50%
}

export interface BenchmarkRun {
  runId: string;
  projectId: string;
  startedAt: string;
  completedAt: string;
  versionCommit: string;
  environment: string;
  provider: string;
  model: string;
  configHash: string;
  benchmarkVersion: string;
  caseCount: number;
  passedCases: number;
  failedCases: number;
  overallScore: number;
  categoryScores: Partial<Record<BenchmarkCategory, number>>;
  metrics: Record<string, MetricValue>;
  regressions: DetectedRegression[];
  latencyMs: number;
  errorCount: number;
  status: "completed" | "failed" | "cancelled" | "unavailable";
  results: CaseEvaluationResult[];
}

export interface ModelComparisonReport {
  baselineRunId: string;
  candidateRunId: string;
  providerA: string;
  modelA: string;
  providerB: string;
  modelB: string;
  deltas: Record<string, { baseline: MetricValue; candidate: MetricValue; delta: MetricValue }>;
  regressions: DetectedRegression[];
  summary: string;
}

export interface BenchmarkFilterOptions {
  categories?: BenchmarkCategory[];
  tags?: string[];
  difficulties?: BenchmarkDifficulty[];
  ids?: string[];
  maxCases?: number;
}

export interface EvaluationRunnerOptions {
  projectId: string;
  userId: string;
  environment?: string;
  versionCommit?: string;
  provider?: string;
  model?: string;
  timeoutMsPerCase?: number;
  totalTimeoutMs?: number;
  filter?: BenchmarkFilterOptions;
  regressionThresholds?: Partial<RegressionThresholds>;
  baselineRun?: BenchmarkRun;
}
