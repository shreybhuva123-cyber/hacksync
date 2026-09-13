/**
 * Git Impact AI Tool — HackSync Phase 3
 * Calculates estimated blast radius, affected routes, database tables, and security sensitivities.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { ChangedSymbolsDetector } from "../../git/changed-symbols";
import { GitDiffEngine } from "../../git/git-diff";
import { GitImpactEngine, type GitImpactReport } from "../../git/git-impact";
import type { Workspace, MemberFile } from "../../types";

export interface GitImpactParams {
  repoPath?: string | undefined;
  staged?: boolean | undefined;
}

export class GitImpactTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: GitImpactParams = {},
    ws?: Workspace | null,
    memberFiles: MemberFile[] = [],
  ): Promise<GitImpactReport> {
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

    return GitImpactEngine.analyze({
      fileDiffs: diffReport.files,
      changedSymbols,
      graph,
    });
  }
}
