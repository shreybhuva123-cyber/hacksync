/**
 * Changed Symbol Detection Engine — HackSync Phase 3
 * Correlates unified diff hunks with Phase 1 AST symbol tables to identify modified functions,
 * classes, routes, components, and database operations.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { ParsedFileDiff } from "./diff-parser";
import type { SymbolKind } from "../intelligence/parsers/parser-interface";

export interface ChangedSymbol {
  filePath: string;
  symbolName: string;
  symbolKind: SymbolKind | "route" | "database_call";
  changeType: "added" | "modified" | "deleted";
  hunkHeader?: string | undefined;
  oldRange?: { start: number; end: number } | undefined;
  newRange?: { start: number; end: number } | undefined;
}

export class ChangedSymbolsDetector {
  /**
   * Identifies all AST symbols impacted by diff hunks across changed files.
   */
  static detectChangedSymbols(
    fileDiffs: ParsedFileDiff[],
    graph: ProjectKnowledgeGraph,
  ): ChangedSymbol[] {
    const changedSymbols: ChangedSymbol[] = [];
    const seen = new Set<string>();

    for (const diff of fileDiffs) {
      const filePath = diff.newPath || diff.oldPath;
      if (!filePath) continue;

      const summary = graph.getFileSummary(filePath);
      const symbols = summary?.symbols || [];
      const routes = summary?.routes || summary?.apiRoutes || [];
      const dbCalls = summary?.dbCalls || [];

      for (const hunk of diff.hunks) {
        const hunkNewStart = hunk.newStart;
        const hunkNewEnd = hunk.newStart + Math.max(1, hunk.newLines);
        const hunkOldStart = hunk.oldStart;
        const hunkOldEnd = hunk.oldStart + Math.max(1, hunk.oldLines);

        // 1. Match AST Symbols (functions, classes, components, methods, types)
        for (const sym of symbols) {
          const overlaps =
            (sym.lineStart <= hunkNewEnd && sym.lineEnd >= hunkNewStart) ||
            (diff.changeType === "deleted" && sym.lineStart <= hunkOldEnd && sym.lineEnd >= hunkOldStart);

          if (overlaps) {
            const key = `${filePath}:${sym.name}:${sym.kind}`;
            if (!seen.has(key)) {
              seen.add(key);

              let changeType: ChangedSymbol["changeType"] = "modified";
              if (diff.changeType === "added") changeType = "added";
              else if (diff.changeType === "deleted") changeType = "deleted";

              changedSymbols.push({
                filePath,
                symbolName: sym.name,
                symbolKind: sym.kind,
                changeType,
                hunkHeader: hunk.header || undefined,
                oldRange: { start: sym.lineStart, end: sym.lineEnd },
                newRange: { start: sym.lineStart, end: sym.lineEnd },
              });
            }
          }
        }

        // 2. Match API Routes
        for (const r of routes) {
          const overlaps =
            (r.lineStart <= hunkNewEnd && r.lineEnd >= hunkNewStart) ||
            (diff.changeType === "deleted" && r.lineStart <= hunkOldEnd && r.lineEnd >= hunkOldStart);

          if (overlaps) {
            const key = `${filePath}:${r.method}_${r.path}:route`;
            if (!seen.has(key)) {
              seen.add(key);
              changedSymbols.push({
                filePath,
                symbolName: `${r.method} ${r.path}`,
                symbolKind: "route",
                changeType: diff.changeType === "deleted" ? "deleted" : "modified",
                hunkHeader: hunk.header || undefined,
                newRange: { start: r.lineStart, end: r.lineEnd },
              });
            }
          }
        }

        // 3. Match Database Calls
        for (const db of dbCalls) {
          const overlaps =
            (db.line <= hunkNewEnd && db.line >= hunkNewStart) ||
            (diff.changeType === "deleted" && db.line <= hunkOldEnd && db.line >= hunkOldStart);

          if (overlaps) {
            const key = `${filePath}:${db.table}:${db.operation}:db`;
            if (!seen.has(key)) {
              seen.add(key);
              changedSymbols.push({
                filePath,
                symbolName: `db.${db.table}.${db.operation}`,
                symbolKind: "database_call",
                changeType: diff.changeType === "deleted" ? "deleted" : "modified",
                hunkHeader: hunk.header || undefined,
                newRange: { start: db.line, end: db.line },
              });
            }
          }
        }
      }
    }

    return changedSymbols;
  }
}
