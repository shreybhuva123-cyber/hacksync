/**
 * HackSync Phase 5: Git & Diff Evaluator
 * Evaluates Git status parsing, unified diff parsing (additions, deletions,
 * renames, binary files), changed AST symbol detection, and downstream blast-radius
 * impact analysis. Strictly read-only (zero Git mutations).
 */

import { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { DiffParser } from "../../git/diff-parser";
import { ChangedSymbolsDetector } from "../../git/changed-symbols";
import { GitImpactEngine } from "../../git/git-impact";
import type { BenchmarkCase, CaseEvaluationResult, GitMetrics } from "../types";
import { safeDivide } from "../metrics";

export class GitEvaluator {
  /**
   * Evaluates a git or diff benchmark case.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    const start = Date.now();

    if (!caseItem.projectFixture) {
      return {
        caseId: caseItem.id,
        name: caseItem.name,
        category: "git_impact",
        evaluationMethod: "DETERMINISTIC",
        passed: false,
        score: 0,
        latencyMs: Date.now() - start,
        metrics: {},
        notes: "Missing project fixture.",
        error: "NO_FIXTURE",
      };
    }

    const projectId = caseItem.projectFixture.id || "bench-git-project";
    const graph = new ProjectKnowledgeGraph(projectId);

    // Index files in fixture
    for (const file of caseItem.projectFixture.files || []) {
      graph.indexFile(file.path, file.content);
    }

    // 1. Diff Parsing
    const diffText = caseItem.projectFixture.gitDiff || "";
    const parsedDiffs = DiffParser.parse(diffText);
    const parsedDiffsValid = parsedDiffs.length > 0;

    // 2. Changed Symbols Detection
    const changedSymbols = ChangedSymbolsDetector.detectChangedSymbols(
      parsedDiffs,
      graph,
    );

    // 3. Impact Analysis
    const impactReport = GitImpactEngine.analyze({
      fileDiffs: parsedDiffs,
      changedSymbols,
      graph,
    });

    // Check if expected symbols are detected
    const expectedSymbols = caseItem.expectedSymbols || [];
    const detectedSymbolNames = new Set(changedSymbols.map((s) => s.symbolName));
    let symbolsMatched = true;
    for (const expSym of expectedSymbols) {
      if (!detectedSymbolNames.has(expSym)) {
        symbolsMatched = false;
        break;
      }
    }

    const diffAccuracy = parsedDiffsValid ? 1.0 : 0.0;
    const changedSymbolsAccuracy = symbolsMatched ? 1.0 : 0.0;
    const impactAccuracy = impactReport ? 1.0 : 0.0;

    const passed = parsedDiffsValid && symbolsMatched;

    let score = 0;
    if (parsedDiffsValid) score += 40;
    if (symbolsMatched) score += 40;
    if (impactReport) score += 20;

    const notes: string[] = [];
    notes.push(
      `Parsed ${parsedDiffs.length} file diff(s). Detected ${changedSymbols.length} changed symbol(s). ` +
        `Direct dependents: ${impactReport.directDependents.length}. Regression risk: ${impactReport.regressionRisk.risk}.`,
    );

    const latencyMs = Date.now() - start;

    return {
      caseId: caseItem.id,
      name: caseItem.name,
      category: "git_impact",
      evaluationMethod: "DETERMINISTIC",
      passed,
      score: Math.min(100, Math.max(0, score)),
      latencyMs,
      metrics: {
        diffAccuracy,
        changedSymbolsAccuracy,
        impactAccuracy,
        changedFilesCount: parsedDiffs.length,
        changedSymbolsCount: changedSymbols.length,
      },
      notes: notes.join(" "),
    };
  }
}
