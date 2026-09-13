/**
 * HackSync Phase 5: Model & Run Comparison Reporter
 * Compares two benchmark runs side-by-side (e.g. Model A vs Model B, or Baseline vs Current).
 * Highlights deltas and flags regressions without claiming universal superiority.
 * Honestly marks unavailable providers.
 */

import type { BenchmarkRun, ModelComparisonReport, DetectedRegression, MetricValue } from "../types";
import { formatMetric } from "../metrics";
import { RegressionDetector } from "../regression-detector";

export class ComparisonReporter {
  /**
   * Compares two benchmark runs and generates a comparison report.
   */
  static compare(baselineRun: BenchmarkRun, candidateRun: BenchmarkRun): ModelComparisonReport {
    // Check if candidate or baseline is unavailable
    if (candidateRun.status === "unavailable" || baselineRun.status === "unavailable") {
      const unavail = candidateRun.status === "unavailable" ? candidateRun : baselineRun;
      return {
        baselineRunId: baselineRun.runId,
        candidateRunId: candidateRun.runId,
        providerA: baselineRun.provider,
        modelA: baselineRun.model,
        providerB: candidateRun.provider,
        modelB: candidateRun.model,
        deltas: {},
        regressions: [],
        summary: `PROVIDER UNAVAILABLE: Run ${unavail.runId} (${unavail.provider}/${unavail.model}) failed because the provider was unavailable. Cannot complete comparative evaluation.`,
      };
    }

    const deltas: Record<string, { baseline: MetricValue; candidate: MetricValue; delta: MetricValue }> = {};

    // Overall Score Delta
    const scoreDelta = candidateRun.overallScore - baselineRun.overallScore;
    deltas["overall_score"] = {
      baseline: baselineRun.overallScore,
      candidate: candidateRun.overallScore,
      delta: scoreDelta,
    };

    // Latency Delta
    const latencyDelta = candidateRun.latencyMs - baselineRun.latencyMs;
    deltas["latency_ms"] = {
      baseline: baselineRun.latencyMs,
      candidate: candidateRun.latencyMs,
      delta: latencyDelta,
    };

    // Metric Deltas
    const allMetricKeys = Array.from(
      new Set([...Object.keys(baselineRun.metrics), ...Object.keys(candidateRun.metrics)]),
    );

    for (const key of allMetricKeys) {
      const base = baselineRun.metrics[key];
      const cand = candidateRun.metrics[key];

      let deltaVal: MetricValue = "not_applicable";
      if (typeof base === "number" && typeof cand === "number") {
        deltaVal = cand - base;
      }

      deltas[key] = {
        baseline: base !== undefined ? base : "not_applicable",
        candidate: cand !== undefined ? cand : "not_applicable",
        delta: deltaVal,
      };
    }

    // Regression Check
    const regCheck = RegressionDetector.detect(candidateRun, baselineRun);

    const summary = regCheck.hasRegressions
      ? `Comparison completed with ${regCheck.regressions.length} regression(s) detected in candidate run.`
      : `Comparison completed. Candidate run maintained or improved all tracked quality thresholds.`;

    return {
      baselineRunId: baselineRun.runId,
      candidateRunId: candidateRun.runId,
      providerA: baselineRun.provider,
      modelA: baselineRun.model,
      providerB: candidateRun.provider,
      modelB: candidateRun.model,
      deltas,
      regressions: regCheck.regressions,
      summary,
    };
  }

  /**
   * Formats the comparison report as readable Markdown.
   */
  static formatMarkdown(report: ModelComparisonReport): string {
    const lines: string[] = [];

    lines.push("# Benchmark Comparative Evaluation Report");
    lines.push("");
    lines.push(`**Baseline**: \`${report.baselineRunId}\` (${report.providerA} / ${report.modelA})`);
    lines.push(`**Candidate**: \`${report.candidateRunId}\` (${report.providerB} / ${report.modelB})`);
    lines.push("");
    lines.push(`> **Summary**: ${report.summary}`);
    lines.push("");

    lines.push("## Performance & Quality Deltas");
    lines.push("");
    lines.push("| Metric | Baseline | Candidate | Delta |");
    lines.push("| :--- | :--- | :--- | :--- |");

    for (const [key, d] of Object.entries(report.deltas)) {
      const baseStr = typeof d.baseline === "number" ? d.baseline.toFixed(2) : String(d.baseline);
      const candStr = typeof d.candidate === "number" ? d.candidate.toFixed(2) : String(d.candidate);
      let deltaStr = "—";
      if (typeof d.delta === "number") {
        const sign = d.delta > 0 ? "+" : "";
        deltaStr = `${sign}${d.delta.toFixed(2)}`;
      }
      lines.push(`| \`${key}\` | \`${baseStr}\` | \`${candStr}\` | \`${deltaStr}\` |`);
    }
    lines.push("");

    if (report.regressions.length > 0) {
      lines.push("## ⚠️ Detected Regressions in Candidate");
      lines.push("");
      for (const r of report.regressions) {
        lines.push(`- **[${r.severity.toUpperCase()}]** ${r.message}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("*Note: Benchmark results represent performance on specific deterministic evaluation suites, not universal model superiority.*");

    return lines.join("\n");
  }
}
