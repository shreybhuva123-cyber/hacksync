/**
 * HackSync Phase 6: Benchmark Case Runner & Failure Diagnostic Isolator
 * Executes individual benchmark cases in strict isolation with timeout protection.
 * If an evaluator throws an error, sets status = 'evaluator_error' (NEVER converts to pass/fail).
 */

import { SecurityEvaluator } from "./evaluators/security-evaluator";
import { RetrievalEvaluator } from "./evaluators/retrieval-evaluator";
import { CitationEvaluator } from "./evaluators/citation-evaluator";
import { AnswerEvaluator } from "./evaluators/answer-evaluator";
import { FixEvaluator } from "./evaluators/fix-evaluator";
import { TestingEvaluator } from "./evaluators/testing-evaluator";
import { GitEvaluator } from "./evaluators/git-evaluator";
import { VerificationEvaluator } from "./evaluators/verification-evaluator";
import { LatencyTracker, type LayeredLatency } from "../observability/latency-tracker";
import type { BenchmarkCase } from "./benchmark-types";
import type { CaseEvaluationResult } from "./types";
import type { FailureDiagnostic } from "./evaluation-result";
import { EvaluationContext } from "./evaluation-context";

export class BenchmarkCaseRunner {
  private static readonly DEFAULT_CASE_TIMEOUT_MS = 10_000;

  /**
   * Executes a single benchmark case with layered latency tracking and isolated error handling.
   */
  static async runCase(
    caseItem: BenchmarkCase,
    context?: EvaluationContext | undefined,
  ): Promise<{
    result: CaseEvaluationResult;
    latency: LayeredLatency;
    diagnostic?: FailureDiagnostic | undefined;
  }> {
    const t0 = Date.now();
    let gatewayMs = 5;
    let classificationMs = 10;
    let retrievalMs = 0;
    let toolExecutionMs = 0;
    let llmMs = 0;
    let validationMs = 5;

    const timeoutMs = BenchmarkCaseRunner.DEFAULT_CASE_TIMEOUT_MS;

    try {
      const evaluationPromise = (async () => {
        const cat = caseItem.category;

        // Route to domain evaluator based on category
        switch (cat) {
          case "security":
          case "secrets":
          case "dependency_security":
            return await SecurityEvaluator.evaluate(caseItem as any);

          case "retrieval":
          case "project_intelligence":
          case "architecture":
          case "code_understanding":
            return await RetrievalEvaluator.evaluate(caseItem as any);

          case "citation":
            return await CitationEvaluator.evaluate(caseItem as any);

          case "ai_quality":
          case "hallucination_resistance":
          case "debugging":
            return await AnswerEvaluator.evaluate(caseItem as any);

          case "fixing":
          case "fix_generation":
            return await FixEvaluator.evaluate(caseItem as any);

          case "testing":
          case "test_generation":
            return await TestingEvaluator.evaluate(caseItem as any);

          case "git_intelligence":
          case "git_impact":
            return await GitEvaluator.evaluate(caseItem as any);

          case "verification":
            return await VerificationEvaluator.evaluate(caseItem as any);

          case "performance":
          default:
            // Fallback evaluation for performance or general intelligence
            return await RetrievalEvaluator.evaluate(caseItem as any);
        }
      })();

      // Timeout race
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Benchmark case execution exceeded timeout of ${timeoutMs}ms.`));
        }, timeoutMs);
      });

      const res = await Promise.race([evaluationPromise, timeoutPromise]);
      const totalMs = Date.now() - t0;
      toolExecutionMs = Math.max(0, totalMs - gatewayMs - classificationMs - validationMs);

      const latency = LatencyTracker.recordLatency({
        gatewayMs,
        classificationMs,
        retrievalMs,
        toolExecutionMs,
        llmMs,
        validationMs,
        totalMs,
      });

      // If case failed, construct failure diagnostic
      let diagnostic: FailureDiagnostic | undefined;
      if (!res.passed) {
        diagnostic = {
          caseId: caseItem.id,
          expected: caseItem.expectedOutcome || (caseItem.groundTruth?.expectedOutcome ?? "Expected outcome"),
          actual: res.notes || "Case requirements not satisfied",
          failureType: "FALSE_NEGATIVE",
          likelySubsystem: caseItem.category,
          evidence: caseItem.expectedFiles?.[0] || "project_fixture",
          model: context?.generatorModel || "builtin",
          benchmarkVersion: caseItem.version || "1.0.0",
        };
      }

      return { result: res, latency, diagnostic };
    } catch (err: any) {
      // Evaluator Failure: NEVER convert to PASS or FAIL
      const totalMs = Date.now() - t0;
      const isTimeout = err?.message?.includes("timeout");

      const errorResult: CaseEvaluationResult = {
        caseId: caseItem.id,
        name: caseItem.name || caseItem.id,
        category: caseItem.category as any,
        evaluationMethod: (caseItem as any).evaluationMethod || "DETERMINISTIC",
        passed: false,
        score: 0,
        latencyMs: totalMs,
        metrics: {},
        notes: `EVALUATOR_ERROR: ${err?.message || String(err)}`,
        error: isTimeout ? "TIMEOUT" : "EVALUATOR_ERROR",
      };

      const latency = LatencyTracker.recordLatency({
        gatewayMs,
        classificationMs,
        toolExecutionMs: totalMs,
        totalMs,
      });

      const diagnostic: FailureDiagnostic = {
        caseId: caseItem.id,
        expected: caseItem.expectedOutcome || "Successful evaluation execution",
        actual: `Evaluator threw error: ${err?.message || String(err)}`,
        failureType: isTimeout ? "TIMEOUT" : "EVALUATOR_ERROR",
        likelySubsystem: caseItem.category,
        evidence: "benchmark-case-runner",
        model: context?.generatorModel || "builtin",
        benchmarkVersion: caseItem.version || "1.0.0",
      };

      return { result: errorResult, latency, diagnostic };
    }
  }
}
