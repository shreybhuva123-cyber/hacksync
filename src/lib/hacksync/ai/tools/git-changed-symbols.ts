/**
 * Git Changed Symbols AI Tool — HackSync Phase 3
 * Correlates working diff hunks with AST symbols to map changed functions, classes, and routes.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { ChangedSymbolsDetector, type ChangedSymbol } from "../../git/changed-symbols";
import { GitDiffEngine } from "../../git/git-diff";
import type { Workspace, MemberFile } from "../../types";

export interface GitChangedSymbolsParams {
  repoPath?: string | undefined;
  staged?: boolean | undefined;
}

export class GitChangedSymbolsTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: GitChangedSymbolsParams = {},
    ws?: Workspace | null,
    memberFiles: MemberFile[] = [],
  ): Promise<{ totalChangedSymbols: number; changedSymbols: ChangedSymbol[] }> {
    let diffReport = ws ? GitDiffEngine.getDiffFromWorkspace(ws, memberFiles) : undefined;

    if (params.repoPath) {
      try {
        diffReport = await GitDiffEngine.getDiffFromCli(params.repoPath, { staged: params.staged });
      } catch {
        // Fall back to workspace diff
      }
    }

    if (!diffReport) {
      diffReport = {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        totalChangedFiles: 0,
        summaryText: "0 file(s) changed",
      };
    }

    const changedSymbols = ChangedSymbolsDetector.detectChangedSymbols(diffReport.files, graph);

    return {
      totalChangedSymbols: changedSymbols.length,
      changedSymbols,
    };
  }
}
