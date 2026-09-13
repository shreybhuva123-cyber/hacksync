/**
 * HackSync Phase 5: Regression Engine, Benchmark Runner & Authorization Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { RegressionDetector } from "@/lib/hacksync/evaluation/regression-detector";
import { BenchmarkRunner } from "@/lib/hacksync/evaluation/benchmark-runner";
import { EvaluationEngine } from "@/lib/hacksync/evaluation/evaluation-engine";
import { SummaryReporter } from "@/lib/hacksync/evaluation/reporters/summary-reporter";
import { ComparisonReporter } from "@/lib/hacksync/evaluation/reporters/comparison-reporter";
import { JsonReporter } from "@/lib/hacksync/evaluation/reporters/json-reporter";
import type { BenchmarkRun } from "@/lib/hacksync/evaluation/types";
import {
  registerTestMembership,
  clearTestMemberships,
} from "@/lib/security/tenant-verifier";

describe("Phase 5: Regression Detection & Evaluation Service", () => {
  const mockBaselineRun: BenchmarkRun = {
    runId: "run_baseline_100",
    projectId: "proj-eval-test",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    versionCommit: "commit-base",
    environment: "test",
    provider: "builtin",
    model: "deterministic",
    configHash: "cfg-hash-base",
    benchmarkVersion: "1.0.0",
    caseCount: 10,
    passedCases: 10,
    failedCases: 0,
    overallScore: 90,
    categoryScores: { security: 95, retrieval: 90, fix_generation: 85 },
    metrics: {
      security_accuracy: 0.95,
      retrieval_hit5: 0.90,
      fix_success: 0.85,
    },
    regressions: [],
    latencyMs: 500,
    errorCount: 0,
    status: "completed",
    results: [],
  };

  describe("RegressionDetector", () => {
    it("should flag regression when security F1 / accuracy drops by > 5%", () => {
      const regressedRun: BenchmarkRun = {
        ...mockBaselineRun,
        runId: "run_candidate_regressed",
        overallScore: 82,
        metrics: {
          security_accuracy: 0.88, // 0.95 -> 0.88 = 7.37% drop (> 5%)
          retrieval_hit5: 0.90,
          fix_success: 0.85,
        },
      };

      const result = RegressionDetector.detect(regressedRun, mockBaselineRun, {
        securityF1DropMaxPct: 5.0,
      });

      expect(result.hasRegressions).toBe(true);
      expect(result.regressions.length).toBeGreaterThan(0);
      expect(result.regressions.some((r) => r.metric === "security_accuracy")).toBe(true);
    });

    it("should not flag regression when changes are within tolerance", () => {
      const stableRun: BenchmarkRun = {
        ...mockBaselineRun,
        runId: "run_candidate_stable",
        overallScore: 90,
        metrics: {
          security_accuracy: 0.94, // 0.95 -> 0.94 = ~1.05% drop (<= 5%)
          retrieval_hit5: 0.90,
          fix_success: 0.85,
        },
      };

      const result = RegressionDetector.detect(stableRun, mockBaselineRun, {
        securityF1DropMaxPct: 5.0,
      });

      expect(result.hasRegressions).toBe(false);
      expect(result.regressions.length).toBe(0);
    });

    it("should flag regression on excessive latency increase", () => {
      const slowRun: BenchmarkRun = {
        ...mockBaselineRun,
        runId: "run_slow",
        latencyMs: 1200, // 500ms -> 1200ms = 140% surge (> 50%)
      };

      const result = RegressionDetector.detect(slowRun, mockBaselineRun, {
        maxLatencyIncreasePct: 50.0,
      });

      expect(result.hasRegressions).toBe(true);
      expect(result.regressions.some((r) => r.metric === "avg_latency")).toBe(true);
    });
  });

  describe("BenchmarkRunner", () => {
    it("should execute filtered benchmark run and compute scores", async () => {
      const run = await BenchmarkRunner.runBenchmark({
        projectId: "proj-eval-test",
        userId: "eval-user",
        filter: { categories: ["security", "secrets"] },
      });

      expect(run.runId).toBeTruthy();
      expect(run.status).toBe("completed");
      expect(run.caseCount).toBeGreaterThan(0);
      expect(run.passedCases).toBe(run.caseCount); // All ground-truth cases pass
      expect(run.overallScore).toBeGreaterThanOrEqual(80);
      expect(run.results.length).toBe(run.caseCount);
    });

    it("should handle simulated unavailable provider gracefully without treating as success", async () => {
      const run = await BenchmarkRunner.runBenchmark({
        projectId: "proj-eval-test",
        userId: "eval-user",
        provider: "mock_unavailable",
      });

      expect(run.status).toBe("unavailable");
      expect(run.passedCases).toBe(0);
      expect(run.errorCount).toBe(1);
    });
  });

  describe("Reporters & Output Generation", () => {
    it("should generate comprehensive markdown summary report", () => {
      const md = SummaryReporter.format(mockBaselineRun);
      expect(md).toContain("# HackSync AI Quality & Benchmarking Report");
      expect(md).toContain("Overall Score: 90 / 100");
      expect(md).toContain("Category Breakdown");
      expect(md).toContain("Key Evaluation Metrics");
    });

    it("should generate structured JSON report", () => {
      const json = JsonReporter.format(mockBaselineRun);
      const parsed = JSON.parse(json);
      expect(parsed.runId).toBe("run_baseline_100");
      expect(parsed.overallScore).toBe(90);
    });

    it("should compare two benchmark runs and format markdown comparison", () => {
      const candidateRun: BenchmarkRun = {
        ...mockBaselineRun,
        runId: "run_cand_200",
        overallScore: 94,
        metrics: {
          security_accuracy: 0.98,
          retrieval_hit5: 0.92,
          fix_success: 0.90,
        },
      };

      const report = ComparisonReporter.compare(mockBaselineRun, candidateRun);
      expect(report.baselineRunId).toBe(mockBaselineRun.runId);
      expect(report.candidateRunId).toBe(candidateRun.runId);
      expect(report.regressions.length).toBe(0);

      const md = ComparisonReporter.formatMarkdown(report);
      expect(md).toContain("Benchmark Comparative Evaluation Report");
      expect(md).toContain("+4.00"); // score delta
    });
  });

  describe("EvaluationEngine Security & Authorization Gate", () => {
    beforeEach(() => {
      clearTestMemberships();
    });

    it("should strictly reject unauthenticated or non-member benchmark execution", async () => {
      // User is not registered for project
      let errorThrown = false;
      try {
        await EvaluationEngine.runBenchmark({
          projectId: "proj-unauthorized",
          userId: "user-attacker",
        });
      } catch (err: any) {
        errorThrown = true;
        expect(err.name).toBe("AuthorizationError");
        expect(err.message).toContain("Access denied");
      }
      expect(errorThrown).toBe(true);
    });

    it("should permit authorized project member to execute benchmark", async () => {
      const projectId = "proj-eval-authed";
      const userId = "user-member-eval";

      registerTestMembership(projectId, userId, "member");

      const run = await EvaluationEngine.runBenchmark({
        projectId,
        userId,
        filter: { categories: ["retrieval"] },
      });

      expect(run.status).toBe("completed");
      expect(run.passedCases).toBeGreaterThan(0);
    });
  });
});
