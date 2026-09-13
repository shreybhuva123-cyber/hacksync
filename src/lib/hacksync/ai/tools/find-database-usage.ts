/**
 * Tool: find_database_usage
 * Secure Read-Only detection of database tables, queries, and schema usage.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import type { Workspace } from "../../types";

export interface FindDatabaseUsageParams {
  tableName?: string | undefined;
}

export interface TableUsageInfo {
  name: string;
  columns?: string[] | undefined;
  usageCount: number;
  filesReferencing: string[];
}

export class FindDatabaseUsageTool {
  static readonly name = "find_database_usage";
  static readonly tier = "READ_ONLY";

  static execute(
    graph: ProjectKnowledgeGraph,
    params: FindDatabaseUsageParams,
    ws?: Workspace | null | undefined,
  ): TableUsageInfo[] {
    const filterTable = params.tableName ? params.tableName.toLowerCase().trim() : undefined;
    const tableMap = new Map<string, { columns: string[]; files: Set<string> }>();

    // 1. From workspace tables & columns
    if (ws?.tables) {
      for (const t of ws.tables) {
        const tName = t.name.toLowerCase();
        if (filterTable && tName !== filterTable) continue;

        const cols = (ws.columns || [])
          .filter((c) => c.table_id === t.id)
          .map((c) => c.name);

        tableMap.set(tName, { columns: cols, files: new Set() });
      }
    }

    // 2. From AST SQL symbols in knowledge graph
    const sqlSymbols = graph.findSymbol("table");
    for (const sym of sqlSymbols) {
      const tName = sym.name.toLowerCase();
      if (filterTable && tName !== filterTable) continue;

      if (!tableMap.has(tName)) {
        tableMap.set(tName, { columns: [], files: new Set() });
      }
      if (sym.filePath) {
        tableMap.get(tName)?.files.add(sym.filePath);
      }
    }

    // 3. Find files referencing each table
    const result: TableUsageInfo[] = [];
    for (const [name, info] of tableMap.entries()) {
      const searchResults = graph.search(name, 5);
      for (const res of searchResults) {
        info.files.add(res.path);
      }

      result.push({
        name,
        columns: info.columns.length > 0 ? info.columns : undefined,
        usageCount: info.files.size,
        filesReferencing: Array.from(info.files),
      });
    }

    return result;
  }
}
