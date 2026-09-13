/**
 * HackSync Phase 6: Multi-Model Evaluation & Comparison Engine
 * Compares models head-to-head across retrieval, security, fixing, citations, latency, and cost.
 * Evaluates winners using multi-dimensional criteria (never a single metric).
 * Strictly enforces project model privacy policies (local_only = true blocks cloud LLMs).
 */

import { AuthorizationError } from "@/lib/errors";

export interface ModelBenchmarkRecord {
  provider: string;
  model: string;
  modelVersion?: string | undefined;
  benchmarkVersion: string;
  accuracy: number;
  groundedness: number;
  securityScore: number;
  retrievalScore: number;
  fixScore: number;
  citationScore: number;
  latencyMs: number;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  estimatedCost?: number | "unavailable" | undefined;
}

export interface MetricComparisonRow {
  metric: string;
  modelAValue: string;
  modelBValue: string;
  winner: "A" | "B" | "TIE";
  weight: number;
  significance: "HIGH" | "MEDIUM" | "LOW";
}

export interface ModelComparisonResult {
  modelA: { provider: string; model: string };
  modelB: { provider: string; model: string };
  benchmarkVersion: string;
  rows: MetricComparisonRow[];
  overallWinner: "A" | "B" | "TIE";
  modelAScoreWins: number;
  modelBScoreWins: number;
  summary: string;
}

export class ModelComparisonEngine {
  /**
   * Evaluates if a model provider violates project privacy policy.
   * If local_only is true, only local providers ('ollama', 'local', 'builtin') are allowed.
   */
  static assertPrivacyPolicy(provider: string, projectPolicy: { localOnly?: boolean }): void {
    if (projectPolicy?.localOnly) {
      const pLower = provider.toLowerCase();
      const isLocal = pLower === "ollama" || pLower === "local" || pLower === "builtin";
      if (!isLocal) {
        throw new AuthorizationError(
          `[ModelPrivacyPolicy] Project enforces local_only=true. Cloud provider '${provider}' is strictly forbidden.`,
        );
      }
    }
  }

  /**
   * Compares Model A and Model B head-to-head across all critical dimensions.
   */
  static compareModels(
    modelA: ModelBenchmarkRecord,
    modelB: ModelBenchmarkRecord,
  ): ModelComparisonResult {
    const rows: MetricComparisonRow[] = [];

    const evaluateMetric = (
      name: string,
      valA: number,
      valB: number,
      higherIsBetter = true,
      formatter: (v: number) => string = (v) => `${v.toFixed(1)}%`,
      weight = 1.0,
      significance: MetricComparisonRow["significance"] = "MEDIUM",
    ) => {
      let winner: "A" | "B" | "TIE" = "TIE";
      const delta = valA - valB;
      const epsilon = 0.001;

      if (Math.abs(delta) > epsilon) {
        if (higherIsBetter) {
          winner = delta > 0 ? "A" : "B";
        } else {
          winner = delta < 0 ? "A" : "B";
        }
      }

      rows.push({
        metric: name,
        modelAValue: formatter(valA),
        modelBValue: formatter(valB),
        winner,
        weight,
        significance,
      });
    };

    // 1. Retrieval Score (Higher is better, Weight 2.0, HIGH)
    evaluateMetric("Retrieval", modelA.retrievalScore, modelB.retrievalScore, true, (v) => `${v.toFixed(1)}%`, 2.0, "HIGH");

    // 2. Security Score (Higher is better, Weight 2.5, HIGH)
    evaluateMetric("Security", modelA.securityScore, modelB.securityScore, true, (v) => `${v.toFixed(1)}%`, 2.5, "HIGH");

    // 3. Fix Score (Higher is better, Weight 2.0, HIGH)
    evaluateMetric("Fix Quality", modelA.fixScore, modelB.fixScore, true, (v) => `${v.toFixed(1)}%`, 2.0, "HIGH");

    // 4. Citation & Grounding (Higher is better, Weight 1.5, MEDIUM)
    evaluateMetric("Citation", modelA.citationScore, modelB.citationScore, true, (v) => `${v.toFixed(1)}%`, 1.5, "MEDIUM");

    // 5. Latency (Lower is better, Weight 1.0, MEDIUM)
    evaluateMetric(
      "Latency",
      modelA.latencyMs,
      modelB.latencyMs,
      false,
      (v) => `${(v / 1000).toFixed(2)}s`,
      1.0,
      "MEDIUM",
    );

    // 6. Cost (Lower is better, Weight 1.0, MEDIUM)
    const costA = typeof modelA.estimatedCost === "number" ? modelA.estimatedCost : Infinity;
    const costB = typeof modelB.estimatedCost === "number" ? modelB.estimatedCost : Infinity;
    let costWinner: "A" | "B" | "TIE" = "TIE";
    if (costA !== Infinity && costB !== Infinity) {
      if (Math.abs(costA - costB) > 0.0001) {
        costWinner = costA < costB ? "A" : "B";
      }
    }
    rows.push({
      metric: "Cost",
      modelAValue: typeof modelA.estimatedCost === "number" ? `$${modelA.estimatedCost.toFixed(4)}` : "unavailable",
      modelBValue: typeof modelB.estimatedCost === "number" ? `$${modelB.estimatedCost.toFixed(4)}` : "unavailable",
      winner: costWinner,
      weight: 1.0,
      significance: "MEDIUM",
    });

    // Calculate Multi-Metric Winner using weights
    let weightedScoreA = 0;
    let weightedScoreB = 0;
    let winsA = 0;
    let winsB = 0;

    for (const r of rows) {
      if (r.winner === "A") {
        weightedScoreA += r.weight;
        winsA++;
      } else if (r.winner === "B") {
        weightedScoreB += r.weight;
        winsB++;
      }
    }

    let overallWinner: "A" | "B" | "TIE" = "TIE";
    if (Math.abs(weightedScoreA - weightedScoreB) > 0.1) {
      overallWinner = weightedScoreA > weightedScoreB ? "A" : "B";
    }

    const nameA = `${modelA.provider}/${modelA.model}`;
    const nameB = `${modelB.provider}/${modelB.model}`;
    const summary =
      overallWinner === "TIE"
        ? `Tie between ${nameA} and ${nameB} across benchmark categories.`
        : `${overallWinner === "A" ? nameA : nameB} wins multi-metric evaluation (${overallWinner === "A" ? winsA : winsB} metric wins, weighted score: ${Math.max(weightedScoreA, weightedScoreB).toFixed(1)} vs ${Math.min(weightedScoreA, weightedScoreB).toFixed(1)}).`;

    return {
      modelA: { provider: modelA.provider, model: modelA.model },
      modelB: { provider: modelB.provider, model: modelB.model },
      benchmarkVersion: modelA.benchmarkVersion,
      rows,
      overallWinner,
      modelAScoreWins: winsA,
      modelBScoreWins: winsB,
      summary,
    };
  }

  /**
   * Formats the comparison as a Markdown table.
   */
  static formatMarkdownComparison(result: ModelComparisonResult): string {
    const nameA = `${result.modelA.provider}/${result.modelA.model}`;
    const nameB = `${result.modelB.provider}/${result.modelB.model}`;

    const lines: string[] = [
      `### Model Comparison: ${nameA} vs ${nameB}`,
      `**Benchmark Version:** ${result.benchmarkVersion} | **Overall Winner:** ${result.overallWinner === "A" ? nameA : result.overallWinner === "B" ? nameB : "TIE"}`,
      "",
      `| Metric | ${nameA} | ${nameB} | Winner |`,
      `| :--- | :--- | :--- | :---: |`,
    ];

    for (const row of result.rows) {
      const winnerLabel = row.winner === "A" ? nameA : row.winner === "B" ? nameB : "TIE";
      lines.push(`| **${row.metric}** | ${row.modelAValue} | ${row.modelBValue} | ${winnerLabel} |`);
    }

    lines.push("");
    lines.push(`**Summary:** ${result.summary}`);
    return lines.join("\n");
  }
}
