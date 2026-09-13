/**
 * HackSync Phase 5: Retrieval Evaluator
 * Evaluates Phase 1 Hybrid Retrieval and Symbol Index against ground truth benchmarks.
 * Computes Hit@1, Hit@3, Hit@5, MRR, relevance coverage, context token budget compliance,
 * and verifies strict cross-project boundary isolation.
 */

import { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { HybridRetrievalEngine } from "../../intelligence/retrieval-engine";
import type { BenchmarkCase, CaseEvaluationResult, MetricValue } from "../types";
import { hitAtK, reciprocalRank, safeDivide } from "../metrics";

export class RetrievalEvaluator {
  /**
   * Evaluates a retrieval benchmark case against ground truth expectations.
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

    const projectId = caseItem.projectFixture.id || "bench-ret-project";
    const graph = new ProjectKnowledgeGraph(projectId);

    // Index all fixture files
    for (const file of caseItem.projectFixture.files) {
      graph.indexFile(file.path, file.content);
    }

    const query = caseItem.task.query;
    const retrievalResult = HybridRetrievalEngine.retrieve({
      query,
      graph,
      limit: 10,
    });

    const rankedFiles = retrievalResult.hits.map((h) => h.filePath);
    const rankedSymbols = retrievalResult.hits.flatMap((h) =>
      h.matchedSymbols.map((s) => s.name),
    );

    const expectedFiles = caseItem.expectedFiles || [];
    const expectedSymbols = caseItem.expectedSymbols || [];

    // 1. Calculate Hit@K and MRR
    const h1 = hitAtK(rankedFiles, expectedFiles, 1);
    const h3 = hitAtK(rankedFiles, expectedFiles, 3);
    const h5 = hitAtK(rankedFiles, expectedFiles, 5);
    const rr = reciprocalRank(rankedFiles, expectedFiles);

    // 2. Evaluate Symbol Retrieval
    let symbolMatched = false;
    if (expectedSymbols.length > 0) {
      const topSymbolsLower = rankedSymbols.map((s) => s.toLowerCase());
      symbolMatched = expectedSymbols.some((expSym) =>
        topSymbolsLower.includes(expSym.toLowerCase()),
      );
    } else {
      symbolMatched = true; // Not required
    }

    // 3. Project Boundary Isolation Check
    const allowedFileSet = new Set(caseItem.projectFixture.files.map((f) => f.path));
    const foreignFiles = rankedFiles.filter((path) => !allowedFileSet.has(path));
    const isolatedToProject = foreignFiles.length === 0;

    // 4. Context Budget Compliance (e.g., max 15000 chars of snippets)
    const MAX_CONTEXT_BUDGET_CHARS = 15000;
    const totalSnippetLength = retrievalResult.hits.reduce(
      (sum, h) => sum + (h.snippet ? h.snippet.length : 0),
      0,
    );
    const withinBudget = totalSnippetLength <= MAX_CONTEXT_BUDGET_CHARS;

    // 5. Overall Pass Condition & Score
    const fileFoundInTop5 = h5 === 1.0 || expectedFiles.length === 0;
    const passed = fileFoundInTop5 && symbolMatched && isolatedToProject && withinBudget;

    let score = 0;
    if (h1 === 1.0) score += 50;
    else if (h3 === 1.0) score += 35;
    else if (h5 === 1.0) score += 20;

    if (symbolMatched) score += 30;
    if (isolatedToProject) score += 10;
    if (withinBudget) score += 10;

    const notes: string[] = [];
    notes.push(`Ranked ${rankedFiles.length} file(s). Hit@1: ${h1}, Hit@3: ${h3}, Hit@5: ${h5}, RR: ${rr}.`);
    if (!isolatedToProject) {
      notes.push(`CRITICAL: Project isolation breached! Foreign files returned: ${foreignFiles.join(", ")}`);
    }
    if (!symbolMatched && expectedSymbols.length > 0) {
      notes.push(`Target symbol(s) [${expectedSymbols.join(", ")}] not found in top hits.`);
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
        hitAt1: h1,
        hitAt3: h3,
        hitAt5: h5,
        reciprocalRank: rr,
        symbolMatched: symbolMatched ? 1.0 : 0.0,
        isolatedToProject: isolatedToProject ? 1.0 : 0.0,
        withinBudget: withinBudget ? 1.0 : 0.0,
      },
      notes: notes.join(" "),
    };
  }
}
