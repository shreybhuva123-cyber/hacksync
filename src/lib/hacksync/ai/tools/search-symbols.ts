/**
 * Tool: search_symbols
 * Secure Read-Only lookup of AST symbol definitions.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";

export interface SearchSymbolsParams {
  name: string;
}

export interface SymbolResultItem {
  name: string;
  kind: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  exactStartLine: number;
  exactEndLine: number;
  signature?: string | undefined;
  returnType?: string | undefined;
  parentSymbol?: string | undefined;
}

export class SearchSymbolsTool {
  static readonly name = "search_symbols";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph, params: SearchSymbolsParams): SymbolResultItem[] {
    const query = String(params.name || "").trim();
    if (!query) {
      return [];
    }

    const exact = graph.findSymbol(query);
    const partial = graph.searchSymbols(query);

    const merged = [...exact];
    const seen = new Set(exact.map((s) => `${s.filePath}#${s.name}:${s.lineStart}`));

    for (const sym of partial) {
      const key = `${sym.filePath}#${sym.name}:${sym.lineStart}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(sym);
      }
    }

    return merged.map((s) => ({
      name: s.name,
      kind: s.kind,
      filePath: s.filePath || "",
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      exactStartLine: s.lineStart,
      exactEndLine: s.lineEnd,
      signature: s.signature,
      returnType: s.returnType,
      parentSymbol: s.parentSymbol,
    }));
  }
}
