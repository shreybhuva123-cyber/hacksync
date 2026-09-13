/**
 * HackSync Phase 6: Evaluation Result Contract, Scorecard & Failure Diagnostics
 * Formats standardized engineering quality scorecards and detailed failure diagnostics.
 */

import type { EvaluationMethod } from "./benchmark-types";

export type RegressionStatus =
  | "none"
  | "info"
  | "warning"
  | "regression"
  | "critical_regression"
  | "insufficient_sample";

export interface FailureDiagnostic {
  caseId: string;
  expected: string;
  actual: string;
  failureType:
    | "FALSE_NEGATIVE"
    | "FALSE_POSITIVE"
    | "HALLUCINATION"
    | "REGRESSION"
    | "PATCH_FAILED"
    | "SECURITY_BYPASS"
    | "TIMEOUT"
    | "EVALUATOR_ERROR"
    | "UNKNOWN";
  likelySubsystem: string;
  evidence: string;
  model: string;
  benchmarkVersion: string;
}

export interface EvaluationResult {
  evaluationId: string;
  benchmarkVersion: string;
  datasetHash: string;
  categoryScores: Record<string, number>;
  aggregateScore: number;
  metrics: {
    precision?: number | "not_applicable";
    recall?: number | "not_applicable";
    f1?: number | "not_applicable";
    hitAt1?: number | "not_applicable";
    hitAt3?: number | "not_applicable";
    hitAt5?: number | "not_applicable";
    mrr?: number | "not_applicable";
    citationValidity?: number | "not_applicable";
    groundedness?: number | "not_applicable";
  };
  latency: {
    p50?: number;
    p90?: number;
    p95?: number;
    p99?: number;
  };
  regressionStatus: RegressionStatus;
  evaluationMethod: EvaluationMethod;
  generatorModel?: string | undefined;
  judgeModel?: string | undefined;
  cost?: number | "unavailable" | undefined;
  diagnostics: string[];
  failureDiagnostics?: FailureDiagnostic[];
}

export class ScorecardGenerator {
  /**
   * Generates a standardized, beautifully aligned HackSync Engineering Intelligence Scorecard.
   * Explicitly labeled as an internal benchmark score, strictly separate from Phase 3 Security Health Score.
   */
  static generateScorecard(result: EvaluationResult): string {
    const lines: string[] = [];

    lines.push("=======================================================");
    lines.push("       HACKSYNC ENGINEERING INTELLIGENCE SCORE         ");
    lines.push("=======================================================");
    lines.push(`Benchmark Version:  ${result.benchmarkVersion}`);
    lines.push(`Dataset SHA-256:    ${result.datasetHash.slice(0, 16)}...`);
    lines.push(`Evaluation Method:  ${result.evaluationMethod.toUpperCase()}`);
    if (result.generatorModel) {
      lines.push(`Generator Model:    ${result.generatorModel}`);
    }
    if (result.judgeModel && result.judgeModel !== result.generatorModel) {
      lines.push(`Judge Model:        ${result.judgeModel}`);
    }
    lines.push("-------------------------------------------------------");
    lines.push("Category Breakdown                                Score");
    lines.push("-------------------------------------------------------");

    const categoryLabels: Record<string, string> = {
      project_intelligence: "Project Intelligence",
      retrieval: "Retrieval & Grounding",
      debugging: "Debugging Intelligence",
      security: "Security & Secrets",
      git_intelligence: "Git & Diff Intelligence",
      testing: "Testing Intelligence",
      fixing: "Fix Quality & Safety",
      verification: "Closed-Loop Verification",
      ai_quality: "Citation & AI Quality",
      performance: "Performance & Indexing",
    };

    for (const [cat, score] of Object.entries(result.categoryScores)) {
      const label = categoryLabels[cat] || cat.replace(/_/g, " ");
      const scoreStr = score.toFixed(1).padStart(5, " ");
      lines.push(`${label.padEnd(46, " ")} ${scoreStr}`);
    }

    lines.push("=======================================================");
    const overallStr = result.aggregateScore.toFixed(1).padStart(5, " ");
    lines.push(`OVERALL SCORE                                  ${overallStr}`);
    lines.push("=======================================================");
    lines.push(`Regression Status:  ${result.regressionStatus.toUpperCase()}`);
    if (result.cost !== undefined) {
      lines.push(`Estimated Cost:     ${typeof result.cost === "number" ? "$" + result.cost.toFixed(4) : result.cost}`);
    }
    if (result.latency.p50 !== undefined) {
      lines.push(`Latency (P50/P95):  ${result.latency.p50}ms / ${result.latency.p95 || "N/A"}ms`);
    }
    lines.push("-------------------------------------------------------");
    lines.push("Notice: HackSync benchmark score, not an industry-standard certification.");
    lines.push("Security Health Score is maintained separately in Phase 3 Security Health.");
    lines.push("=======================================================");

    return lines.join("\n");
  }

  /**
   * Formats structured failure diagnostics for engineering debugging.
   */
  static formatFailureDiagnostic(diag: FailureDiagnostic): string {
    return [
      `Case:              ${diag.caseId}`,
      `Benchmark Version: ${diag.benchmarkVersion}`,
      `Model:             ${diag.model}`,
      `Failure Type:      ${diag.failureType}`,
      `Likely Subsystem:  ${diag.likelySubsystem}`,
      `Evidence:          ${diag.evidence}`,
      `Expected:          ${diag.expected}`,
      `Actual:            ${diag.actual}`,
    ].join("\n");
  }
}
