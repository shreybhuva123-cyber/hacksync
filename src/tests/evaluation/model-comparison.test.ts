import { describe, expect, it } from "bun:test";
import {
  ModelComparisonEngine,
  type ModelBenchmarkRecord,
} from "@/lib/hacksync/evaluation/model-comparison";
import { EvaluationContext } from "@/lib/hacksync/evaluation/evaluation-context";
import {
  ScorecardGenerator,
  type EvaluationResult,
  type FailureDiagnostic,
} from "@/lib/hacksync/evaluation/evaluation-result";
import { AuthorizationError } from "@/lib/errors";

describe("Phase 6: Multi-Model Comparison & Privacy Policy", () => {
  it("should enforce local-only privacy policy and reject cloud models", () => {
    const strictPolicy = { localOnly: true };

    // Allowed local models
    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("ollama", strictPolicy);
    }).not.toThrow();

    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("local", strictPolicy);
    }).not.toThrow();

    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("builtin", strictPolicy);
    }).not.toThrow();

    // Forbidden cloud models under local-only policy
    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("openai", strictPolicy);
    }).toThrow(AuthorizationError);

    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("anthropic", strictPolicy);
    }).toThrow(AuthorizationError);

    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("gemini", strictPolicy);
    }).toThrow(AuthorizationError);

    // When localOnly is false/absent, all models allowed
    expect(() => {
      ModelComparisonEngine.assertPrivacyPolicy("openai", { localOnly: false });
    }).not.toThrow();
  });

  it("should compare models head-to-head across 6 dimensions and pick winner based on weights", () => {
    const modelA: ModelBenchmarkRecord = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      benchmarkVersion: "2.0.0",
      accuracy: 96.0,
      groundedness: 98.0,
      securityScore: 95.0,
      retrievalScore: 92.0,
      fixScore: 94.0,
      citationScore: 98.0,
      latencyMs: 1200,
      estimatedCost: 0.045,
    };

    const modelB: ModelBenchmarkRecord = {
      provider: "openai",
      model: "gpt-4o-mini",
      benchmarkVersion: "2.0.0",
      accuracy: 85.0,
      groundedness: 88.0,
      securityScore: 82.0,
      retrievalScore: 88.0,
      fixScore: 80.0,
      citationScore: 86.0,
      latencyMs: 600, // Faster
      estimatedCost: 0.005, // Cheaper
    };

    const result = ModelComparisonEngine.compareModels(modelA, modelB);

    expect(result.benchmarkVersion).toBe("2.0.0");
    expect(result.rows.length).toBeGreaterThanOrEqual(6);

    const secRow = result.rows.find((r) => r.metric === "Security");
    expect(secRow?.winner).toBe("A");

    const latRow = result.rows.find((r) => r.metric === "Latency");
    expect(latRow?.winner).toBe("B"); // Model B was faster

    const costRow = result.rows.find((r) => r.metric === "Cost");
    expect(costRow?.winner).toBe("B"); // Model B was cheaper

    // Claude 3.5 Sonnet wins on high-weight dimensions (Security, Fix, Retrieval, Citation)
    expect(result.overallWinner).toBe("A");
    expect(result.summary).toContain("claude-3-5-sonnet wins");
  });

  it("should detect self-evaluation bias when generator and judge models are identical", () => {
    const selfEvalContext = new EvaluationContext({
      projectId: "proj-1",
      userId: "user-1",
      evaluationMethod: "model",
      generatorModel: "gpt-4o",
      judgeModel: "gpt-4o",
    });

    expect(selfEvalContext.selfEvaluation).toBe(true);
    const notes = selfEvalContext.getEvaluationNotes();
    expect(notes.some((n) => n.includes("WARNING: Self-evaluation detected"))).toBe(true);

    const independentContext = new EvaluationContext({
      projectId: "proj-1",
      userId: "user-1",
      evaluationMethod: "model",
      generatorModel: "gpt-4o-mini",
      judgeModel: "claude-3-5-sonnet",
    });

    expect(independentContext.selfEvaluation).toBe(false);
  });

  it("should generate standardized scorecard with non-certification disclaimer", () => {
    const evalResult: EvaluationResult = {
      evaluationId: "eval-999",
      benchmarkVersion: "2.0.0",
      datasetHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      categoryScores: {
        security: 95.0,
        retrieval: 90.0,
        fixing: 92.5,
      },
      aggregateScore: 92.5,
      metrics: {
        f1: 0.95,
        hitAt1: 0.90,
      },
      latency: {
        p50: 250,
        p95: 550,
      },
      regressionStatus: "none",
      evaluationMethod: "deterministic",
      generatorModel: "builtin-engine",
      cost: 0.0,
      diagnostics: [],
    };

    const scorecard = ScorecardGenerator.generateScorecard(evalResult);

    expect(scorecard).toContain("HACKSYNC ENGINEERING INTELLIGENCE SCORE");
    expect(scorecard).toContain("Benchmark Version:  2.0.0");
    expect(scorecard).toContain("Notice: HackSync benchmark score, not an industry-standard certification.");
    expect(scorecard).toContain("Security Health Score is maintained separately in Phase 3 Security Health.");
  });

  it("should format structured failure diagnostics for engineering debugging", () => {
    const diag: FailureDiagnostic = {
      caseId: "case-xss-01",
      benchmarkVersion: "2.0.0",
      model: "model-test",
      failureType: "FALSE_NEGATIVE",
      likelySubsystem: "SecurityScanner",
      evidence: "Unescaped dangerouslySetInnerHTML in ProfileCard.tsx:42",
      expected: "Report XSS vulnerability on line 42",
      actual: "No vulnerability flagged",
    };

    const formatted = ScorecardGenerator.formatFailureDiagnostic(diag);
    expect(formatted).toContain("Case:              case-xss-01");
    expect(formatted).toContain("Failure Type:      FALSE_NEGATIVE");
    expect(formatted).toContain("Likely Subsystem:  SecurityScanner");
  });
});
