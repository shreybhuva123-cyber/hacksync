/**
 * Hybrid Retrieval Engine for HackSync Project Intelligence
 * 
 * Combines multi-signal scoring to retrieve the most relevant files, symbols,
 * and line-level code snippets for a given developer query:
 * - Exact / fuzzy symbol match (+40)
 * - Path / filename relevance (+25)
 * - BM25 keyword search score (+20)
 * - Dependency graph distance (+15)
 * - Architecture role relevance (+10)
 * - Active file context boost (+15)
 */

import type { ProjectKnowledgeGraph } from "./knowledge-graph";
import type { ParsedSymbol } from "./parsers/parser-interface";

export interface RetrievalHit {
  filePath: string;
  score: number;
  matchReasons: string[];
  matchedSymbols: ParsedSymbol[];
  lineRange?: { start: number; end: number } | undefined;
  snippet?: string | undefined;
}

export interface RetrievalResult {
  query: string;
  hits: RetrievalHit[];
  totalScore: number;
  topSymbols: ParsedSymbol[];
}

export class HybridRetrievalEngine {
  /**
   * Performs hybrid multi-signal retrieval over the indexed project knowledge graph.
   */
  static retrieve(params: {
    query: string;
    graph: ProjectKnowledgeGraph;
    activeFilePath?: string | undefined;
    limit?: number | undefined;
  }): RetrievalResult {
    const { query, graph, activeFilePath } = params;
    const limit = Math.max(1, Math.min(20, params.limit || 5));
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return {
        query,
        hits: [],
        totalScore: 0,
        topSymbols: [],
      };
    }

    const queryTokens = cleanQuery
      .split(/[^a-zA-Z0-9_]+/)
      .filter((t) => t.length > 1);

    const scores = new Map<string, { score: number; reasons: string[]; symbols: ParsedSymbol[] }>();

    const getScoreEntry = (path: string) => {
      let entry = scores.get(path);
      if (!entry) {
        entry = { score: 0, reasons: [], symbols: [] };
        scores.set(path, entry);
      }
      return entry;
    };

    // 1. BM25 Full-Text Search (+20 max normalized)
    const bm25Results = graph.search(query, 10);
    const maxBm25 = bm25Results.length > 0 ? Math.max(...bm25Results.map((r) => r.score), 1) : 1;
    bm25Results.forEach((r) => {
      const entry = getScoreEntry(r.path);
      const normalizedBm25 = Math.round((r.score / maxBm25) * 20);
      entry.score += normalizedBm25;
      entry.reasons.push(`BM25 text relevance (+${normalizedBm25})`);
    });

    // 2. Exact & Substring Symbol Matches (+40 for exact, +25 for substring)
    const allSymbols = graph.getSymbolIndex().getAllSymbols();
    const matchedTopSymbols: ParsedSymbol[] = [];

    for (const sym of allSymbols) {
      const sNameLower = sym.name.toLowerCase();
      for (const token of queryTokens) {
        if (sNameLower === token) {
          if (sym.filePath) {
            const entry = getScoreEntry(sym.filePath);
            entry.score += 40;
            entry.reasons.push(`Exact symbol match '${sym.name}' (+40)`);
            if (!entry.symbols.some((s) => s.name === sym.name)) {
              entry.symbols.push(sym);
            }
          }
          if (!matchedTopSymbols.some((s) => s.name === sym.name)) {
            matchedTopSymbols.push(sym);
          }
        } else if (token.length >= 3 && sNameLower.includes(token)) {
          if (sym.filePath) {
            const entry = getScoreEntry(sym.filePath);
            entry.score += 20;
            entry.reasons.push(`Fuzzy symbol match '${sym.name}' (+20)`);
            if (!entry.symbols.some((s) => s.name === sym.name)) {
              entry.symbols.push(sym);
            }
          }
          if (!matchedTopSymbols.some((s) => s.name === sym.name)) {
            matchedTopSymbols.push(sym);
          }
        }
      }
    }

    // 3. Path & Filename Relevance (+25)
    graph.getAllFilePaths().forEach((fPath) => {
      const fPathLower = fPath.toLowerCase();
      const baseName = fPathLower.split("/").pop() || "";

      for (const token of queryTokens) {
        if (baseName.includes(token)) {
          const entry = getScoreEntry(fPath);
          entry.score += 25;
          entry.reasons.push(`Filename match '${token}' (+25)`);
          break;
        } else if (fPathLower.includes(token)) {
          const entry = getScoreEntry(fPath);
          entry.score += 15;
          entry.reasons.push(`Path directory match '${token}' (+15)`);
          break;
        }
      }
    });

    // 4. Active File Context Boost (+15) & Direct Dependency Boost (+15)
    if (activeFilePath) {
      const activeEntry = getScoreEntry(activeFilePath);
      activeEntry.score += 15;
      activeEntry.reasons.push("Active editor file context (+15)");

      // Direct dependencies and dependents of active file
      const directDeps = graph.findDependencies(activeFilePath);
      const directCallers = graph.findDependents(activeFilePath);

      [...directDeps, ...directCallers].forEach((relPath) => {
        const relEntry = getScoreEntry(relPath);
        relEntry.score += 10;
        relEntry.reasons.push(`Direct neighbor of active file (+10)`);
      });
    }

    // 5. Architecture Role Relevance (+10)
    scores.forEach((entry, fPath) => {
      const summary = graph.getFileSummary(fPath);
      if (summary?.architectureRole) {
        const role = summary.architectureRole;
        if (
          (cleanQuery.includes("api") || cleanQuery.includes("endpoint") || cleanQuery.includes("route")) &&
          role === "route"
        ) {
          entry.score += 10;
          entry.reasons.push("Architecture role match: route (+10)");
        } else if (
          (cleanQuery.includes("db") || cleanQuery.includes("table") || cleanQuery.includes("schema")) &&
          (role === "database" || role === "repository")
        ) {
          entry.score += 10;
          entry.reasons.push("Architecture role match: database/repository (+10)");
        } else if (
          (cleanQuery.includes("ui") || cleanQuery.includes("button") || cleanQuery.includes("component")) &&
          role === "component"
        ) {
          entry.score += 10;
          entry.reasons.push("Architecture role match: component (+10)");
        }
      }
    });

    // 6. Rank, extract line ranges and snippets
    const rankedHits: RetrievalHit[] = [];

    const sortedEntries = Array.from(scores.entries())
      .filter(([_, data]) => data.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);

    for (const [fPath, data] of sortedEntries) {
      const summary = graph.getFileSummary(fPath);
      const content = graph.getFileContent(fPath) || "";
      const lines = content.split("\n");

      let lineRange: { start: number; end: number } | undefined;
      let snippet: string | undefined;

      // If symbol matched, focus snippet on that symbol
      if (data.symbols.length > 0 && data.symbols[0]) {
        const topSym = data.symbols[0];
        lineRange = { start: topSym.lineStart, end: Math.min(lines.length, topSym.lineEnd) };
        const sliceStart = Math.max(0, (lineRange?.start ?? 1) - 1);
        snippet = lines.slice(sliceStart, lineRange?.end ?? 30).join("\n");
      } else if (lines.length > 0) {
        lineRange = { start: 1, end: Math.min(lines.length, 30) };
        snippet = lines.slice(0, 30).join("\n");
      }

      rankedHits.push({
        filePath: fPath,
        score: data.score,
        matchReasons: data.reasons,
        matchedSymbols: data.symbols,
        lineRange,
        snippet,
      });
    }

    const totalScore = rankedHits.reduce((acc, h) => acc + h.score, 0);

    return {
      query,
      hits: rankedHits,
      totalScore,
      topSymbols: matchedTopSymbols.slice(0, 5),
    };
  }
}
