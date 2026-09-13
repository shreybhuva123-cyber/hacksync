/**
 * HackSync Phase 5: Scoring Engine
 * Aggregates individual benchmark case results across categories, calculates
 * weighted overall scores, and maintains backward compatibility with legacy scorers.
 */

import type {
  CaseEvaluationResult,
  BenchmarkCategory,
  MetricValue,
} from "./types";
import { safeDivide } from "./metrics";

export interface CategoryScoreSummary {
  category: BenchmarkCategory;
  caseCount: number;
  passedCases: number;
  score: number; // 0..100
  avgLatencyMs: number;
}

export interface OverallBenchmarkScores {
  overallScore: number; // 0..100
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgLatencyMs: number;
  categoryScores: Partial<Record<BenchmarkCategory, number>>;
  metrics: Record<string, MetricValue>;
}

// Category weights for overall quality score calculation
const CATEGORY_WEIGHTS: Partial<Record<BenchmarkCategory, number>> = {
  security: 0.25,
  retrieval: 0.20,
  fix_generation: 0.15,
  verification: 0.15,
  testing: 0.10,
  citation: 0.10,
  code_understanding: 0.05,
};

export class ScoringEngine {
  /**
   * Computes comprehensive benchmark metrics and category scores.
   */
  static computeBenchmarkScores(caseResults: CaseEvaluationResult[]): OverallBenchmarkScores {
    if (caseResults.length === 0) {
      return {
        overallScore: 0,
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        avgLatencyMs: 0,
        categoryScores: {},
        metrics: {},
      };
    }

    const totalCases = caseResults.length;
    const passedCases = caseResults.filter((c) => c.passed).length;
    const failedCases = totalCases - passedCases;
    const totalLatency = caseResults.reduce((acc, c) => acc + (c.latencyMs || 0), 0);
    const avgLatencyMs = Math.round(totalLatency / totalCases);

    // Group results by category
    const byCategory = new Map<BenchmarkCategory, CaseEvaluationResult[]>();
    for (const res of caseResults) {
      const list = byCategory.get(res.category) || [];
      list.push(res);
      byCategory.set(res.category, list);
    }

    const categoryScores: Partial<Record<BenchmarkCategory, number>> = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [cat, items] of byCategory.entries()) {
      const catPassed = items.filter((i) => i.passed).length;
      const catAvgScore = items.reduce((acc, i) => acc + (i.score || 0), 0) / items.length;
      const catScore = Math.round(catAvgScore);
      categoryScores[cat] = catScore;

      const weight = CATEGORY_WEIGHTS[cat] ?? 0.05;
      weightedSum += catScore * weight;
      totalWeight += weight;
    }

    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Aggregate key metrics across case results
    const metrics: Record<string, MetricValue> = {};
    metrics["passedRatio"] = safeDivide(passedCases, totalCases);

    // Security Metrics
    const secCases = byCategory.get("security") || [];
    if (secCases.length > 0) {
      const secPassed = secCases.filter((c) => c.passed).length;
      metrics["security_accuracy"] = safeDivide(secPassed, secCases.length);
    }

    // Retrieval Metrics
    const retCases = byCategory.get("retrieval") || [];
    if (retCases.length > 0) {
      const retPassed = retCases.filter((c) => c.passed).length;
      metrics["retrieval_hit5"] = safeDivide(retPassed, retCases.length);
    }

    // Fix Metrics
    const fixCases = byCategory.get("fix_generation") || [];
    if (fixCases.length > 0) {
      const fixPassed = fixCases.filter((c) => c.passed).length;
      metrics["fix_success"] = safeDivide(fixPassed, fixCases.length);
    }

    return {
      overallScore,
      totalCases,
      passedCases,
      failedCases,
      avgLatencyMs,
      categoryScores,
      metrics,
    };
  }
}

/**
 * Backward-compatible legacy EvaluationScorer for existing Phase 0 tests.
 */
export { EvaluationScorer, type EvaluationMetrics } from "./scoring";
