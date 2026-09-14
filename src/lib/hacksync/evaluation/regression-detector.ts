/**
 * HackSync Phase 5: Regression Detector
 * Compares current benchmark run metrics against an accepted baseline run.
 * Emits actionable regression warnings if key metrics drop beyond configurable thresholds.
 * Avoids false positives from minor floating-point jitter.
 */

import type {
  BenchmarkRun,
  DetectedRegression,
  RegressionThresholds,
  MetricValue,
} from "./types";

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  securityF1DropMaxPct: 5.0, // 5% max relative drop
  retrievalHit5DropMaxPct: 5.0, // 5% max relative drop
  fixVerificationDropMaxPct: 5.0, // 5% max relative drop
  citationValidityDropMaxPct: 5.0, // 5% max relative drop
  overallScoreDropMaxPct: 5.0, // 5% max relative drop
  maxLatencyIncreasePct: 50.0, // 50% max latency increase
};

export interface RegressionComparisonResult {
  hasRegressions: boolean;
  regressions: DetectedRegression[];
  summary: string;
  sampleSize?: number | undefined;
  insufficientSample?: boolean | undefined;
  sampleWarning?: string | undefined;
}

export class RegressionDetector {
  /**
   * Floating-point tolerance to ignore non-substantive numerical noise.
   */
  private static readonly EPSILON = 0.001;

  /**
   * Compares current run against baseline run to detect regressions.
   */
  static detect(
    currentRun: BenchmarkRun,
    baselineRun: BenchmarkRun,
    customThresholds: Partial<RegressionThresholds> = {},
  ): RegressionComparisonResult {
    const thresholds: RegressionThresholds = {
      ...DEFAULT_REGRESSION_THRESHOLDS,
      ...customThresholds,
    };

    const regressions: DetectedRegression[] = [];

    // 0. Sample Size Confidence Evaluation (N < 5 reports insufficient sample)
    const sampleSize = Math.min(
      typeof currentRun.caseCount === "number" ? currentRun.caseCount : (currentRun.results?.length ?? 0),
      typeof baselineRun.caseCount === "number" ? baselineRun.caseCount : (baselineRun.results?.length ?? 0),
    );
    const insufficientSample = sampleSize > 0 && sampleSize < 5;
    const sampleWarning = insufficientSample
      ? `INSUFFICIENT_SAMPLE: Benchmark sample size (N=${sampleSize} < 5) lacks statistical significance.`
      : undefined;

    // 1. Overall Score Regression Check
    if (baselineRun.overallScore > 0) {
      const drop = baselineRun.overallScore - currentRun.overallScore;
      const dropPct = (drop / baselineRun.overallScore) * 100;
      if (dropPct > thresholds.overallScoreDropMaxPct + this.EPSILON) {
        regressions.push({
          metric: "overall_score",
          baselineValue: baselineRun.overallScore,
          currentValue: currentRun.overallScore,
          relativeDropPct: Math.round(dropPct * 10) / 10,
          absoluteDrop: Math.round(drop * 10) / 10,
          threshold: thresholds.overallScoreDropMaxPct,
          severity: dropPct > 15 ? "critical" : "warning",
          message: `Overall quality score dropped by ${dropPct.toFixed(1)}% (from ${baselineRun.overallScore} to ${currentRun.overallScore}), exceeding ${thresholds.overallScoreDropMaxPct}% threshold.`,
        });
      }
    }

    // Helper to compare individual metric
    const checkMetricDrop = (
      metricKey: string,
      thresholdPct: number,
      category?: any,
    ) => {
      const baseVal = baselineRun.metrics[metricKey];
      const curVal = currentRun.metrics[metricKey];

      if (
        typeof baseVal === "number" &&
        typeof curVal === "number" &&
        baseVal > 0
      ) {
        const drop = baseVal - curVal;
        const dropPct = (drop / baseVal) * 100;

        if (dropPct > thresholdPct + this.EPSILON) {
          regressions.push({
            metric: metricKey,
            category,
            baselineValue: baseVal,
            currentValue: curVal,
            relativeDropPct: Math.round(dropPct * 10) / 10,
            absoluteDrop: Math.round(drop * 10) / 10,
            threshold: thresholdPct,
            severity: dropPct > 10 ? "critical" : "warning",
            message: `${metricKey} dropped by ${dropPct.toFixed(1)}% (from ${baseVal.toFixed(3)} to ${curVal.toFixed(3)}), exceeding ${thresholdPct}% threshold.`,
          });
        }
      }
    };

    // 2. Specific Key Metric Checks
    checkMetricDrop("security_accuracy", thresholds.securityF1DropMaxPct, "security");
    checkMetricDrop("retrieval_hit5", thresholds.retrievalHit5DropMaxPct, "retrieval");
    checkMetricDrop("fix_success", thresholds.fixVerificationDropMaxPct, "fix_generation");
    checkMetricDrop("citation_validity", thresholds.citationValidityDropMaxPct, "citation");

    // 3. Latency Surge Check
    if (baselineRun.latencyMs > 0 && currentRun.latencyMs > 0) {
      const latencyIncrease = currentRun.latencyMs - baselineRun.latencyMs;
      const latencyIncreasePct = (latencyIncrease / baselineRun.latencyMs) * 100;

      if (latencyIncreasePct > thresholds.maxLatencyIncreasePct + this.EPSILON) {
        regressions.push({
          metric: "avg_latency",
          baselineValue: baselineRun.latencyMs,
          currentValue: currentRun.latencyMs,
          relativeDropPct: Math.round(latencyIncreasePct * 10) / 10,
          absoluteDrop: latencyIncrease,
          threshold: thresholds.maxLatencyIncreasePct,
          severity: latencyIncreasePct > 100 ? "critical" : "warning",
          message: `Average benchmark latency surged by ${latencyIncreasePct.toFixed(1)}% (from ${baselineRun.latencyMs}ms to ${currentRun.latencyMs}ms), exceeding ${thresholds.maxLatencyIncreasePct}% limit.`,
        });
      }
    }

    const hasRegressions = regressions.length > 0;
    let summary = hasRegressions
      ? `REGRESSION DETECTED: Found ${regressions.length} metric regression(s) relative to baseline run ${baselineRun.runId}.`
      : `NO REGRESSION: Current run ${currentRun.runId} matches or exceeds baseline run ${baselineRun.runId}.`;

    if (insufficientSample) {
      summary = `[INSUFFICIENT_SAMPLE: N=${sampleSize} < 5] ${summary}`;
    }

    return {
      hasRegressions,
      regressions,
      summary,
      sampleSize,
      insufficientSample,
      sampleWarning,
    };
  }
}
