/**
 * HackSync Phase 5: Benchmark Runner Engine
 * Executes benchmark evaluation runs with per-case timeouts, total timeouts,
 * category dispatching, regression detection, and observability logging.
 */

import { BenchmarkLoader } from "./benchmark-loader";
import { ScoringEngine } from "./scoring-engine";
import { RegressionDetector } from "./regression-detector";
import { SecurityEvaluator } from "./evaluators/security-evaluator";
import { RetrievalEvaluator } from "./evaluators/retrieval-evaluator";
import { CitationEvaluator } from "./evaluators/citation-evaluator";
import { AnswerEvaluator } from "./evaluators/answer-evaluator";
import { FixEvaluator } from "./evaluators/fix-evaluator";
import { TestingEvaluator } from "./evaluators/testing-evaluator";
import { GitEvaluator } from "./evaluators/git-evaluator";
import { VerificationEvaluator } from "./evaluators/verification-evaluator";
import type {
  BenchmarkCase,
  BenchmarkRun,
  CaseEvaluationResult,
  EvaluationRunnerOptions,
} from "./types";
import { metrics } from "@/lib/observability/metrics";

export class BenchmarkRunner {
  private static readonly DEFAULT_CASE_TIMEOUT_MS = 15000;
  private static readonly DEFAULT_TOTAL_TIMEOUT_MS = 120000;

  /**
   * Dispatches a single benchmark case to its domain evaluator.
   */
  static async runCase(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    switch (caseItem.category) {
      case "security":
      case "secrets":
      case "dependency_security":
        return await SecurityEvaluator.evaluate(caseItem);

      case "retrieval":
        return await RetrievalEvaluator.evaluate(caseItem);

      case "citation":
        return await CitationEvaluator.evaluate(caseItem);

      case "fix_generation":
        return await FixEvaluator.evaluate(caseItem);

      case "testing":
      case "test_generation":
        return await TestingEvaluator.evaluate(caseItem);

      case "git_impact":
        return await GitEvaluator.evaluate(caseItem);

      case "verification":
        return await VerificationEvaluator.evaluate(caseItem);

      case "code_understanding":
      case "debugging":
      case "architecture":
      case "hallucination_resistance":
      default:
        return await AnswerEvaluator.evaluate(caseItem);
    }
  }

  /**
   * Executes a benchmark evaluation suite according to provided options.
   */
  static async runBenchmark(options: EvaluationRunnerOptions): Promise<BenchmarkRun> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const runId = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const provider = options.provider || "builtin";
    const model = options.model || "deterministic";

    // Check for simulated unavailable provider
    if (provider === "mock_unavailable") {
      return {
        runId,
        projectId: options.projectId,
        startedAt,
        completedAt: new Date().toISOString(),
        versionCommit: options.versionCommit || "dev",
        environment: options.environment || "test",
        provider,
        model,
        configHash: "unavailable_hash",
        benchmarkVersion: "1.0.0",
        caseCount: 0,
        passedCases: 0,
        failedCases: 0,
        overallScore: 0,
        categoryScores: {},
        metrics: {},
        regressions: [],
        latencyMs: 0,
        errorCount: 1,
        status: "unavailable",
        results: [],
      };
    }

    // Load and filter benchmark cases
    const cases = BenchmarkLoader.filterCases(options.filter);
    const caseTimeoutMs = options.timeoutMsPerCase || this.DEFAULT_CASE_TIMEOUT_MS;
    const results: CaseEvaluationResult[] = [];
    let errorCount = 0;

    for (const caseItem of cases) {
      const caseStart = Date.now();

      // Per-case timeout promise
      const timeoutPromise = new Promise<CaseEvaluationResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Benchmark case timeout exceeded (${caseTimeoutMs}ms).`));
        }, caseTimeoutMs);
      });

      try {
        const result = await Promise.race([
          this.runCase(caseItem),
          timeoutPromise,
        ]);
        results.push(result);
        metrics.recordLatency("benchmark.case_duration", result.latencyMs);
      } catch (err: any) {
        errorCount++;
        const latencyMs = Date.now() - caseStart;
        const isTimeout = err?.message?.includes("timeout");

        results.push({
          caseId: caseItem.id,
          name: caseItem.name,
          category: caseItem.category,
          evaluationMethod: "DETERMINISTIC",
          passed: false,
          score: 0,
          latencyMs,
          metrics: {},
          notes: `Execution failed: ${err?.message || String(err)}`,
          error: isTimeout ? "TIMEOUT_EXCEEDED" : "EXECUTION_ERROR",
        });
      }
    }

    const totalLatencyMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    // Compute aggregate scores and metrics
    const scores = ScoringEngine.computeBenchmarkScores(results);

    // Build the initial BenchmarkRun object
    let benchmarkRun: BenchmarkRun = {
      runId,
      projectId: options.projectId,
      startedAt,
      completedAt,
      versionCommit: options.versionCommit || "dev",
      environment: options.environment || "test",
      provider,
      model,
      configHash: `cfg_${Date.now()}`,
      benchmarkVersion: "1.0.0",
      caseCount: cases.length,
      passedCases: scores.passedCases,
      failedCases: scores.failedCases,
      overallScore: scores.overallScore,
      categoryScores: scores.categoryScores,
      metrics: scores.metrics,
      regressions: [],
      latencyMs: totalLatencyMs,
      errorCount,
      status: "completed",
      results,
    };

    // If a baseline run is provided, detect regressions
    if (options.baselineRun) {
      const regReport = RegressionDetector.detect(
        benchmarkRun,
        options.baselineRun,
        options.regressionThresholds,
      );
      benchmarkRun.regressions = regReport.regressions;
    }

    return benchmarkRun;
  }
}
