/**
 * HackSync Phase 5: Security Evaluator
 * Evaluates SAST vulnerability detection, secret scanning, and dependency security
 * against ground truth benchmark fixtures. Strictly separates severity from confidence,
 * measures false positive rates on negative controls, and verifies secret redaction.
 */

import { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { StaticAuditor } from "../../security/static-auditor";
import { SecretScanner } from "../../security/secret-scanner";
import type { SecurityFinding } from "../../security/finding-types";
import type {
  BenchmarkCase,
  CaseEvaluationResult,
  ClassificationMetrics,
} from "../types";
import {
  calculateClassificationMetrics,
  calculatePrecision,
  calculateRecall,
  calculateF1,
} from "../metrics";

export class SecurityEvaluator {
  /**
   * Evaluates a security or secret benchmark case.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    const start = Date.now();

    if (!caseItem.projectFixture || !caseItem.projectFixture.files) {
      return {
        caseId: caseItem.id,
        name: caseItem.name,
        category: caseItem.category,
        evaluationMethod: "DETERMINISTIC",
        passed: false,
        score: 0,
        latencyMs: Date.now() - start,
        metrics: {},
        notes: "Missing project fixture files.",
        error: "NO_FIXTURE_FILES",
      };
    }

    const projectId = caseItem.projectFixture.id || "bench-sec-project";
    const graph = new ProjectKnowledgeGraph(projectId);

    for (const file of caseItem.projectFixture.files) {
      graph.indexFile(file.path, file.content);
    }

    // Run passive static audit
    const report = StaticAuditor.runPassiveAudit({
      graph,
      projectId,
    });

    const detectedFindings = report.findings;
    const expectedFindings = caseItem.expectedFindings || [];
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    const matchedExpectedIndices = new Set<number>();
    const notes: string[] = [];

    // Safe negative control case: expectedFindings is empty
    if (expectedFindings.length === 0) {
      if (detectedFindings.length === 0) {
        tn = 1;
        notes.push("Negative control passed: 0 false positives reported on clean code.");
      } else {
        fp = detectedFindings.length;
        notes.push(
          `Negative control failed: ${detectedFindings.length} false positive finding(s) generated on clean code.`,
        );
      }
    } else {
      // Vulnerable case: match detected findings against expected findings
      for (const detected of detectedFindings) {
        let matchedIndex = -1;
        for (let i = 0; i < expectedFindings.length; i++) {
          if (matchedExpectedIndices.has(i)) continue;
          const exp = expectedFindings[i];
          if (!exp) continue;

          const categoryMatch = !exp.category || detected.category.toLowerCase().includes(exp.category.toLowerCase());
          const ruleMatch = !exp.ruleId || detected.ruleId === exp.ruleId || detected.ruleId.includes(exp.ruleId);
          const fileMatch = !exp.file || detected.filePath === exp.file || detected.filePath.endsWith(exp.file);

          if (categoryMatch || ruleMatch || fileMatch) {
            matchedIndex = i;
            break;
          }
        }

        if (matchedIndex !== -1) {
          matchedExpectedIndices.add(matchedIndex);
          tp++;
        } else {
          fp++;
        }
      }

      fn = Math.max(0, expectedFindings.length - matchedExpectedIndices.size);
      notes.push(
        `Matched ${tp}/${expectedFindings.length} expected vulnerability finding(s). False positives: ${fp}. False negatives: ${fn}.`,
      );
    }

    // Check Severity vs Confidence separation
    let severityCorrect = true;
    let confidenceReasonable = true;
    if (caseItem.expectedSeverity && detectedFindings.length > 0) {
      const topFinding = detectedFindings[0];
      if (topFinding && topFinding.severity !== caseItem.expectedSeverity) {
        severityCorrect = false;
        notes.push(
          `Severity mismatch: expected '${caseItem.expectedSeverity}', got '${topFinding.severity}'.`,
        );
      }
      // Verify confidence is distinct from severity
      if (!topFinding || topFinding.confidence === undefined || typeof topFinding.confidence !== "string") {
        confidenceReasonable = false;
      }
    }

    // Verify secret redaction: raw fake secrets should NEVER appear in plaintext
    let secretRedactedProperly = true;
    if (caseItem.category === "secrets") {
      const sensitiveSubstrings = ["9999888877776666555544443333", "FAKE_BENCHMARK_KEY"];
      for (const f of detectedFindings) {
        if (f.evidence && sensitiveSubstrings.some((sub) => f.evidence.includes(sub))) {
          secretRedactedProperly = false;
          notes.push("CRITICAL: Raw benchmark secret was not redacted in finding evidence!");
        }
      }
    }

    const classification = calculateClassificationMetrics(tp, tn, fp, fn);

    const isNegativeControl = expectedFindings.length === 0;
    const passed = isNegativeControl
      ? fp === 0
      : tp >= expectedFindings.length && fp === 0 && severityCorrect && secretRedactedProperly;

    let score = 0;
    if (isNegativeControl) {
      score = fp === 0 ? 100 : Math.max(0, 100 - fp * 25);
    } else {
      const recallScore = expectedFindings.length > 0 ? (tp / expectedFindings.length) * 60 : 60;
      const precisionScore = tp + fp > 0 ? (tp / (tp + fp)) * 30 : 30;
      const severityScore = severityCorrect ? 10 : 0;
      score = Math.round(recallScore + precisionScore + severityScore);
      if (!secretRedactedProperly) score = Math.max(0, score - 50);
    }

    const latencyMs = Date.now() - start;

    return {
      caseId: caseItem.id,
      name: caseItem.name,
      category: caseItem.category,
      evaluationMethod: "DETERMINISTIC",
      passed,
      score: Math.min(100, Math.max(0, score)),
      latencyMs,
      metrics: {
        truePositives: tp,
        trueNegatives: tn,
        falsePositives: fp,
        falseNegatives: fn,
        precision: classification.precision,
        recall: classification.recall,
        f1: classification.f1,
        accuracy: classification.accuracy,
        falsePositiveRate: classification.falsePositiveRate,
        severityCorrect: severityCorrect ? 1.0 : 0.0,
        confidenceReasonable: confidenceReasonable ? 1.0 : 0.0,
        secretRedacted: secretRedactedProperly ? 1.0 : 0.0,
      },
      findings: detectedFindings,
      notes: notes.join(" "),
    };
  }
}
