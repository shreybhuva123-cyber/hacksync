/**
 * Structured Git Status Service — HackSync Phase 3
 * Parses porcelain git status and branches into strongly typed status reports.
 */

import { GitSafety } from "./git-safety";
import type { Workspace, MemberFile } from "../types";

export interface StatusFileEntry {
  path: string;
  origPath?: string | undefined;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export interface GitStatusSummary {
  branch: string;
  isClean: boolean;
  totalChangedFiles: number;
  staged: StatusFileEntry[];
  unstaged: StatusFileEntry[];
  untracked: string[];
  deleted: string[];
  renamed: { from: string; to: string }[];
  state: "clean" | "dirty";
}

export class GitStatusManager {
  /**
   * Reads git status using the safe Git CLI runner.
   */
  static async getStatusFromCli(repoPath: string): Promise<GitStatusSummary> {
    // 1. Get branch
    const branchRes = await GitSafety.runSafeGit(repoPath, ["branch", "--show-current"]);
    const branch = branchRes.stdout.trim() || "main";

    // 2. Get porcelain status
    const statusRes = await GitSafety.runSafeGit(repoPath, ["status", "--porcelain=v1", "-u"]);
    if (statusRes.exitCode !== 0) {
      return { isClean: false, totalChangedFiles: 0, error: statusRes.stderr || 'Git command failed', summaryText: 'Git error: unable to determine status' } as any;
    }
    const output = statusRes.stdout;

    return this.parsePorcelainOutput(output, branch);
  }

  /**
   * Parses standard porcelain v1 status lines.
   */
  static parsePorcelainOutput(output: string, branch = "main"): GitStatusSummary {
    const staged: StatusFileEntry[] = [];
    const unstaged: StatusFileEntry[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];
    const renamed: { from: string; to: string }[] = [];

    const lines = output.split("\n");

    for (const line of lines) {
      if (!line || line.length < 3) continue;

      const x = line[0];
      const y = line[1];
      const rawPath = line.substring(3).trim();

      // Untracked
      if (x === "?" && y === "?") {
        untracked.push(rawPath);
        continue;
      }

      // Renamed
      if (x === "R" || y === "R") {
        const parts = rawPath.split(" -> ");
        if (parts.length === 2 && parts[0] && parts[1]) {
          renamed.push({ from: parts[0].trim(), to: parts[1].trim() });
          staged.push({
            path: parts[1].trim(),
            origPath: parts[0].trim(),
            status: "renamed",
            staged: true,
          });
        }
        continue;
      }

      // Staged changes (Index)
      if (x && x !== " " && x !== "?") {
        let statusType: StatusFileEntry["status"] = "modified";
        if (x === "A") statusType = "added";
        else if (x === "D") {
          statusType = "deleted";
          deleted.push(rawPath);
        }

        staged.push({
          path: rawPath,
          status: statusType,
          staged: true,
        });
      }

      // Unstaged changes (Working tree)
      if (y && y !== " " && y !== "?") {
        let statusType: StatusFileEntry["status"] = "modified";
        if (y === "D") {
          statusType = "deleted";
          if (!deleted.includes(rawPath)) deleted.push(rawPath);
        }

        unstaged.push({
          path: rawPath,
          status: statusType,
          staged: false,
        });
      }
    }

    const totalChangedFiles = staged.length + unstaged.length + untracked.length;
    const isClean = totalChangedFiles === 0;

    return {
      branch,
      isClean,
      totalChangedFiles,
      staged,
      unstaged,
      untracked,
      deleted,
      renamed,
      state: isClean ? "clean" : "dirty",
    };
  }

  /**
   * In-memory fallback computation from Workspace nodes and memberFiles.
   */
  static getStatusFromWorkspace(ws: Workspace, memberFiles: MemberFile[] = []): GitStatusSummary {
    const staged: StatusFileEntry[] = [];
    const unstaged: StatusFileEntry[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];
    const renamed: { from: string; to: string }[] = [];

    const sharedMap = new Map<string, string>();
    ws.codeNodes?.forEach((n) => {
      if (n.kind !== "folder") sharedMap.set(n.path, n.content || "");
    });

    memberFiles.forEach((mf) => {
      const path = mf.relative_path || (mf as any).path || mf.file_name;
      if (!path) return;

      if (!sharedMap.has(path)) {
        untracked.push(path);
      } else if (sharedMap.get(path) !== mf.content) {
        unstaged.push({
          path,
          status: "modified",
          staged: false,
        });
      }
    });

    const totalChangedFiles = staged.length + unstaged.length + untracked.length;
    const isClean = totalChangedFiles === 0;

    return {
      branch: ws.project.default_branch || "main",
      isClean,
      totalChangedFiles,
      staged,
      unstaged,
      untracked,
      deleted,
      renamed,
      state: isClean ? "clean" : "dirty",
    };
  }
}
