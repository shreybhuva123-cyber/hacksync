/**
 * Git Status AI Tool — HackSync Phase 3
 * Returns structured repository status (branch, staged, unstaged, untracked, isClean).
 * Strictly READ_ONLY.
 */

import { GitStatusManager, type GitStatusSummary } from "../../git/git-status";
import type { Workspace, MemberFile } from "../../types";

export interface GitStatusToolParams {
  repoPath?: string | undefined;
}

export class GitStatusTool {
  static async execute(
    params: GitStatusToolParams = {},
    ws?: Workspace | null,
    memberFiles: MemberFile[] = [],
  ): Promise<GitStatusSummary> {
    if (params.repoPath) {
      try {
        return await GitStatusManager.getStatusFromCli(params.repoPath);
      } catch {
        // Fall back to workspace if CLI fails
      }
    }

    if (ws) {
      return GitStatusManager.getStatusFromWorkspace(ws, memberFiles);
    }

    // Default clean status if no context provided
    return {
      branch: "main",
      isClean: true,
      totalChangedFiles: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      deleted: [],
      renamed: [],
      state: "clean",
    };
  }
}
