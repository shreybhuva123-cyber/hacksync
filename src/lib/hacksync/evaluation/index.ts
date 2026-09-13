/**
 * HackSync Phase 5: Evaluation & Benchmarking Domain Barrel Export
 */

export * from "./types";
export * from "./metrics";
export * from "./scoring-engine";
export * from "./benchmark-dataset";
export * from "./benchmark-loader";
export * from "./benchmark-runner";
export * from "./regression-detector";
export * from "./evaluation-engine";
export * from "./evaluators/security-evaluator";
export * from "./evaluators/retrieval-evaluator";
export * from "./evaluators/citation-evaluator";
export * from "./evaluators/answer-evaluator";
export * from "./evaluators/fix-evaluator";
export * from "./evaluators/testing-evaluator";
export * from "./evaluators/git-evaluator";
export * from "./evaluators/verification-evaluator";
export * from "./reporters/json-reporter";
export * from "./reporters/summary-reporter";
export * from "./reporters/comparison-reporter";

// Legacy backwards-compatibility exports
export { AIEvaluator, type EvaluationReport } from "./evaluator";
export { EvaluationScorer, type EvaluationMetrics } from "./scoring";
