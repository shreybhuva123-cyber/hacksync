export interface EvaluationMetrics {
  totalCases: number;
  intentAccuracy: number; // 0..100
  toolSelectionAccuracy: number; // 0..100
  retrievalAccuracy: number; // 0..100
  bugDetectionAccuracy: number; // 0..100
  falsePositiveRate: number; // 0..100
  overallScore: number; // 0..100
  passedCases: number;
  failedCases: number;
  avgLatencyMs: number;
}

export interface CaseEvaluationResult {
  caseId: string;
  passed: boolean;
  intentMatched: boolean;
  toolsMatched: boolean;
  score: number;
  latencyMs: number;
  notes: string;
}

export class EvaluationScorer {
  static computeOverallMetrics(caseResults: CaseEvaluationResult[]): EvaluationMetrics {
    if (caseResults.length === 0) {
      return {
        totalCases: 0,
        intentAccuracy: 0,
        toolSelectionAccuracy: 0,
        retrievalAccuracy: 0,
        bugDetectionAccuracy: 0,
        falsePositiveRate: 0,
        overallScore: 0,
        passedCases: 0,
        failedCases: 0,
        avgLatencyMs: 0,
      };
    }

    const total = caseResults.length;
    const passed = caseResults.filter((c) => c.passed).length;
    const intentMatches = caseResults.filter((c) => c.intentMatched).length;
    const toolMatches = caseResults.filter((c) => c.toolsMatched).length;

    const intentAccuracy = Math.round((intentMatches / total) * 100);
    const toolSelectionAccuracy = Math.round((toolMatches / total) * 100);
    const retrievalAccuracy = Math.round((passed / total) * 100);
    const bugDetectionAccuracy = Math.round((passed / total) * 100);
    const falsePositiveRate = Math.max(0, Math.round(((total - passed) / total) * 15)); // Heuristic FP rate

    const avgLatencyMs = Math.round(
      caseResults.reduce((sum, c) => sum + c.latencyMs, 0) / total,
    );

    const overallScore = Math.round(
      intentAccuracy * 0.35 +
      toolSelectionAccuracy * 0.35 +
      retrievalAccuracy * 0.2 +
      (100 - falsePositiveRate) * 0.1,
    );

    return {
      totalCases: total,
      intentAccuracy,
      toolSelectionAccuracy,
      retrievalAccuracy,
      bugDetectionAccuracy,
      falsePositiveRate,
      overallScore,
      passedCases: passed,
      failedCases: total - passed,
      avgLatencyMs,
    };
  }
}
