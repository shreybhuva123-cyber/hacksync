/**
 * HackSync Phase 5: Specialized Evaluators Test Suite
 * Tests SecurityEvaluator, RetrievalEvaluator, CitationEvaluator,
 * AnswerEvaluator, FixEvaluator, TestingEvaluator, and GitEvaluator.
 */

import { describe, it, expect } from "bun:test";
import { BenchmarkLoader } from "@/lib/hacksync/evaluation/benchmark-loader";
import { SecurityEvaluator } from "@/lib/hacksync/evaluation/evaluators/security-evaluator";
import { RetrievalEvaluator } from "@/lib/hacksync/evaluation/evaluators/retrieval-evaluator";
import { CitationEvaluator } from "@/lib/hacksync/evaluation/evaluators/citation-evaluator";
import { AnswerEvaluator } from "@/lib/hacksync/evaluation/evaluators/answer-evaluator";
import { FixEvaluator } from "@/lib/hacksync/evaluation/evaluators/fix-evaluator";
import { TestingEvaluator } from "@/lib/hacksync/evaluation/evaluators/testing-evaluator";
import { GitEvaluator } from "@/lib/hacksync/evaluation/evaluators/git-evaluator";
import { VerificationEvaluator } from "@/lib/hacksync/evaluation/evaluators/verification-evaluator";

describe("Phase 5: Domain Evaluators Suite", () => {
  describe("SecurityEvaluator", () => {
    it("should detect SQL injection vulnerability (True Positive)", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-SQLI-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.metrics.truePositives).toBe(1);
      expect(result.metrics.falsePositives).toBe(0);
      expect(result.metrics.severityCorrect).toBe(1.0);
      expect(result.evaluationMethod).toBe("DETERMINISTIC");
    });

    it("should detect XSS vulnerability (True Positive)", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-XSS-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.truePositives).toBe(1);
    });

    it("should detect command injection vulnerability (True Positive)", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-CMD-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.truePositives).toBe(1);
    });

    it("should detect path traversal vulnerability (True Positive)", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-TRAV-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.truePositives).toBe(1);
    });

    it("should detect synthetic fake credentials and redact secret values", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-SECR-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.secretRedacted).toBe(1.0);

      // Verify raw secret was redacted in findings evidence
      const findings = result.findings as any[];
      let foundRedacted = false;
      for (const f of findings) {
        if (f.evidence) {
          expect(f.evidence).not.toContain("9999888877776666555544443333");
          if (f.evidence.includes("[REDACTED")) {
            foundRedacted = true;
          }
        }
      }
      expect(foundRedacted).toBe(true);
    });

    it("should verify 0 false positives on clean negative control fixture", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-SEC-SAFE-1");
      expect(caseItem).toBeDefined();

      const result = await SecurityEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.metrics.falsePositives).toBe(0);
      expect(result.metrics.trueNegatives).toBe(1);
    });
  });

  describe("RetrievalEvaluator", () => {
    it("should retrieve target symbol across multiple files with Hit@1/3/5", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-RETRIEVAL-1");
      expect(caseItem).toBeDefined();

      const result = await RetrievalEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.metrics.hitAt5).toBe(1.0);
      expect(result.metrics.symbolMatched).toBe(1.0);
      expect(result.metrics.isolatedToProject).toBe(1.0);
      expect(result.metrics.withinBudget).toBe(1.0);
    });
  });

  describe("CitationEvaluator", () => {
    it("should pass when citations match real project files and lines", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-CITE-1");
      expect(caseItem).toBeDefined();

      const result = await CitationEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.validCitations).toBe(1);
      expect(result.metrics.invalidCitations).toBe(0);
      expect(result.metrics.hallucinatedCitations).toBe(0);
    });

    it("should detect hallucinated citations and line mismatches", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-CITE-1")!;

      const badCitations = [
        { file: "src/non-existent-file.ts", lineStart: 1 }, // Hallucinated file
        { file: "src/utils/format.ts", lineStart: 999 }, // Out of bounds line
      ];

      const result = CitationEvaluator.evaluateCitations({
        caseItem,
        citations: badCitations,
      });

      expect(result.passed).toBe(false);
      expect(result.metrics.hallucinatedCitations).toBe(1);
      expect(result.metrics.invalidCitations).toBe(2);
    });
  });

  describe("AnswerEvaluator", () => {
    it("should detect hallucinated files in answer candidate", () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-RETRIEVAL-1")!;

      const answerWithHallucination = {
        text: "The authentication is handled in src/nonexistent/fake-auth-module.ts at line 50.",
      };

      const result = AnswerEvaluator.evaluateAnswer({
        caseItem,
        answer: answerWithHallucination,
      });

      expect(result.metrics.hallucinatedFilesCount).toBe(1);
      expect(result.metrics.grounded).toBe(0.0);
      expect(result.passed).toBe(false);
    });

    it("should verify honest reporting of insufficient evidence", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-HALLUC-1")!;

      // Candidate that honestly reports missing config
      const honestAnswer = {
        text: "Kubernetes ingress configurations and SSL scripts were not found in this project repository.",
      };

      const result = AnswerEvaluator.evaluateAnswer({
        caseItem,
        answer: honestAnswer,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.metrics.insufficientEvidenceReportedCorrectly).toBe(1.0);
    });
  });

  describe("FixEvaluator", () => {
    it("should evaluate patch generation, validation, approval gate, and application", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-FIX-SQLI-1");
      expect(caseItem).toBeDefined();

      const result = await FixEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.metrics.patchValid).toBe(1.0);
      expect(result.metrics.patchApplies).toBe(1.0);
      expect(result.metrics.vulnerabilityResolved).toBe(1.0);
      expect(result.metrics.regressionIntroduced).toBe(0.0);
    });
  });

  describe("TestingEvaluator", () => {
    it("should evaluate test framework detection and test discovery", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-TEST-DISC-1");
      expect(caseItem).toBeDefined();

      const result = await TestingEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.metrics.frameworkDetected).toBe(1.0);
      expect(result.metrics.testsDiscoveredCount).toBeGreaterThan(0);
      expect(result.metrics.mappingAccurate).toBe(1.0);
    });
  });

  describe("GitEvaluator", () => {
    it("should evaluate diff parsing, changed symbols, and impact analysis without Git mutations", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-GIT-IMPACT-1");
      expect(caseItem).toBeDefined();

      const result = await GitEvaluator.evaluate(caseItem!);
      expect(result.passed).toBe(true);
      expect(result.metrics.diffAccuracy).toBe(1.0);
      expect(result.metrics.changedSymbolsAccuracy).toBe(1.0);
      expect(result.metrics.impactAccuracy).toBe(1.0);
      expect(result.evaluationMethod).toBe("DETERMINISTIC");
    });
  });

  describe("VerificationEvaluator", () => {
    it("should evaluate the end-to-end verification pipeline", async () => {
      const caseItem = BenchmarkLoader.getCaseById("BM-FIX-SQLI-1")!;
      const result = await VerificationEvaluator.evaluate(caseItem);
      expect(result.passed).toBe(true);
      expect(result.category).toBe("verification");
    });
  });
});
