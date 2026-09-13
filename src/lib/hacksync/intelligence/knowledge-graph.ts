import type { Workspace, CodeNode, MemberFile } from "../types";
import { TypeScriptParser } from "./parsers/typescript-parser";
import { JavaScriptParser } from "./parsers/javascript-parser";
import { JsonParser } from "./parsers/json-parser";
import { SqlParser } from "./parsers/sql-parser";
import { PythonParser } from "./parsers/python-parser";
import { BM25SearchIndex, type SearchResult } from "./bm25-search";
import type {
  CodeParser,
  ParsedAstSummary,
  ParsedSymbol,
  CodeIssueCandidate,
} from "./parsers/parser-interface";

export class ProjectKnowledgeGraph {
  private parsers: CodeParser[] = [
    new TypeScriptParser(),
    new JavaScriptParser(),
    new JsonParser(),
    new SqlParser(),
    new PythonParser(),
  ];

  private searchIndex = new BM25SearchIndex();
  private files = new Map<string, ParsedAstSummary>();
  private fileContents = new Map<string, string>();
  private symbolTable = new Map<string, ParsedSymbol[]>();
  private dependencyGraph = new Map<string, Set<string>>(); // file -> imported files
  private dependentsGraph = new Map<string, Set<string>>(); // file -> files that import it
  private callGraph = new Map<string, Set<string>>(); // symbol -> called symbols
  private tableAccess = new Map<string, Set<string>>(); // table -> files accessing it

  clear(): void {
    this.searchIndex.clear();
    this.files.clear();
    this.fileContents.clear();
    this.symbolTable.clear();
    this.dependencyGraph.clear();
    this.dependentsGraph.clear();
    this.callGraph.clear();
    this.tableAccess.clear();
  }

  indexFile(path: string, content: string): ParsedAstSummary | null {
    this.fileContents.set(path, content);
    this.searchIndex.addDocument(path, content);

    const parser = this.parsers.find((p) => p.canParse(path));
    if (!parser) return null;

    const summary = parser.parse(path, content);
    this.files.set(path, summary);

    // 1. Symbol indexing
    summary.symbols.forEach((sym) => {
      const existing = this.symbolTable.get(sym.name) || [];
      existing.push(sym);
      this.symbolTable.set(sym.name, existing);

      // Call graph
      if (sym.calls && sym.calls.length > 0) {
        const calledSet = this.callGraph.get(sym.name) || new Set();
        sym.calls.forEach((c) => calledSet.add(c));
        this.callGraph.set(sym.name, calledSet);
      }
    });

    // 2. Dependencies
    const fileDeps = new Set<string>();
    summary.imports.forEach((imp) => {
      fileDeps.add(imp.source);
    });
    this.dependencyGraph.set(path, fileDeps);

    // 3. Database table access
    summary.dbCalls.forEach((db) => {
      const accessingFiles = this.tableAccess.get(db.table) || new Set();
      accessingFiles.add(path);
      this.tableAccess.set(db.table, accessingFiles);
    });

    return summary;
  }

  indexWorkspace(ws: Workspace, memberFiles: MemberFile[] = []): void {
    this.clear();

    // Index shared code nodes
    ws.codeNodes?.forEach((node) => {
      if (node.kind !== "folder" && node.content) {
        this.indexFile(node.path, node.content);
      }
    });

    // Index local member files (if newer or non-overlapping)
    memberFiles.forEach((mf) => {
      const path = mf.relative_path || (mf as any).path || mf.file_name;
      if (path && mf.content && !this.files.has(path)) {
        this.indexFile(path, mf.content);
      }
    });

    // Rebuild reverse dependents graph
    this.dependencyGraph.forEach((deps, filePath) => {
      deps.forEach((dep) => {
        // Match relative imports to known files
        this.files.forEach((_, candidatePath) => {
          if (candidatePath.includes(dep.replace(/^(\.\/|\.\.\/)+/, ""))) {
            const callers = this.dependentsGraph.get(candidatePath) || new Set();
            callers.add(filePath);
            this.dependentsGraph.set(candidatePath, callers);
          }
        });
      });
    });
  }

  getFileContent(path: string): string | undefined {
    return this.fileContents.get(path);
  }

  getFileSummary(path: string): ParsedAstSummary | undefined {
    return this.files.get(path);
  }

  search(query: string, limit = 5): SearchResult[] {
    return this.searchIndex.search(query, limit);
  }

  findSymbol(name: string): ParsedSymbol[] {
    return this.symbolTable.get(name) || [];
  }

  findDependencies(path: string): string[] {
    return Array.from(this.dependencyGraph.get(path) || []);
  }

  /**
   * Identifies all files that depend on a given file (Answers: "What will break if I change X?")
   */
  getDependents(path: string): string[] {
    return this.findDependents(path);
  }

  findDependents(path: string): string[] {
    const direct = Array.from(this.dependentsGraph.get(path) || []);
    if (direct.length > 0) return direct;

    // Fallback: search for imports mentioning path basename
    const base = path.split("/").pop()?.replace(/\.[a-zA-Z0-9]+$/, "") || "";
    if (!base) return [];

    const matches: string[] = [];
    this.files.forEach((summary, fPath) => {
      if (fPath !== path && summary.imports.some((imp) => imp.source.includes(base))) {
        matches.push(fPath);
      }
    });
    return matches;
  }

  /**
   * Identifies files most relevant to a concept (e.g. "attendance", "authentication")
   */
  getFilesResponsibleFor(concept: string): string[] {
    const results = this.search(concept, 5);
    return results.map((r) => r.path);
  }

  /**
   * Collects all deterministic code issues identified by the parsers.
   */
  getAllIssues(): { filePath: string; issue: CodeIssueCandidate }[] {
    const all: { filePath: string; issue: CodeIssueCandidate }[] = [];
    this.files.forEach((summary, filePath) => {
      summary.issues.forEach((issue) => {
        all.push({ filePath, issue });
      });
    });
    return all;
  }

  getAllApiRoutes(): { filePath: string; route: import("./parsers/parser-interface").ParsedApiRoute }[] {
    const routes: { filePath: string; route: import("./parsers/parser-interface").ParsedApiRoute }[] = [];
    this.files.forEach((summary, filePath) => {
      (summary.routes || summary.apiRoutes).forEach((r) => routes.push({ filePath, route: r }));
    });
    return routes;
  }

  getStructureTree(): string {
    const paths = Array.from(this.files.keys()).sort();
    if (paths.length === 0) return "Project tree is empty.";
    return paths.map((p) => `- ${p}`).join("\n");
  }

  getMetrics() {
    let totalLoc = 0;
    this.files.forEach((f) => (totalLoc += f.loc));

    return {
      indexedFilesCount: this.files.size,
      totalLoc,
      totalSymbolsCount: Array.from(this.symbolTable.values()).reduce((sum, s) => sum + s.length, 0),
      totalIssuesCount: this.getAllIssues().length,
    };
  }
}
