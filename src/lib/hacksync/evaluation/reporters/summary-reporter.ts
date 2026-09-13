/**
 * HackSync Phase 5: Markdown Summary Reporter
 * Generates an executive Markdown report summarizing benchmark results,
 * category breakdowns, metric tables, failure traces, and detected regressions.
 */

import type { BenchmarkRun } from "../types";
import { formatMetric } from "../metrics";

export class SummaryReporter {
  /**
   * Formats a complete markdown quality and benchmarking report.
   */
  static format(run: BenchmarkRun): string {
    const lines: string[] = [];

    lines.push("# HackSync AI Quality & Benchmarking Report");
    lines.push("");
    lines.push(`**Run ID**: \`${run.runId}\` | **Status**: \`${run.status.toUpperCase()}\` | **Version**: \`${run.versionCommit}\``);
    lines.push(`**Provider / Model**: \`${run.provider}\` / \`${run.model}\` | **Benchmark Version**: \`${run.benchmarkVersion}\``);
    lines.push(`**Started**: ${run.startedAt} | **Completed**: ${run.completedAt} | **Duration**: ${run.latencyMs}ms`);
    lines.push("");

    // Overall Score Banner
    lines.push("## Overall Quality Score");
    lines.push("");
    lines.push(`> ### **Overall Score: ${run.overallScore} / 100**`);
    lines.push(`> Passed: **${run.passedCases}** / **${run.caseCount}** cases (${((run.passedCases / (run.caseCount || 1)) * 100).toFixed(1)}%) | Errors: **${run.errorCount}**`);
    lines.push("");

    // Category Breakdown Table
    lines.push("## Category Breakdown");
    lines.push("");
    lines.push("| Category | Score | Status |");
    lines.push("| :--- | :--- | :--- |");

    const categoryEntries = Object.entries(run.categoryScores);
    if (categoryEntries.length > 0) {
      for (const [cat, score] of categoryEntries) {
        const icon = (score as number) >= 80 ? "✅" : (score as number) >= 60 ? "⚠️" : "❌";
        lines.push(`| \`${cat}\` | **${score}/100** | ${icon} |`);
      }
    } else {
      lines.push("| *No category scores recorded* | — | — |");
    }
    lines.push("");

    // Key Performance Metrics Table
    lines.push("## Key Evaluation Metrics");
    lines.push("");
    lines.push("| Metric | Value | Meaning |");
    lines.push("| :--- | :--- | :--- |");

    const metricNames: Record<string, string> = {
      security_accuracy: "SAST Vulnerability Detection Rate",
      retrieval_hit5: "Retrieval Hit@5 Accuracy",
      fix_success: "Fix Generation & Verification Rate",
      passedRatio: "Overall Case Pass Ratio",
    };

    for (const [key, label] of Object.entries(metricNames)) {
      if (run.metrics[key] !== undefined) {
        const valStr = formatMetric(run.metrics[key]);
        lines.push(`| **${label}** | \`${valStr}\` | Verified ground-truth accuracy |`);
      }
    }
    lines.push("");

    // Regression Section
    if (run.regressions && run.regressions.length > 0) {
      lines.push("## ⚠️ Detected Regressions");
      lines.push("");
      for (const reg of run.regressions) {
        lines.push(`- **[${reg.severity.toUpperCase()}]** \`${reg.metric}\`: ${reg.message}`);
      }
      lines.push("");
    }

    // Detailed Case Failures
    const failedCases = run.results.filter((r) => !r.passed);
    if (failedCases.length > 0) {
      lines.push("## Failed Benchmark Cases");
      lines.push("");
      for (const f of failedCases) {
        lines.push(`### ❌ Case: \`${f.caseId}\` — ${f.name}`);
        lines.push(`- **Category**: \`${f.category}\` | **Score**: ${f.score}/100 | **Latency**: ${f.latencyMs}ms`);
        lines.push(`- **Evaluation Method**: \`${f.evaluationMethod}\``);
        lines.push(`- **Notes**: ${f.notes}`);
        if (f.error) {
          lines.push(`- **Error**: \`${f.error}\``);
        }
        lines.push("");
      }
    } else {
      lines.push("## Case Results");
      lines.push("");
      lines.push("🎉 All evaluated benchmark cases passed ground truth verification.");
      lines.push("");
    }

    return lines.join("\n");
  }
}
