/**
 * Git Diff AI Tool — HackSync Phase 3
 * Returns parsed unified diffs with structured hunks and additions/deletions.
 * Strictly READ_ONLY.
 */

import { GitDiffEngine, type GitDiffReport } from "../../git/git-diff";
import type { Workspace, MemberFile } from "../../types";

export interface GitDiffToolParams {
  repoPath?: string | undefined;
  staged?: boolean | undefined;
  commitRange?: string | undefined;
  fileFilter?: string | undefined;
}

export class GitDiffTool {
  static async execute(
    params: GitDiffToolParams = {},
    ws?: Workspace | null,
    memberFiles: MemberFile[] = [],
  ): Promise<GitDiffReport> {
    if (params.repoPath) {
      try {
        return await GitDiffEngine.getDiffFromCli(params.repoPath, {
          staged: params.staged,
          commitRange: params.commitRange,
          fileFilter: params.fileFilter,
        });
      } catch {
        // Fall back to workspace if CLI fails
      }
    }

    if (ws) {
      return GitDiffEngine.getDiffFromWorkspace(ws, memberFiles);
    }

    return {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      totalChangedFiles: 0,
      summaryText: "0 file(s) changed, +0 additions, -0 deletions",
    };
  }
}
