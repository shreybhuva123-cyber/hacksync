/**
 * Safe Git Diff Engine — HackSync Phase 3
 * Obtains and parses working tree, staged, or commit range diffs using GitSafety and DiffParser.
 */

import { GitSafety } from "./git-safety";
import { DiffParser, type ParsedFileDiff } from "./diff-parser";
import type { Workspace, MemberFile } from "../types";
import { diffLines } from "../merge-engine";

export interface GitDiffReport {
  files: ParsedFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalChangedFiles: number;
  summaryText: string;
}

export class GitDiffEngine {
  /**
   * Retrieves and parses git diff via safe CLI runner.
   */
  static async getDiffFromCli(
    repoPath: string,
    options?: {
      staged?: boolean | undefined;
      commitRange?: string | undefined;
      fileFilter?: string | undefined;
    },
  ): Promise<GitDiffReport> {
    const args: string[] = ["diff", "--unified=3"];

    if (options?.staged) {
      args.push("--cached");
    } else if (options?.commitRange) {
      args.push(options.commitRange);
    }

    if (options?.fileFilter) {
      args.push("--", options.fileFilter);
    }

    const res = await GitSafety.runSafeGit(repoPath, args);
    const rawDiff = res.stdout;

    const files = DiffParser.parse(rawDiff);
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
    }

    const summaryText = `${files.length} file(s) changed, +${totalAdditions} additions, -${totalDeletions} deletions`;

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalChangedFiles: files.length,
      summaryText,
    };
  }

  /**
   * In-memory diff generation between Workspace shared nodes and memberFiles.
   */
  static getDiffFromWorkspace(ws: Workspace, memberFiles: MemberFile[] = []): GitDiffReport {
    const files: ParsedFileDiff[] = [];
    const sharedMap = new Map<string, string>();

    ws.codeNodes?.forEach((n) => {
      if (n.kind !== "folder") sharedMap.set(n.path, n.content || "");
    });

    for (const mf of memberFiles) {
      const path = mf.relative_path || (mf as any).path || mf.file_name;
      if (!path) continue;

      const sharedContent = sharedMap.get(path);

      if (sharedContent === undefined) {
        // Added file
        const lines = (mf.content || "").split("\n");
        const hunkLines = lines.map((l) => `+${l}`);
        files.push({
          oldPath: "",
          newPath: path,
          changeType: "added",
          additions: lines.length,
          deletions: 0,
          binary: false,
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: lines.length,
              header: "",
              lines: hunkLines,
            },
          ],
          patchSnippet: `+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` + hunkLines.slice(0, 15).join("\n"),
        });
      } else if (sharedContent !== mf.content) {
        // Modified file
        const diffChunks = diffLines(sharedContent, mf.content || "");
        let additions = 0;
        let deletions = 0;
        const hunkLines: string[] = [];

        for (const chunk of diffChunks) {
          if (chunk.type === "add") {
            additions += chunk.lines.length;
            chunk.lines.forEach((l) => hunkLines.push(`+${l}`));
          } else if (chunk.type === "remove") {
            deletions += chunk.lines.length;
            chunk.lines.forEach((l) => hunkLines.push(`-${l}`));
          } else {
            chunk.lines.slice(0, 3).forEach((l) => hunkLines.push(` ${l}`));
          }
        }

        files.push({
          oldPath: path,
          newPath: path,
          changeType: "modified",
          additions,
          deletions,
          binary: false,
          hunks: [
            {
              oldStart: 1,
              oldLines: sharedContent.split("\n").length,
              newStart: 1,
              newLines: (mf.content || "").split("\n").length,
              header: "",
              lines: hunkLines,
            },
          ],
          patchSnippet: `--- a/${path}\n+++ b/${path}\n` + hunkLines.slice(0, 20).join("\n"),
        });
      }
    }

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
    }

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalChangedFiles: files.length,
      summaryText: `${files.length} file(s) changed, +${totalAdditions} additions, -${totalDeletions} deletions`,
    };
  }
}
