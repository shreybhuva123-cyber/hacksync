/**
 * HackSync Phase 6: Benchmark Contracts & Expanded Categories
 * Defines formal types for benchmark cases, ground truth integration,
 * evaluation methods, and 10 intelligence categories.
 */

import type { GroundTruth, ExpectedFinding, ExpectedCitation, ExpectedFixProperties } from "./ground-truth";
import type { FindingSeverity } from "../security/finding-types";

export type BenchmarkCategory =
  | "project_intelligence"
  | "retrieval"
  | "debugging"
  | "security"
  | "git_intelligence"
  | "testing"
  | "fixing"
  | "verification"
  | "ai_quality"
  | "performance"
  // Backward-compatible Phase 5 category aliases
  | "secrets"
  | "git_impact"
  | "citation"
  | "hallucination_resistance"
  | "code_understanding"
  | "dependency_security"
  | "test_generation"
  | "fix_generation"
  | "architecture";

export type EvaluationMethod =
  | "deterministic"
  | "heuristic"
  | "model"
  | "human"
  // Uppercase aliases for Phase 5 compatibility
  | "DETERMINISTIC"
  | "HEURISTIC"
  | "MODEL_BASED"
  | "MANUAL_REVIEW";

export type BenchmarkDifficulty = "easy" | "medium" | "hard";

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

export interface BenchmarkCase {
  id: string;
  version: string;
  category: BenchmarkCategory;
  name?: string;
  description?: string;
  difficulty: BenchmarkDifficulty;
  fixturePath?: string;
  projectFixture?: BenchmarkProjectFixture;
  task: BenchmarkTask;
  groundTruth: GroundTruth;
  expectedCapabilities: string[];
  tags: string[];

  // Backward-compatible aliases mirroring groundTruth fields
  query?: string;
  expectedOutcome?: string;
  expectedFiles?: string[];
  expectedSymbols?: string[];
  expectedFindings?: ExpectedFinding[];
  expectedTests?: string[];
  expectedFixBehavior?: ExpectedFixProperties;
  expectedCitations?: ExpectedCitation[];
  expectedSeverity?: FindingSeverity;
  expectedSecurityCategories?: string[];
  expectedIntent?: string;
  expectedTools?: string[];
  expectedKeywords?: string[];
  groundTruthTargetFile?: string;
}

export interface BenchmarkFilterOptions {
  categories?: BenchmarkCategory[];
  difficulties?: BenchmarkDifficulty[];
  tags?: string[];
  ids?: string[];
  versions?: string[];
  maxCases?: number;
}
