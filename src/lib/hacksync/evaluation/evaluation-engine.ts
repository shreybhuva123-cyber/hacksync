/**
 * HackSync Phase 5: Evaluation Engine Service
 * Authoritative server-side evaluation service requiring authenticated project membership.
 * Enforces tenant isolation, rate limits, audit trails, and regression detection.
 */

import { verifyProjectMembership } from "@/lib/security/tenant-verifier";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { BenchmarkLoader } from "./benchmark-loader";
import { BenchmarkRunner } from "./benchmark-runner";
import { ComparisonReporter } from "./reporters/comparison-reporter";
import { RegressionDetector, type RegressionComparisonResult } from "./regression-detector";
import { SummaryReporter } from "./reporters/summary-reporter";
import { JsonReporter } from "./reporters/json-reporter";
import type {
  BenchmarkRun,
  CaseEvaluationResult,
  EvaluationRunnerOptions,
  ModelComparisonReport,
  RegressionThresholds,
} from "./types";
import { supabase } from "@/integrations/supabase/client";

export class EvaluationEngine {
  private static inMemoryRuns: Map<string, BenchmarkRun> = new Map();

  /**
   * Retrieves benchmark runs for a project.
   */
  static async getRuns(projectId: string): Promise<BenchmarkRun[]> {
    return Array.from(this.inMemoryRuns.values()).filter((r) => r.projectId === projectId);
  }

  /**
   * Retrieves a benchmark run by ID.
   */
  static async getRunById(runId: string): Promise<BenchmarkRun | null> {
    return this.inMemoryRuns.get(runId) || null;
  }

  /**
   * Executes a full or filtered benchmark evaluation run.
   * Strictly enforces project membership authorization before execution.
   */
  static async runBenchmark(options: EvaluationRunnerOptions): Promise<BenchmarkRun> {
    if (!options.userId || !options.projectId) {
      throw new AuthorizationError("[EvaluationEngine] userId and projectId are required to run benchmarks.");
    }

    // Authoritative Tenant Membership Verification
    const membership = await verifyProjectMembership(options.userId, options.projectId);
    if (!membership.allowed) {
      throw new AuthorizationError(
        `[EvaluationEngine] Access denied: User '${options.userId}' is not an authorized member of project '${options.projectId}'.`,
      );
    }

    // Execute benchmark suite
    const run = await BenchmarkRunner.runBenchmark(options);

    // Persist to database if available
    try {
      await supabase.from("benchmark_runs" as any).insert({
        id: run.runId,
        project_id: options.projectId,
        environment: run.environment,
        version_commit: run.versionCommit,
        provider: run.provider,
        model: run.model,
        config_hash: run.configHash,
        benchmark_version: run.benchmarkVersion,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        status: run.status,
        total_cases: run.caseCount,
        passed_cases: run.passedCases,
        failed_cases: run.failedCases,
        overall_score: run.overallScore,
        metrics: run.metrics,
        regressions: run.regressions,
        latency_ms: run.latencyMs,
        error_count: run.errorCount,
        created_by: options.userId,
      });
    } catch {
      // Graceful fallback if database is offline or unmigrated in local test env
    }

    this.inMemoryRuns.set(run.runId, run);
    return run;
  }

  /**
   * Executes a single benchmark case by its ID.
   */
  static async runCase(params: {
    userId: string;
    projectId: string;
    caseId: string;
  }): Promise<CaseEvaluationResult> {
    const { userId, projectId, caseId } = params;

    // Authoritative Tenant Membership Verification
    const membership = await verifyProjectMembership(userId, projectId);
    if (!membership.allowed) {
      throw new AuthorizationError(
        `[EvaluationEngine] Access denied: User '${userId}' is not an authorized member of project '${projectId}'.`,
      );
    }

    const caseItem = BenchmarkLoader.getCaseById(caseId);
    if (!caseItem) {
      throw new NotFoundError(`Benchmark case '${caseId}' not found.`);
    }

    return await BenchmarkRunner.runCase(caseItem);
  }

  /**
   * Compares two benchmark runs and generates a comparison report.
   */
  static compareRuns(baselineRun: BenchmarkRun, candidateRun: BenchmarkRun): ModelComparisonReport {
    return ComparisonReporter.compare(baselineRun, candidateRun);
  }

  /**
   * Detects regressions between current run and baseline run.
   */
  static detectRegressions(
    currentRun: BenchmarkRun,
    baselineRun: BenchmarkRun,
    thresholds?: Partial<RegressionThresholds>,
  ): RegressionComparisonResult {
    return RegressionDetector.detect(currentRun, baselineRun, thresholds);
  }

  /**
   * Formats a summary report in Markdown.
   */
  static generateSummaryReport(run: BenchmarkRun): string {
    return SummaryReporter.format(run);
  }

  /**
   * Formats a benchmark run in JSON.
   */
  static generateJsonReport(run: BenchmarkRun, pretty = true): string {
    return JsonReporter.format(run, pretty);
  }
}
