import type { Workspace, CodeNode, MemberFile } from "../types";
import { diffLines, type DiffChunk } from "../merge-engine";
import { GitDiffEngine, type GitDiffReport } from "./git-diff";
import { ChangedSymbolsDetector, type ChangedSymbol } from "./changed-symbols";
import { GitImpactEngine, type GitImpactReport } from "./git-impact";
import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";

export interface FileDiffSummary {
  filePath: string;
  status: "added" | "modified" | "deleted" | "unchanged";
  additions: number;
  deletions: number;
  diffItems: DiffChunk[];
  patchSnippet: string;
}

export interface GitStatusSummary {
  branch: string;
  isClean: boolean;
  totalChangedFiles: number;
  changedFiles: FileDiffSummary[];
}

export class GitAnalyzer {
  /**
   * Compares local staged files / working changes against shared project nodes.
   */
  static getStatus(ws: Workspace, memberFiles: MemberFile[] = []): GitStatusSummary {
    const changedFiles: FileDiffSummary[] = [];
    const sharedNodesMap = new Map<string, CodeNode>();

    ws.codeNodes?.forEach((node) => {
      if (node.kind !== "folder") {
        sharedNodesMap.set(node.path, node);
      }
    });

    // Check member files for modifications or additions
    memberFiles.forEach((mf) => {
      const path = mf.relative_path || (mf as any).path || mf.file_name;
      if (!path) return;

      const shared = sharedNodesMap.get(path);
      if (!shared) {
        // Newly added file
        const lines = (mf.content || "").split("\n");
        changedFiles.push({
          filePath: path,
          status: "added",
          additions: lines.length,
          deletions: 0,
          diffItems: [{ type: "add", lines, oldStart: 1, newStart: 1 }],
          patchSnippet: `+++ b/${path}\n@@ +1,${lines.length} @@\n` + lines.slice(0, 10).map((l) => `+${l}`).join("\n"),
        });
      } else if (shared.content !== mf.content) {
        // Modified file
        const diffs = diffLines(shared.content || "", mf.content || "");
        const additions = diffs
          .filter((d) => d.type === "add")
          .reduce((sum, d) => sum + d.lines.length, 0);
        const deletions = diffs
          .filter((d) => d.type === "remove")
          .reduce((sum, d) => sum + d.lines.length, 0);

        const patchSnippet =
          `--- a/${path}\n+++ b/${path}\n` +
          diffs
            .slice(0, 15)
            .map((d) => {
              const prefix = d.type === "add" ? "+" : d.type === "remove" ? "-" : " ";
              return d.lines.map((l) => `${prefix}${l}`).join("\n");
            })
            .join("\n");

        changedFiles.push({
          filePath: path,
          status: "modified",
          additions,
          deletions,
          diffItems: diffs,
          patchSnippet,
        });
      }
    });

    return {
      branch: ws.project.default_branch || "main",
      isClean: changedFiles.length === 0,
      totalChangedFiles: changedFiles.length,
      changedFiles,
    };
  }

  /**
   * Reviews latest changes for potential bugs, security issues, or regressions.
   */
  static reviewChanges(ws: Workspace, memberFiles: MemberFile[] = []): string {
    const status = this.getStatus(ws, memberFiles);

    if (status.isClean) {
      return `### 🌿 Git Working Tree Clean\n\nNo uncommitted changes detected on branch \`${status.branch}\`. All files are in sync with the shared project base.`;
    }

    const report =
      `### 📝 Git Diff & Change Review (${status.totalChangedFiles} file(s) modified)\n\n` +
      `**Current Branch**: \`${status.branch}\`\n\n` +
      status.changedFiles
        .map((cf) => {
          return (
            `#### 📄 \`${cf.filePath}\` (${cf.status.toUpperCase()}) · +${cf.additions} / -${cf.deletions}\n\n` +
            `\`\`\`diff\n${cf.patchSnippet}\n\`\`\`\n`
          );
        })
        .join("\n---\n\n");

    return report;
  }

  /**
   * Phase 3: Generates a parsed GitDiffReport with structured hunks.
   */
  static getDiff(ws: Workspace, memberFiles: MemberFile[] = []): GitDiffReport {
    return GitDiffEngine.getDiffFromWorkspace(ws, memberFiles);
  }

  /**
   * Phase 3: Detects changed AST symbols from diffs.
   */
  static getChangedSymbols(
    ws: Workspace,
    memberFiles: MemberFile[] = [],
    graph?: ProjectKnowledgeGraph,
  ): ChangedSymbol[] {
    const diffReport = GitDiffEngine.getDiffFromWorkspace(ws, memberFiles);
    if (!graph) return [];
    return ChangedSymbolsDetector.detectChangedSymbols(diffReport.files, graph);
  }

  /**
   * Phase 3: Analyzes blast radius, affected routes, and security-sensitive changes.
   */
  static getImpact(
    ws: Workspace,
    memberFiles: MemberFile[] = [],
    graph?: ProjectKnowledgeGraph,
  ): GitImpactReport {
    const diffReport = GitDiffEngine.getDiffFromWorkspace(ws, memberFiles);
    if (!graph) {
      throw new Error("ProjectKnowledgeGraph is required to compute Git impact.");
    }
    const changedSymbols = ChangedSymbolsDetector.detectChangedSymbols(diffReport.files, graph);
    return GitImpactEngine.analyze({
      fileDiffs: diffReport.files,
      changedSymbols,
      graph,
    });
  }
}
