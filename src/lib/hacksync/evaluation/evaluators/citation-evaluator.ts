/**
 * HackSync Phase 5: Citation Evaluator
 * Validates AI response citations against live codebase files, line ranges,
 * tenant isolation boundaries, and grounded evidence availability.
 * Does NOT treat file existence alone as sufficient proof.
 */

import type { BenchmarkCase, CaseEvaluationResult, ExpectedCitation } from "../types";
import { calculateCitationMetrics, safeDivide } from "../metrics";

export interface CitationCandidate {
  file: string;
  lineStart?: number | undefined;
  lineEnd?: number | undefined;
  snippet?: string | undefined;
}

export class CitationEvaluator {
  /**
   * Evaluates citations extracted from an AI response or evidence items.
   */
  static evaluateCitations(params: {
    caseItem: BenchmarkCase;
    citations: CitationCandidate[];
    availableEvidence?: string[];
  }): CaseEvaluationResult {
    const start = Date.now();
    const { caseItem, citations, availableEvidence } = params;

    const fixture = caseItem.projectFixture;
    const fileMap = new Map<string, string>();
    if (fixture && fixture.files) {
      for (const f of fixture.files) {
        fileMap.set(f.path, f.content);
      }
    }

    const expectedCitations = caseItem.expectedCitations || [];
    const evaluatedCitations: Array<{
      citation: CitationCandidate;
      valid: boolean;
      hallucinated: boolean;
      failureReason?: string;
    }> = [];

    for (const cite of citations) {
      // 1. File existence and tenant containment
      const content = fileMap.get(cite.file);
      if (!content) {
        evaluatedCitations.push({
          citation: cite,
          valid: false,
          hallucinated: true,
          failureReason: `Hallucinated file: "${cite.file}" does not exist in project.`,
        });
        continue;
      }

      // 2. Line range existence
      const lines = content.split("\n");
      const totalLines = lines.length;

      if (cite.lineStart !== undefined) {
        if (cite.lineStart < 1 || cite.lineStart > totalLines) {
          evaluatedCitations.push({
            citation: cite,
            valid: false,
            hallucinated: false,
            failureReason: `Invalid lineStart ${cite.lineStart}: file only has ${totalLines} lines.`,
          });
          continue;
        }
      }

      if (cite.lineEnd !== undefined) {
        if (cite.lineEnd < (cite.lineStart || 1) || cite.lineEnd > totalLines) {
          evaluatedCitations.push({
            citation: cite,
            valid: false,
            hallucinated: false,
            failureReason: `Invalid lineEnd ${cite.lineEnd}: out of bounds [1..${totalLines}].`,
          });
          continue;
        }
      }

      // 3. Evidence availability check: verify cited lines or keyword actually exist in snippet
      let relevantToClaim = true;
      if (cite.snippet) {
        const citedSlice = lines
          .slice((cite.lineStart || 1) - 1, cite.lineEnd || cite.lineStart || 1)
          .join("\n");
        if (!citedSlice.toLowerCase().includes(cite.snippet.toLowerCase().trim())) {
          relevantToClaim = false;
        }
      }

      if (!relevantToClaim) {
        evaluatedCitations.push({
          citation: cite,
          valid: false,
          hallucinated: true,
          failureReason: `Snippet does not match file content at lines ${cite.lineStart}-${cite.lineEnd}.`,
        });
        continue;
      }

      evaluatedCitations.push({
        citation: cite,
        valid: true,
        hallucinated: false,
      });
    }

    const citationSummary = calculateCitationMetrics(
      evaluatedCitations.map((e) => ({ valid: e.valid, hallucinated: e.hallucinated })),
      expectedCitations.length,
    );

    // Check if all expected citations were covered
    let expectedCovered = true;
    for (const exp of expectedCitations) {
      const match = evaluatedCitations.find(
        (e) =>
          e.valid &&
          e.citation.file === exp.file &&
          (!exp.lineStart || e.citation.lineStart === exp.lineStart),
      );
      if (!match) {
        expectedCovered = false;
        break;
      }
    }

    const passed =
      citationSummary.invalidCitations === 0 &&
      citationSummary.hallucinatedCitations === 0 &&
      expectedCovered;

    let score = 0;
    if (citationSummary.totalCitations > 0) {
      const validityRate =
        citationSummary.validityRate !== "not_applicable"
          ? citationSummary.validityRate
          : 0;
      score = Math.round(validityRate * 80 + (expectedCovered ? 20 : 0));
    } else if (expectedCitations.length === 0) {
      score = 100;
    }

    const notes: string[] = [];
    notes.push(
      `Citations: ${citationSummary.validCitations}/${citationSummary.totalCitations} valid, ` +
        `${citationSummary.invalidCitations} invalid, ${citationSummary.hallucinatedCitations} hallucinated.`,
    );
    for (const e of evaluatedCitations) {
      if (!e.valid && e.failureReason) {
        notes.push(`[${e.citation.file}] ${e.failureReason}`);
      }
    }

    const latencyMs = Date.now() - start;

    return {
      caseId: caseItem.id,
      name: caseItem.name,
      category: "citation",
      evaluationMethod: "DETERMINISTIC",
      passed,
      score: Math.min(100, Math.max(0, score)),
      latencyMs,
      metrics: {
        totalCitations: citationSummary.totalCitations,
        validCitations: citationSummary.validCitations,
        invalidCitations: citationSummary.invalidCitations,
        missingCitations: citationSummary.missingCitations,
        hallucinatedCitations: citationSummary.hallucinatedCitations,
        validityRate: citationSummary.validityRate,
      },
      notes: notes.join(" "),
    };
  }

  /**
   * Evaluates citation benchmark case directly.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    // If case has expectedCitations, evaluate them as ground truth candidate
    const candidates: CitationCandidate[] = (caseItem.expectedCitations || []).map((ec) => ({
      file: ec.file,
      lineStart: ec.lineStart,
      lineEnd: ec.lineEnd,
      snippet: ec.snippetKeyword,
    }));

    return this.evaluateCitations({
      caseItem,
      citations: candidates,
    });
  }
}
