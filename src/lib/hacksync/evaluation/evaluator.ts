import { BENCHMARK_DATASET, type BenchmarkCase } from "./benchmark-dataset";
import { EvaluationScorer, type EvaluationMetrics, type CaseEvaluationResult } from "./scoring";
import type { Workspace } from "../types";

export interface EvaluationReport {
  timestamp: string;
  metrics: EvaluationMetrics;
  results: CaseEvaluationResult[];
  summaryMarkdown: string;
}

export class AIEvaluator {
  /**
   * Executes the full benchmark evaluation suite.
   */
  static async runBenchmark(ws?: Workspace | null): Promise<EvaluationReport> {
    const { AIOrchestrator } = await import("../ai/orchestrator");
    const caseResults: CaseEvaluationResult[] = [];

    for (const testCase of BENCHMARK_DATASET) {
      const start = Date.now();

      const testQuery = testCase.query || testCase.task?.query || "";
      const res = await AIOrchestrator.processQuery({
        query: testQuery,
        ws,
        modelPreference: "builtin",
      });

      const latencyMs = Date.now() - start;

      // 1. Evaluate Intent
      const intentMatched = res.intent === testCase.expectedIntent;

      // 2. Evaluate Tools
      const executedToolNames = res.toolCalls.map((t) => t.name);
      const toolsMatched = (testCase.expectedTools || []).some((expTool) =>
        executedToolNames.includes(expTool),
      );

      // 3. Evaluate Keywords / Findings in response
      const outputLower = res.text.toLowerCase();
      const hasKeywords = (testCase.expectedKeywords || []).some((kw) =>
        outputLower.includes(kw.toLowerCase()),
      );

      const passed = intentMatched && (toolsMatched || hasKeywords);
      const score = (intentMatched ? 50 : 0) + (toolsMatched ? 30 : 0) + (hasKeywords ? 20 : 0);

      caseResults.push({
        caseId: testCase.id,
        passed,
        intentMatched,
        toolsMatched,
        score,
        latencyMs,
        notes: passed
          ? `Intent '${res.intent}' matched. Executed [${executedToolNames.join(", ")}].`
          : `Mismatch: Expected intent '${testCase.expectedIntent}' but got '${res.intent}'.`,
      });
    }

    const metrics = EvaluationScorer.computeOverallMetrics(caseResults);

    const summaryMarkdown =
      `### 📊 HackSync AI Quality & Evaluation Report\n\n` +
      `**Overall Quality Score**: \`${metrics.overallScore}/100\`\n` +
      `**Benchmark Cases Passed**: \`${metrics.passedCases}/${metrics.totalCases}\` (${Math.round((metrics.passedCases / metrics.totalCases) * 100)}%)\n\n` +
      `| Metric | Score | Target |\n` +
      `|---|---|---|\n` +
      `| **Intent Classification Accuracy** | **${metrics.intentAccuracy}%** | $\\ge 90\\%$ |\n` +
      `| **Tool Selection Accuracy** | **${metrics.toolSelectionAccuracy}%** | $\\ge 85\\%$ |\n` +
      `| **Code Retrieval & Keyword Precision** | **${metrics.retrievalAccuracy}%** | $\\ge 85\\%$ |\n` +
      `| **False Positive Rate** | **${metrics.falsePositiveRate}%** | $< 10\\%$ |\n` +
      `| **Average Latency** | **${metrics.avgLatencyMs}ms** | $< 500ms |\n\n` +
      `#### Detailed Case Breakdown:\n` +
      caseResults
        .map(
          (c) =>
            `- ${c.passed ? "✓" : "✗"} **${c.caseId}**: Score ${c.score}/100 (${c.latencyMs}ms) — ${c.notes}`,
        )
        .join("\n");

    return {
      timestamp: new Date().toISOString(),
      metrics,
      results: caseResults,
      summaryMarkdown,
    };
  }
}
