import { describe, expect, it } from "bun:test";
import {
  RegressionEngine2,
  type DetectedRegressionV2,
  type RegressionReportV2,
} from "@/lib/hacksync/evaluation/regression-engine";
import type { BenchmarkRun, CaseEvaluationResult } from "@/lib/hacksync/evaluation/types";

function createMockRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    runId: "run-" + Math.random().toString(36).slice(2, 7),
    projectId: "proj-test",
    startedAt: new Date(Date.now() - 5000).toISOString(),
    completedAt: new Date().toISOString(),
    versionCommit: "commit-abc",
    environment: "test",
    provider: "builtin",
    model: "test-model",
    configHash: "hash-001",
    benchmarkVersion: "2.0.0",
    caseCount: 20,
    passedCases: 19,
    failedCases: 1,
    overallScore: 95.0,
    categoryScores: {
      security: 95.0,
      retrieval: 90.0,
      fixing: 92.0,
      ai_quality: 98.0,
    },
    metrics: {
      citationMetrics: {
        totalCitations: 50,
        validCitations: 50,
        invalidCitations: 0,
        missingCitations: 0,
        hallucinatedCitations: 0,
        validityRate: 1.0,
      },
    },
    regressions: [],
    latencyMs: 1200,
    errorCount: 0,
    status: "completed",
    results: [],
    ...overrides,
  };
}

describe("Phase 6: Regression Engine 2.0 (Dual-Delta & Small-Sample Protection)", () => {
  it("should report NONE when candidate matches or outperforms baseline", () => {
    const baseline = createMockRun({ overallScore: 90.0 });
    const candidate = createMockRun({ overallScore: 94.0 });

    const report = RegressionEngine2.compare(baseline, candidate);
    expect(report.overallStatus).toBe("NONE");
    expect(report.criticalCount).toBe(0);
    expect(report.regressions.length).toBe(0);
  });

  it("should calculate dual-delta (relative + absolute) for score drops", () => {
    const baseline = createMockRun({
      overallScore: 100.0,
      categoryScores: { security: 100.0 },
      caseCount: 20,
    });
    const candidate = createMockRun({
      overallScore: 93.0,
      categoryScores: { security: 93.0 },
      caseCount: 20,
    });

    const report = RegressionEngine2.compare(baseline, candidate);
    expect(report.overallStatus).toBe("REGRESSION");

    const overallReg = report.regressions.find((r) => r.metricName === "overallScore");
    expect(overallReg).toBeDefined();
    expect(overallReg?.absoluteDelta).toBe(7.0);
    expect(overallReg?.relativeDelta).toBe(0.07);
    expect(overallReg?.severity).toBe("REGRESSION");
  });

  it("should enforce small-sample protection (N < 5) and assign INSUFFICIENT_SAMPLE", () => {
    const baseline = createMockRun({
      overallScore: 90.0,
      categoryScores: { security: 90.0 },
      caseCount: 3, // Less than 5 cases
    });
    const candidate = createMockRun({
      overallScore: 70.0,
      categoryScores: { security: 70.0 },
      caseCount: 3,
    });

    const report = RegressionEngine2.compare(baseline, candidate, {
      minCasesForCategory: 5,
    });

    // Score dropped, but sample size is 3 (< 5)
    const catReg = report.regressions.find((r) => r.metricName === "security_score");
    expect(catReg).toBeDefined();
    expect(catReg?.severity).toBe("INSUFFICIENT_SAMPLE");
    expect(catReg?.sampleSize).toBe(3);
    expect(catReg?.isCritical).toBe(false);
  });

  it("should trigger CRITICAL_REGRESSION on hallucinated citations", () => {
    const baseline = createMockRun({
      metrics: {
        citationMetrics: {
          totalCitations: 40,
          validCitations: 40,
          invalidCitations: 0,
          missingCitations: 0,
          hallucinatedCitations: 0,
          validityRate: 1.0,
        },
      },
    });

    const candidate = createMockRun({
      metrics: {
        citationMetrics: {
          totalCitations: 40,
          validCitations: 38,
          invalidCitations: 2,
          missingCitations: 0,
          hallucinatedCitations: 2, // New hallucinations!
          validityRate: 0.95,
        },
      },
    });

    const report = RegressionEngine2.compare(baseline, candidate);
    expect(report.overallStatus).toBe("CRITICAL_REGRESSION");
    expect(report.criticalCount).toBeGreaterThanOrEqual(1);

    const hallucReg = report.regressions.find((r) => r.metricName === "hallucinatedCitations");
    expect(hallucReg).toBeDefined();
    expect(hallucReg?.severity).toBe("CRITICAL_REGRESSION");
    expect(hallucReg?.isCritical).toBe(true);
    expect(hallucReg?.currentValue).toBe(2);
  });

  it("should trigger CRITICAL_REGRESSION on severe security score drop (> 10%)", () => {
    const baseline = createMockRun({
      overallScore: 95.0,
      categoryScores: { security: 95.0 },
      caseCount: 20,
    });
    const candidate = createMockRun({
      overallScore: 80.0,
      categoryScores: { security: 80.0 }, // Drop > 10%
      caseCount: 20,
    });

    const report = RegressionEngine2.compare(baseline, candidate);
    expect(report.overallStatus).toBe("CRITICAL_REGRESSION");

    const secReg = report.regressions.find((r) => r.category === "security");
    expect(secReg).toBeDefined();
    expect(secReg?.severity).toBe("CRITICAL_REGRESSION");
    expect(secReg?.isCritical).toBe(true);
  });

  it("should flag WARNING on excessive latency spike", () => {
    const baseline = createMockRun({ latencyMs: 1000 });
    const candidate = createMockRun({ latencyMs: 2500 }); // +1500ms (> 1000ms threshold) and +150% (> 50%)

    const report = RegressionEngine2.compare(baseline, candidate, {
      latencySpikeThresholdMs: 1000,
      latencySpikeRelativeThreshold: 0.50,
    });

    const latReg = report.regressions.find((r) => r.metricName === "latencyMs");
    expect(latReg).toBeDefined();
    expect(latReg?.severity).toBe("WARNING");
    expect(latReg?.absoluteDelta).toBe(1500);
  });

  it("should map individual case comparisons (PASS, FAIL, CHANGED)", () => {
    const baseCases: CaseEvaluationResult[] = [
      { caseId: "c1", category: "security", passed: true, score: 100, latencyMs: 100 },
      { caseId: "c2", category: "retrieval", passed: true, score: 90, latencyMs: 120 },
      { caseId: "c3", category: "fixing", passed: false, score: 40, latencyMs: 200 },
    ];

    const currCases: CaseEvaluationResult[] = [
      { caseId: "c1", category: "security", passed: true, score: 100, latencyMs: 110 },
      { caseId: "c2", category: "retrieval", passed: false, score: 30, latencyMs: 130 }, // CHANGED
      { caseId: "c3", category: "fixing", passed: false, score: 40, latencyMs: 210 }, // FAIL
    ];

    const baseline = createMockRun({
      ...({ caseResults: baseCases } as any),
    });
    const candidate = createMockRun({
      ...({ caseResults: currCases } as any),
    });

    const report = RegressionEngine2.compare(baseline, candidate);
    expect(report.caseComparisons.length).toBe(3);

    const c1 = report.caseComparisons.find((c) => c.caseId === "c1");
    const c2 = report.caseComparisons.find((c) => c.caseId === "c2");
    const c3 = report.caseComparisons.find((c) => c.caseId === "c3");

    expect(c1?.status).toBe("PASS");
    expect(c2?.status).toBe("CHANGED");
    expect(c3?.status).toBe("FAIL");
  });
});
