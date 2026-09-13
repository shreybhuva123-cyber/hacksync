/**
 * HackSync Phase 5: Verification Evaluator
 * Evaluates the multi-dimensional verification pipeline:
 * Targeted Test Runs + Security Rescan + AST Symbol Integrity + Iteration Limits.
 */

import { FixEvaluator } from "./fix-evaluator";
import type { BenchmarkCase, CaseEvaluationResult } from "../types";

export class VerificationEvaluator {
  /**
   * Evaluates a verification benchmark case.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    // Reuses the end-to-end fix verification pipeline
    const fixResult = await FixEvaluator.evaluate(caseItem);

    return {
      ...fixResult,
      category: "verification",
      name: `Verification: ${caseItem.name}`,
      notes: `Fix & Verification Pipeline: ${fixResult.notes}`,
    };
  }
}
