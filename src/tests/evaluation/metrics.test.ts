/**
 * HackSync Phase 5: Metric Calculations & Benchmark Validation Tests
 */

import { describe, it, expect } from "bun:test";
import {
  safeDivide,
  calculatePrecision,
  calculateRecall,
  calculateF1,
  calculateAccuracy,
  calculateFalsePositiveRate,
  calculateClassificationMetrics,
  hitAtK,
  reciprocalRank,
  meanReciprocalRank,
  calculateCitationMetrics,
  formatMetric,
} from "@/lib/hacksync/evaluation/metrics";
import { BenchmarkLoader } from "@/lib/hacksync/evaluation/benchmark-loader";
import { BENCHMARK_CASES } from "@/lib/hacksync/evaluation/benchmark-dataset";

describe("Phase 5: Metrics Engine Mathematical Correctness", () => {
  describe("Classification Metrics", () => {
    it("should calculate precision, recall, F1, accuracy accurately", () => {
      // 8 TP, 2 FP, 1 FN, 9 TN
      const metrics = calculateClassificationMetrics(8, 9, 2, 1);

      expect(metrics.truePositives).toBe(8);
      expect(metrics.falsePositives).toBe(2);
      expect(metrics.falseNegatives).toBe(1);
      expect(metrics.trueNegatives).toBe(9);

      // Precision = 8 / (8 + 2) = 0.8
      expect(metrics.precision).toBe(0.8);

      // Recall = 8 / (8 + 1) = 8/9 ≈ 0.8889
      expect(metrics.recall).toBeCloseTo(8 / 9, 4);

      // F1 = 2 * (0.8 * 8/9) / (0.8 + 8/9) ≈ 0.8421
      expect(metrics.f1).toBeCloseTo(0.8421, 4);

      // Accuracy = (8 + 9) / 20 = 17 / 20 = 0.85
      expect(metrics.accuracy).toBe(0.85);

      // FPR = 2 / (2 + 9) = 2/11 ≈ 0.1818
      expect(metrics.falsePositiveRate).toBeCloseTo(2 / 11, 4);
    });

    it("should safely return 'not_applicable' for zero denominators", () => {
      // Precision when TP + FP == 0
      expect(calculatePrecision(0, 0)).toBe("not_applicable");

      // Recall when TP + FN == 0
      expect(calculateRecall(0, 0)).toBe("not_applicable");

      // F1 when inputs are not_applicable
      expect(calculateF1("not_applicable", 0.5)).toBe("not_applicable");

      // Accuracy when total cases is 0
      expect(calculateAccuracy(0, 0, 0, 0)).toBe("not_applicable");

      // FPR when FP + TN == 0
      expect(calculateFalsePositiveRate(0, 0)).toBe("not_applicable");
    });

    it("should return 0 for F1 when precision and recall are 0", () => {
      expect(calculateF1(0, 0)).toBe(0);
    });
  });

  describe("Ranking & Retrieval Metrics (Hit@K, MRR)", () => {
    it("should calculate Hit@1, Hit@3, Hit@5 correctly", () => {
      const ranked = ["fileA.ts", "fileB.ts", "fileC.ts", "fileD.ts", "fileE.ts", "fileF.ts"];
      const relevantTarget = ["fileC.ts"];

      expect(hitAtK(ranked, relevantTarget, 1)).toBe(0.0);
      expect(hitAtK(ranked, relevantTarget, 2)).toBe(0.0);
      expect(hitAtK(ranked, relevantTarget, 3)).toBe(1.0);
      expect(hitAtK(ranked, relevantTarget, 5)).toBe(1.0);
    });

    it("should return 'not_applicable' for Hit@K when no relevant targets are defined", () => {
      expect(hitAtK(["fileA.ts"], [], 3)).toBe("not_applicable");
    });

    it("should calculate reciprocal rank and MRR across queries", () => {
      const q1Ranked = ["fileA.ts", "fileB.ts", "fileC.ts"];
      const q1Target = ["fileA.ts"]; // rank 1 -> RR = 1.0

      const q2Ranked = ["fileA.ts", "fileB.ts", "fileC.ts"];
      const q2Target = ["fileB.ts"]; // rank 2 -> RR = 0.5

      const q3Ranked = ["fileA.ts", "fileB.ts", "fileC.ts"];
      const q3Target = ["fileZ.ts"]; // not found -> RR = 0.0

      expect(reciprocalRank(q1Ranked, q1Target)).toBe(1.0);
      expect(reciprocalRank(q2Ranked, q2Target)).toBe(0.5);
      expect(reciprocalRank(q3Ranked, q3Target)).toBe(0.0);

      // MRR = (1.0 + 0.5 + 0.0) / 3 = 0.5
      const mrr = meanReciprocalRank(
        [q1Ranked, q2Ranked, q3Ranked],
        [q1Target, q2Target, q3Target],
      );
      expect(mrr).toBe(0.5);
    });
  });

  describe("Citation Metrics", () => {
    it("should compute citation metrics including valid, invalid, and missing counts", () => {
      const citations = [
        { valid: true, hallucinated: false },
        { valid: true, hallucinated: false },
        { valid: false, hallucinated: true },
        { valid: false, hallucinated: false },
      ];

      const metrics = calculateCitationMetrics(citations, 5);
      expect(metrics.totalCitations).toBe(4);
      expect(metrics.validCitations).toBe(2);
      expect(metrics.invalidCitations).toBe(2);
      expect(metrics.hallucinatedCitations).toBe(1);
      expect(metrics.missingCitations).toBe(3); // 5 expected - 2 valid = 3
      expect(metrics.validityRate).toBe(0.5);
    });
  });

  describe("Metric Formatting", () => {
    it("should format numbers as percentages or floats and handle N/A", () => {
      expect(formatMetric(0.854, true, 1)).toBe("85.4%");
      expect(formatMetric(0.854, false, 2)).toBe("0.85");
      expect(formatMetric("not_applicable")).toBe("N/A");
    });
  });

  describe("Benchmark Dataset Validation", () => {
    it("should load and validate all benchmark cases successfully", () => {
      const allCases = BenchmarkLoader.getAllCases();
      expect(allCases.length).toBeGreaterThanOrEqual(12);

      const ids = new Set<string>();
      for (const c of allCases) {
        expect(c.id).toBeTruthy();
        expect(ids.has(c.id)).toBe(false); // No duplicates
        ids.add(c.id);

        expect(c.name).toBeTruthy();
        expect(c.category).toBeTruthy();
        expect(c.task.query).toBeTruthy();
        expect(["easy", "medium", "hard"]).toContain(c.difficulty);
      }
    });

    it("should filter benchmark cases by category, difficulty, and tags", () => {
      const securityCases = BenchmarkLoader.filterCases({ categories: ["security"] });
      expect(securityCases.length).toBeGreaterThan(0);
      expect(securityCases.every((c) => c.category === "security")).toBe(true);

      const easyCases = BenchmarkLoader.filterCases({ difficulties: ["easy"] });
      expect(easyCases.length).toBeGreaterThan(0);
      expect(easyCases.every((c) => c.difficulty === "easy")).toBe(true);
    });

    it("should never contain real secrets or production keys in any benchmark fixture", () => {
      const allCases = BenchmarkLoader.getAllCases();
      for (const c of allCases) {
        if (c.projectFixture && c.projectFixture.files) {
          for (const f of c.projectFixture.files) {
            // Check for real production key signatures
            expect(f.content).not.toMatch(/sk_live_[0-9a-zA-Z]{32,}(?!.*FAKE)/);
            expect(f.content).not.toMatch(/ghp_[0-9a-zA-Z]{36}/);
            expect(f.content).not.toMatch(/AKIA[0-9A-Z]{16}/);
          }
        }
      }
    });
  });
});
