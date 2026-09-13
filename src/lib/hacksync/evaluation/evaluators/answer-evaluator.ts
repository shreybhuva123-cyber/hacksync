/**
 * HackSync Phase 5: Answer & Groundedness Evaluator
 * Evaluates AI answer quality, evidence grounding, hallucination resistance,
 * and appropriate reporting of insufficient evidence using deterministic checks.
 * Subjective/semantic properties are explicitly labeled as HEURISTIC.
 */

import type { BenchmarkCase, CaseEvaluationResult, AnswerMetrics, EvaluationMethod } from "../types";
import { safeDivide } from "../metrics";

export interface AnswerCandidate {
  text: string;
  evidenceSnippets?: string[];
  citedFiles?: string[];
  confidence?: number;
  uncertaintyDisclaimers?: string[];
}

export class AnswerEvaluator {
  /**
   * Evaluates an AI answer candidate against ground truth fixture.
   */
  static evaluateAnswer(params: {
    caseItem: BenchmarkCase;
    answer: AnswerCandidate;
  }): CaseEvaluationResult {
    const start = Date.now();
    const { caseItem, answer } = params;

    const fixture = caseItem.projectFixture;
    const realFiles = new Set<string>((fixture?.files || []).map((f) => f.path));
    const answerText = answer.text || "";
    const lowerText = answerText.toLowerCase();

    // 1. Detect Hallucinated Files Mentioned in Answer
    // Extract potential file paths using regex (e.g. `foo/bar.ts`, `config.yaml`, `/path/file.ext`)
    const filePathRegex = /[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+/g;
    const detectedFileMentions = Array.from(new Set(answerText.match(filePathRegex) || []));
    const hallucinatedFiles = detectedFileMentions.filter(
      (path) => !realFiles.has(path) && !path.startsWith("node_modules/"),
    );

    // 2. Insufficient Evidence Detection
    // When a task asks for something absent from the codebase (e.g., BM-HALLUC-1)
    const INSUFFICIENT_EVIDENCE_KEYWORDS = [
      "not found",
      "no evidence",
      "not present",
      "does not contain",
      "cannot be found",
      "no configuration",
      "insufficient",
      "unavailable",
    ];

    const isNegativeOrUnknownTask =
      caseItem.category === "hallucination_resistance" ||
      (caseItem.expectedFiles && caseItem.expectedFiles.length === 0);

    const reportsInsufficientEvidence = INSUFFICIENT_EVIDENCE_KEYWORDS.some((kw) =>
      lowerText.includes(kw),
    );

    let insufficientEvidenceCorrectlyReported = true;
    if (isNegativeOrUnknownTask) {
      insufficientEvidenceCorrectlyReported = reportsInsufficientEvidence && hallucinatedFiles.length === 0;
    }

    // 3. Evidence Coverage & Grounding
    // Check if expected keywords or expected symbols are covered
    const expectedKeywords = caseItem.expectedKeywords || [];
    let keywordsMatched = 0;
    for (const kw of expectedKeywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        keywordsMatched++;
      }
    }
    const keywordCoverage = expectedKeywords.length > 0
      ? keywordsMatched / expectedKeywords.length
      : 1.0;

    // 4. Groundedness Heuristic Score
    // Penalize unsupported claims or hallucinated files
    let grounded = true;
    let groundednessScore = 1.0;

    if (hallucinatedFiles.length > 0) {
      grounded = false;
      groundednessScore = Math.max(0, 1.0 - hallucinatedFiles.length * 0.3);
    }

    if (isNegativeOrUnknownTask && !insufficientEvidenceCorrectlyReported) {
      grounded = false;
      groundednessScore = Math.min(groundednessScore, 0.2);
    }

    // Determine pass condition
    let passed = false;
    let score = 0;

    if (isNegativeOrUnknownTask) {
      passed = insufficientEvidenceCorrectlyReported && hallucinatedFiles.length === 0;
      score = passed ? 100 : 20;
    } else {
      passed = grounded && hallucinatedFiles.length === 0 && keywordCoverage >= 0.5;
      score = Math.round(groundednessScore * 60 + keywordCoverage * 40);
    }

    const notes: string[] = [];
    if (hallucinatedFiles.length > 0) {
      notes.push(`Hallucinated file(s) mentioned: [${hallucinatedFiles.join(", ")}].`);
    }
    if (isNegativeOrUnknownTask) {
      notes.push(
        insufficientEvidenceCorrectlyReported
          ? "Appropriately reported insufficient evidence without hallucinations."
          : "Failed to report absence of evidence; hallucinated presence of configuration.",
      );
    } else {
      notes.push(`Keyword coverage: ${(keywordCoverage * 100).toFixed(0)}%.`);
    }

    const latencyMs = Date.now() - start;
    const evaluationMethod: EvaluationMethod =
      caseItem.expectedKeywords && caseItem.expectedKeywords.length > 0
        ? "DETERMINISTIC"
        : "HEURISTIC";

    return {
      caseId: caseItem.id,
      name: caseItem.name,
      category: caseItem.category,
      evaluationMethod,
      passed,
      score: Math.min(100, Math.max(0, score)),
      latencyMs,
      metrics: {
        grounded: grounded ? 1.0 : 0.0,
        groundednessScore,
        evidenceCoverage: keywordCoverage,
        hallucinatedFilesCount: hallucinatedFiles.length,
        insufficientEvidenceReportedCorrectly: insufficientEvidenceCorrectlyReported ? 1.0 : 0.0,
      },
      notes: notes.join(" "),
    };
  }

  /**
   * Evaluates an answer benchmark case using deterministic fallback answer from case.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    const candidate: AnswerCandidate = {
      text: caseItem.expectedOutcome,
      citedFiles: caseItem.expectedFiles || [],
      confidence: 1.0,
    };
    return this.evaluateAnswer({ caseItem, answer: candidate });
  }
}
