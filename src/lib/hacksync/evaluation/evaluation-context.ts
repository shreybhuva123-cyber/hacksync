/**
 * HackSync Phase 6: Evaluation Context & Multi-Model Judging Rubric
 * Tracks evaluation execution parameters, detects self-evaluation anti-patterns,
 * and enforces explicit multi-dimensional judging rubrics.
 */

import type { EvaluationMethod } from "./benchmark-types";

export interface RubricCriterionScore {
  score: number; // 0 to 100
  rationale: string;
  evidenceRefs: string[];
}

export interface ModelEvaluationRubric {
  groundedness: RubricCriterionScore;
  correctness: RubricCriterionScore;
  completeness: RubricCriterionScore;
  citationAccuracy: RubricCriterionScore;
  uncertaintyHonesty: RubricCriterionScore;
  securityCorrectness: RubricCriterionScore;
  actionability: RubricCriterionScore;
  overallScore: number;
}

export interface EvaluationContextParams {
  projectId: string;
  userId: string;
  benchmarkRunId?: string | undefined;
  caseId?: string | undefined;
  evaluationMethod?: EvaluationMethod | undefined;
  generatorModel?: string | undefined;
  judgeModel?: string | undefined;
  provider?: string | undefined;
  options?: Record<string, unknown> | undefined;
}

export class EvaluationContext {
  readonly projectId: string;
  readonly userId: string;
  readonly benchmarkRunId: string;
  readonly caseId?: string | undefined;
  readonly evaluationMethod: EvaluationMethod;
  readonly generatorModel: string;
  readonly judgeModel: string;
  readonly provider: string;
  readonly selfEvaluation: boolean;
  readonly options: Record<string, unknown>;

  constructor(params: EvaluationContextParams) {
    this.projectId = params.projectId;
    this.userId = params.userId;
    this.benchmarkRunId = params.benchmarkRunId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.caseId = params.caseId;
    this.evaluationMethod = params.evaluationMethod || "deterministic";
    this.generatorModel = params.generatorModel || "builtin";
    this.judgeModel = params.judgeModel || "builtin";
    this.provider = params.provider || "builtin";
    this.options = params.options || {};

    // Prevent Unflagged Self-Judging:
    // If the same model evaluates its own output, explicitly flag and report limitation
    this.selfEvaluation =
      this.evaluationMethod === "model" &&
      Boolean(this.generatorModel) &&
      this.generatorModel === this.judgeModel;
  }

  /**
   * Generates evaluation notes and self-judging warnings.
   */
  getEvaluationNotes(): string[] {
    const notes: string[] = [
      `Method: ${this.evaluationMethod}. Generator: ${this.generatorModel}. Judge: ${this.judgeModel}.`,
    ];

    if (this.selfEvaluation) {
      notes.push(
        "WARNING: Self-evaluation detected (generatorModel === judgeModel). Scores may carry inherent model bias.",
      );
    }

    return notes;
  }

  /**
   * Validates that model judge evidence references exist in the actual project files.
   * Prevents model judges from inventing hallucinated benchmark evidence.
   */
  static validateEvidenceReferences(
    refs: string[],
    knownProjectFiles: string[],
  ): { valid: boolean; invalidRefs: string[] } {
    const fileSet = new Set(knownProjectFiles);
    const invalidRefs: string[] = [];

    for (const ref of refs) {
      const filePath = ref.split(":")[0] || ref;
      if (!fileSet.has(filePath)) {
        invalidRefs.push(ref);
      }
    }

    return {
      valid: invalidRefs.length === 0,
      invalidRefs,
    };
  }
}
