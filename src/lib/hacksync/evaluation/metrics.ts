/**
 * HackSync Phase 5: Reusable Metrics Engine
 * Provides mathematically sound calculation of precision, recall, F1, accuracy,
 * ranking metrics (Hit@K, MRR), citation validity, and verification metrics.
 * Honestly handles zero-division with 'not_applicable'.
 */

import type {
  MetricValue,
  ClassificationMetrics,
  CitationMetrics,
} from "./types";

/**
 * Performs safe division to avoid dividing by zero.
 * Returns 'not_applicable' when denominator is 0.
 */
export function safeDivide(numerator: number, denominator: number): MetricValue {
  if (denominator === 0 || isNaN(denominator) || isNaN(numerator)) {
    return "not_applicable";
  }
  return numerator / denominator;
}

/**
 * Calculates Precision = TP / (TP + FP)
 */
export function calculatePrecision(tp: number, fp: number): MetricValue {
  return safeDivide(tp, tp + fp);
}

/**
 * Calculates Recall = TP / (TP + FN)
 */
export function calculateRecall(tp: number, fn: number): MetricValue {
  return safeDivide(tp, tp + fn);
}

/**
 * Calculates F1 Score = 2 * (P * R) / (P + R)
 */
export function calculateF1(precision: MetricValue, recall: MetricValue): MetricValue {
  if (precision === "not_applicable" || recall === "not_applicable") {
    return "not_applicable";
  }
  const sum = precision + recall;
  if (sum === 0) return 0;
  return (2 * precision * recall) / sum;
}

/**
 * Calculates Accuracy = (TP + TN) / (TP + TN + FP + FN)
 */
export function calculateAccuracy(tp: number, tn: number, fp: number, fn: number): MetricValue {
  return safeDivide(tp + tn, tp + tn + fp + fn);
}

/**
 * Calculates False Positive Rate = FP / (FP + TN)
 */
export function calculateFalsePositiveRate(fp: number, tn: number): MetricValue {
  return safeDivide(fp, fp + tn);
}

/**
 * Computes full classification metrics suite.
 */
export function calculateClassificationMetrics(
  tp: number,
  tn: number,
  fp: number,
  fn: number,
): ClassificationMetrics {
  const precision = calculatePrecision(tp, fp);
  const recall = calculateRecall(tp, fn);
  const f1 = calculateF1(precision, recall);
  const accuracy = calculateAccuracy(tp, tn, fp, fn);
  const falsePositiveRate = calculateFalsePositiveRate(fp, tn);

  return {
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    accuracy,
    falsePositiveRate,
  };
}

/**
 * Computes Hit@K for ranked items against a set of relevant items.
 * Returns 1.0 if at least one relevant item appears within the top K results, otherwise 0.0.
 * Returns 'not_applicable' if no relevant items are defined.
 */
export function hitAtK(
  rankedItems: string[],
  relevantItems: string[],
  k: number,
): MetricValue {
  if (!relevantItems || relevantItems.length === 0) {
    return "not_applicable";
  }
  const topK = rankedItems.slice(0, k);
  const targetSet = new Set(relevantItems.map((item) => item.toLowerCase().trim()));
  const hit = topK.some((item) => targetSet.has(item.toLowerCase().trim()));
  return hit ? 1.0 : 0.0;
}

/**
 * Calculates Reciprocal Rank (RR) for a single query.
 * Returns 1 / (rank of first relevant item), or 0.0 if not found in ranked list.
 */
export function reciprocalRank(
  rankedItems: string[],
  relevantItems: string[],
): MetricValue {
  if (!relevantItems || relevantItems.length === 0) {
    return "not_applicable";
  }
  const targetSet = new Set(relevantItems.map((item) => item.toLowerCase().trim()));
  for (let i = 0; i < rankedItems.length; i++) {
    const item = rankedItems[i];
    if (item && targetSet.has(item.toLowerCase().trim())) {
      return 1.0 / (i + 1);
    }
  }
  return 0.0;
}

/**
 * Computes Mean Reciprocal Rank (MRR) across multiple queries.
 */
export function meanReciprocalRank(
  rankedResultsList: string[][],
  relevantItemsList: string[][],
): MetricValue {
  if (rankedResultsList.length === 0 || relevantItemsList.length === 0) {
    return "not_applicable";
  }
  const count = Math.min(rankedResultsList.length, relevantItemsList.length);
  let totalRR = 0;
  let validCount = 0;

  for (let i = 0; i < count; i++) {
    const res = rankedResultsList[i];
    const rel = relevantItemsList[i];
    if (!res || !rel) continue;
    const rr = reciprocalRank(res, rel);
    if (rr !== "not_applicable") {
      totalRR += rr;
      validCount++;
    }
  }

  return safeDivide(totalRR, validCount);
}

/**
 * Evaluates citation validity metrics.
 */
export function calculateCitationMetrics(
  citations: Array<{ valid: boolean; hallucinated?: boolean }>,
  expectedCount: number,
): CitationMetrics {
  const total = citations.length;
  const valid = citations.filter((c) => c.valid).length;
  const invalid = citations.filter((c) => !c.valid).length;
  const hallucinated = citations.filter((c) => c.hallucinated).length;
  const missing = Math.max(0, expectedCount - valid);
  const validityRate = safeDivide(valid, total);

  return {
    totalCitations: total,
    validCitations: valid,
    invalidCitations: invalid,
    missingCitations: missing,
    hallucinatedCitations: hallucinated,
    validityRate,
  };
}

/**
 * Utility to format MetricValue as percentage or fixed float for reports.
 */
export function formatMetric(val: MetricValue, asPercentage = true, decimals = 1): string {
  if (val === "not_applicable") {
    return "N/A";
  }
  if (asPercentage) {
    return `${(val * 100).toFixed(decimals)}%`;
  }
  return val.toFixed(decimals);
}

export interface StatisticalSummary {
  sampleCount: number;
  passCount: number;
  failCount: number;
  mean: number | "not_applicable";
  median: number | "not_applicable";
  min: number | "not_applicable";
  max: number | "not_applicable";
  confidence: "sufficient" | "insufficient_sample";
}

/**
 * Computes mean, median, min, max, and statistical sample confidence.
 * Avoids faking statistical confidence when the dataset is too small (< minSampleSize).
 */
export function calculateStatistics(
  scores: number[],
  minSampleSize = 5,
  passingThreshold = 70,
): StatisticalSummary {
  if (!scores || scores.length === 0) {
    return {
      sampleCount: 0,
      passCount: 0,
      failCount: 0,
      mean: "not_applicable",
      median: "not_applicable",
      min: "not_applicable",
      max: "not_applicable",
      confidence: "insufficient_sample",
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const sampleCount = sorted.length;
  const passCount = sorted.filter((s) => s >= passingThreshold).length;
  const failCount = sampleCount - passCount;

  const sum = sorted.reduce((acc, curr) => acc + curr, 0);
  const mean = Number((sum / sampleCount).toFixed(2));

  let median: number;
  const mid = Math.floor(sampleCount / 2);
  if (sampleCount % 2 === 0) {
    median = Number(((sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(2));
  } else {
    median = sorted[mid]!;
  }

  const min = sorted[0]!;
  const max = sorted[sampleCount - 1]!;
  const confidence = sampleCount >= minSampleSize ? "sufficient" : "insufficient_sample";

  return {
    sampleCount,
    passCount,
    failCount,
    mean,
    median,
    min,
    max,
    confidence,
  };
}

/**
 * Computes p50, p90, p95, and p99 percentiles from a series of numeric values.
 */
export function calculatePercentiles(values: number[]): {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
} {
  if (!values || values.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const getP = (p: number): number => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] || 0;
  };

  return {
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
  };
}
