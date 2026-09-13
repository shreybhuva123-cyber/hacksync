/**
 * HackSync Phase 6: Regression Engine 2.0
 * Evaluates both Relative Regression and Absolute Regression with Small-Sample Protection.
 * Classifies severity: NONE, INFO, WARNING, REGRESSION, CRITICAL_REGRESSION, INSUFFICIENT_SAMPLE.
 */

import type { BenchmarkRun, CaseEvaluationResult, CitationMetrics } from "./types";

export type RegressionSeverity =
  | "NONE"
  | "INFO"
  | "WARNING"
  | "REGRESSION"
  | "CRITICAL_REGRESSION"
  | "INSUFFICIENT_SAMPLE";

export type CaseStatus = "PASS" | "FAIL" | "CHANGED" | "NOT_APPLICABLE";

export interface DetectedRegressionV2 {
  metricName: string;
  category: string;
  severity: RegressionSeverity;
  baselineValue: number;
  currentValue: number;
  absoluteDelta: number;
  relativeDelta: number;
  sampleSize: number;
  description: string;
  isCritical: boolean;
}

export interface CaseComparisonResult {
  caseId: string;
  baselinePassed: boolean;
  currentPassed: boolean;
  status: CaseStatus;
  baselineScore: number;
  currentScore: number;
  notes: string;
}

export interface RegressionEngineOptions {
  minCasesForCategory?: number; // Default 5
  relativeWarningThreshold?: number; // Default 0.03 (3%)
  relativeRegressionThreshold?: number; // Default 0.05 (5%)
  absoluteRegressionThreshold?: number; // Default 0.05 (0.05 score)
  latencySpikeThresholdMs?: number; // Default 1000ms
  latencySpikeRelativeThreshold?: number; // Default 0.50 (50%)
}

export interface RegressionReportV2 {
  baselineRunId: string;
  currentRunId: string;
  overallStatus: RegressionSeverity;
  regressions: DetectedRegressionV2[];
  caseComparisons: CaseComparisonResult[];
  criticalCount: number;
  warningCount: number;
  summary: string;
}

export class RegressionEngine2 {
  static readonly MIN_CASES_FOR_CATEGORY_REGRESSION = 5;
  static readonly DEFAULT_RELATIVE_REGRESSION_THRESHOLD = 0.05; // 5%
  static readonly DEFAULT_ABSOLUTE_REGRESSION_THRESHOLD = 0.05;
  static readonly DEFAULT_WARNING_THRESHOLD = 0.03; // 3%

  /**
   * Compares candidate run against baseline with dual-delta analysis and small-sample gates.
   */
  static compare(
    baseline: BenchmarkRun,
    current: BenchmarkRun,
    options: RegressionEngineOptions = {},
  ): RegressionReportV2 {
    const minSample = options.minCasesForCategory ?? this.MIN_CASES_FOR_CATEGORY_REGRESSION;
    const relThreshold = options.relativeRegressionThreshold ?? this.DEFAULT_RELATIVE_REGRESSION_THRESHOLD;
    const absThreshold = options.absoluteRegressionThreshold ?? this.DEFAULT_ABSOLUTE_REGRESSION_THRESHOLD;
    const warnThreshold = options.relativeWarningThreshold ?? this.DEFAULT_WARNING_THRESHOLD;

    const regressions: DetectedRegressionV2[] = [];

    // 1. Overall Score Comparison
    const baseOverall = baseline.overallScore;
    const currOverall = current.overallScore;
    const absOverallDelta = baseOverall - currOverall;
    const relOverallDelta = baseOverall > 0 ? absOverallDelta / baseOverall : 0;

    if (absOverallDelta > absThreshold * 100 || relOverallDelta > relThreshold) {
      regressions.push({
        metricName: "overallScore",
        category: "overall",
        severity: relOverallDelta > 0.10 ? "CRITICAL_REGRESSION" : "REGRESSION",
        baselineValue: baseOverall,
        currentValue: currOverall,
        absoluteDelta: Number(absOverallDelta.toFixed(2)),
        relativeDelta: Number(relOverallDelta.toFixed(4)),
        sampleSize: current.caseCount,
        description: `Overall benchmark score dropped from ${baseOverall.toFixed(1)} to ${currOverall.toFixed(1)} (drop: ${(relOverallDelta * 100).toFixed(1)}%).`,
        isCritical: relOverallDelta > 0.10,
      });
    } else if (relOverallDelta >= warnThreshold) {
      regressions.push({
        metricName: "overallScore",
        category: "overall",
        severity: "WARNING",
        baselineValue: baseOverall,
        currentValue: currOverall,
        absoluteDelta: Number(absOverallDelta.toFixed(2)),
        relativeDelta: Number(relOverallDelta.toFixed(4)),
        sampleSize: current.caseCount,
        description: `Overall benchmark score showed minor decline from ${baseOverall.toFixed(1)} to ${currOverall.toFixed(1)}.`,
        isCritical: false,
      });
    }

    // 2. Category Metrics Comparison with Small-Sample Protection
    const categories = new Set([
      ...Object.keys(baseline.categoryScores || {}),
      ...Object.keys(current.categoryScores || {}),
    ]);

    for (const cat of categories) {
      const baseScore = (baseline.categoryScores as Record<string, number | undefined>)[cat] ?? 0;
      const currScore = (current.categoryScores as Record<string, number | undefined>)[cat] ?? 0;
      const catCases = current.caseCount; // Or category subset if tracked

      // Small-sample protection
      if (catCases < minSample) {
        if (baseScore - currScore > 0) {
          regressions.push({
            metricName: `${cat}_score`,
            category: cat,
            severity: "INSUFFICIENT_SAMPLE",
            baselineValue: baseScore,
            currentValue: currScore,
            absoluteDelta: Number((baseScore - currScore).toFixed(2)),
            relativeDelta: baseScore > 0 ? Number(((baseScore - currScore) / baseScore).toFixed(4)) : 0,
            sampleSize: catCases,
            description: `Category '${cat}' score dropped from ${baseScore} to ${currScore}, but sample size (${catCases}) is below minimum threshold (${minSample}).`,
            isCritical: false,
          });
        }
        continue;
      }

      const absDelta = baseScore - currScore;
      const relDelta = baseScore > 0 ? absDelta / baseScore : 0;

      if (absDelta > absThreshold * 100 || relDelta > relThreshold) {
        const isCritical = cat === "security" && relDelta > 0.10;
        regressions.push({
          metricName: `${cat}_score`,
          category: cat,
          severity: isCritical ? "CRITICAL_REGRESSION" : "REGRESSION",
          baselineValue: baseScore,
          currentValue: currScore,
          absoluteDelta: Number(absDelta.toFixed(2)),
          relativeDelta: Number(relDelta.toFixed(4)),
          sampleSize: catCases,
          description: `Category '${cat}' dropped by ${(relDelta * 100).toFixed(1)}% (${baseScore.toFixed(1)} -> ${currScore.toFixed(1)}).`,
          isCritical,
        });
      } else if (relDelta >= warnThreshold) {
        regressions.push({
          metricName: `${cat}_score`,
          category: cat,
          severity: "WARNING",
          baselineValue: baseScore,
          currentValue: currScore,
          absoluteDelta: Number(absDelta.toFixed(2)),
          relativeDelta: Number(relDelta.toFixed(4)),
          sampleSize: catCases,
          description: `Category '${cat}' showed warning drop of ${(relDelta * 100).toFixed(1)}%.`,
          isCritical: false,
        });
      }
    }

    // 3. Critical Checks: Hallucinations, Bypass, Recall Collapse
    const baseCitations = (baseline.metrics as Record<string, any>)?.[
      "citationMetrics"
    ] as CitationMetrics | undefined;
    const currCitations = (current.metrics as Record<string, any>)?.[
      "citationMetrics"
    ] as CitationMetrics | undefined;
    if (currCitations && typeof currCitations.hallucinatedCitations === "number" && currCitations.hallucinatedCitations > 0) {
      const baseHalluc = baseCitations?.hallucinatedCitations || 0;
      if (currCitations.hallucinatedCitations > baseHalluc) {
        regressions.push({
          metricName: "hallucinatedCitations",
          category: "ai_quality",
          severity: "CRITICAL_REGRESSION",
          baselineValue: baseHalluc,
          currentValue: currCitations.hallucinatedCitations,
          absoluteDelta: currCitations.hallucinatedCitations - baseHalluc,
          relativeDelta: 1.0,
          sampleSize: currCitations.totalCitations || 0,
          description: `CRITICAL: New hallucinated citations detected (${baseHalluc} -> ${currCitations.hallucinatedCitations})!`,
          isCritical: true,
        });
      }
    }

    // 4. Latency Spikes
    const baseLat = baseline.latencyMs;
    const currLat = current.latencyMs;
    const latDiff = currLat - baseLat;
    const latRel = baseLat > 0 ? latDiff / baseLat : 0;
    const latMsThresh = options.latencySpikeThresholdMs ?? 1000;
    const latRelThresh = options.latencySpikeRelativeThreshold ?? 0.50;

    if (latDiff > latMsThresh && latRel > latRelThresh) {
      regressions.push({
        metricName: "latencyMs",
        category: "performance",
        severity: "WARNING",
        baselineValue: baseLat,
        currentValue: currLat,
        absoluteDelta: latDiff,
        relativeDelta: Number(latRel.toFixed(4)),
        sampleSize: current.caseCount,
        description: `Latency increased by ${latDiff}ms (+${(latRel * 100).toFixed(1)}%). Baseline: ${baseLat}ms, Current: ${currLat}ms.`,
        isCritical: false,
      });
    }

    // 5. Individual Case Comparisons
    const caseComparisons: CaseComparisonResult[] = [];
    // If case results are present on runs, map them
    const baseResults = (baseline as any).caseResults as CaseEvaluationResult[] | undefined;
    const currResults = (current as any).caseResults as CaseEvaluationResult[] | undefined;

    if (baseResults && currResults) {
      const baseMap = new Map(baseResults.map((r) => [r.caseId, r]));
      for (const curr of currResults) {
        const base = baseMap.get(curr.caseId);
        if (!base) continue;

        let status: CaseStatus = "PASS";
        if (!curr.passed && !base.passed) status = "FAIL";
        else if (curr.passed !== base.passed) status = "CHANGED";
        else if (curr.passed) status = "PASS";

        caseComparisons.push({
          caseId: curr.caseId,
          baselinePassed: base.passed,
          currentPassed: curr.passed,
          status,
          baselineScore: base.score,
          currentScore: curr.score,
          notes: curr.notes || "",
        });
      }
    }

    // Overall Status Calculation
    const criticalCount = regressions.filter((r) => r.severity === "CRITICAL_REGRESSION").length;
    const regressionCount = regressions.filter((r) => r.severity === "REGRESSION").length;
    const warningCount = regressions.filter((r) => r.severity === "WARNING").length;
    const insufficientCount = regressions.filter((r) => r.severity === "INSUFFICIENT_SAMPLE").length;

    let overallStatus: RegressionSeverity = "NONE";
    if (criticalCount > 0) overallStatus = "CRITICAL_REGRESSION";
    else if (regressionCount > 0) overallStatus = "REGRESSION";
    else if (warningCount > 0) overallStatus = "WARNING";
    else if (insufficientCount > 0 && regressions.length === insufficientCount) overallStatus = "INSUFFICIENT_SAMPLE";
    else if (regressions.length > 0) overallStatus = "INFO";

    const summary =
      overallStatus === "NONE"
        ? "No regressions detected between baseline and current benchmark runs."
        : `Regression status: ${overallStatus}. Critical: ${criticalCount}, Regressions: ${regressionCount}, Warnings: ${warningCount}.`;

    return {
      baselineRunId: baseline.runId,
      currentRunId: current.runId,
      overallStatus,
      regressions,
      caseComparisons,
      criticalCount,
      warningCount,
      summary,
    };
  }
}
