import type { Workspace, CodeNode, MemberFile } from "../types";
import { TypeScriptParser } from "./parsers/typescript-parser";
import { JavaScriptParser } from "./parsers/javascript-parser";
import { JsonParser } from "./parsers/json-parser";
import { SqlParser } from "./parsers/sql-parser";
import { PythonParser } from "./parsers/python-parser";
import { BM25SearchIndex, type SearchResult } from "./bm25-search";
import { SymbolIndex } from "./symbol-index";
import { ProjectDependencyGraph } from "./dependency-graph";
import { ModuleResolver } from "./module-resolver";
import { ArchitectureDetector, type ProjectArchitectureProfile } from "./architecture-detector";
import type {
  CodeParser,
  ParsedAstSummary,
  ParsedSymbol,
  CodeIssueCandidate,
  ParsedApiRoute,
} from "./parsers/parser-interface";

function computeContentHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

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
  private fileHashes = new Map<string, string>();
  private symbolTable = new Map<string, ParsedSymbol[]>();
  private symbolIndex: SymbolIndex;
  private projectDependencyGraph: ProjectDependencyGraph;
  private dependencyGraph = new Map<string, Set<string>>(); // file -> imported files
  private dependentsGraph = new Map<string, Set<string>>(); // file -> files that import it
  private callGraph = new Map<string, Set<string>>(); // symbol -> called symbols
  private tableAccess = new Map<string, Set<string>>(); // table -> files accessing it

  constructor(public readonly projectId?: string) {
    this.symbolIndex = new SymbolIndex(projectId);
    this.projectDependencyGraph = new ProjectDependencyGraph(projectId);
  }

  clear(): void {
    this.searchIndex.clear();
    this.files.clear();
    this.fileContents.clear();
    this.fileHashes.clear();
    this.symbolTable.clear();
    this.symbolIndex.clear();
    this.projectDependencyGraph.clear();
    this.dependencyGraph.clear();
    this.dependentsGraph.clear();
    this.callGraph.clear();
    this.tableAccess.clear();
  }

  getSymbolIndex(): SymbolIndex {
    return this.symbolIndex;
  }

  getDependencyGraph(): ProjectDependencyGraph {
    return this.projectDependencyGraph;
  }

  getAllFilePaths(): string[] {
    return Array.from(this.fileContents.keys());
  }

  /**
   * Removes a file and its symbols/dependencies from the knowledge graph.
   */
  removeFile(path: string): void {
    if (this.files.has(path) || this.fileContents.has(path)) {
      this.symbolIndex.removeSymbolsForFile(path);
      this.projectDependencyGraph.removeEdgesForSource(path);
      const oldSummary = this.files.get(path);
      if (oldSummary) {
        oldSummary.symbols.forEach((s) => {
          const list = this.symbolTable.get(s.name);
          if (list) {
            const filtered = list.filter((item) => item.filePath !== path);
            if (filtered.length > 0) this.symbolTable.set(s.name, filtered);
            else this.symbolTable.delete(s.name);
          }
        });
      }
      this.files.delete(path);
      this.fileContents.delete(path);
      this.fileHashes.delete(path);
      this.dependencyGraph.delete(path);
      this.dependentsGraph.delete(path);
    }
  }

  /**
   * Indexes a single file into the knowledge graph.
   * Leverages content hash caching to avoid redundant re-parsing.
   */
  indexFile(path: string, content: string): ParsedAstSummary | null {
    const hash = computeContentHash(content);
    const existingHash = this.fileHashes.get(path);

    // If file content is strictly identical, skip re-parsing
    if (existingHash === hash && this.files.has(path)) {
      return this.files.get(path)!;
    }

    // Clean up previous state for this file
    if (this.files.has(path)) {
      this.symbolIndex.removeSymbolsForFile(path);
      this.projectDependencyGraph.removeEdgesForSource(path);
      // Remove from symbolTable
      const oldSummary = this.files.get(path);
      if (oldSummary) {
        oldSummary.symbols.forEach((s) => {
          const list = this.symbolTable.get(s.name);
          if (list) {
            const filtered = list.filter((item) => item.filePath !== path);
            if (filtered.length > 0) this.symbolTable.set(s.name, filtered);
            else this.symbolTable.delete(s.name);
          }
        });
      }
    }

    this.fileContents.set(path, content);
    this.fileHashes.set(path, hash);
    this.searchIndex.addDocument(path, content);

    const parser = this.parsers.find((p) => p.canParse(path));
    if (!parser) return null;

    const summary = parser.parse(path, content);
    summary.contentHash = hash;
    summary.architectureRole = ArchitectureDetector.detectFileRole(summary);
    this.files.set(path, summary);

    // 1. Symbol indexing (SymbolIndex + legacy symbolTable)
    summary.symbols.forEach((sym) => {
      sym.filePath = path;
      sym.projectId = this.projectId;

      this.symbolIndex.addSymbol(sym);

      const existing = this.symbolTable.get(sym.name) || [];
      existing.push(sym);
      this.symbolTable.set(sym.name, existing);

      // Call graph
      if (sym.calls && sym.calls.length > 0) {
        const calledSet = this.callGraph.get(sym.name) || new Set();
        sym.calls.forEach((c) => calledSet.add(c));
        this.callGraph.set(sym.name, calledSet);

        // Project dependency graph CALLS edges
        sym.calls.forEach((c) => {
          this.projectDependencyGraph.addEdge({
            source: sym.symbolId || `${path}#${sym.name}`,
            target: c,
            type: "CALLS",
            confidence: 85,
            sourceLine: sym.lineStart,
          });
        });
      }
    });

    // 2. Dependencies & Module Resolution
    const fileDeps = new Set<string>();
    const knownFiles = new Set(this.files.keys());

    summary.imports.forEach((imp) => {
      fileDeps.add(imp.source);

      // Resolve module with ModuleResolver
      const resolved = ModuleResolver.resolve(path, imp.source, knownFiles);
      imp.resolvedPath = resolved.resolvedPath;
      imp.unresolved = resolved.unresolved;

      const targetIdentifier = resolved.resolvedPath || imp.source;

      this.projectDependencyGraph.addEdge({
        source: path,
        target: targetIdentifier,
        type: "IMPORTS",
        confidence: resolved.resolvedPath ? 95 : 80,
        sourceLine: imp.line,
        metadata: {
          isExternal: resolved.isExternal,
          unresolved: resolved.unresolved,
        },
      });

      // Update reverse dependents map
      if (resolved.resolvedPath) {
        const callers = this.dependentsGraph.get(resolved.resolvedPath) || new Set();
        callers.add(path);
        this.dependentsGraph.set(resolved.resolvedPath, callers);
      }
    });
    this.dependencyGraph.set(path, fileDeps);

    // 3. Database table access
    summary.dbCalls.forEach((db) => {
      const accessingFiles = this.tableAccess.get(db.table) || new Set();
      accessingFiles.add(path);
      this.tableAccess.set(db.table, accessingFiles);

      this.projectDependencyGraph.addEdge({
        source: path,
        target: db.table,
        type: "USES_DATABASE",
        confidence: 90,
        sourceLine: db.line,
        metadata: { operation: db.operation },
      });
    });

    // 4. API Routes
    (summary.routes || summary.apiRoutes).forEach((route) => {
      this.projectDependencyGraph.addEdge({
        source: path,
        target: route.path,
        type: "USES_API",
        confidence: 90,
        sourceLine: route.lineStart,
        metadata: { method: route.method, authRequired: route.authRequired },
      });
    });

    return summary;
  }

  /**
   * Updates an existing file or adds it if not present.
   */
  updateFile(path: string, content: string): ParsedAstSummary | null {
    return this.indexFile(path, content);
  }

  /**
   * Deletes a file from the knowledge graph and all indices.
   */
  deleteFile(path: string): void {
    if (!this.files.has(path)) return;

    this.files.delete(path);
    this.fileContents.delete(path);
    this.fileHashes.delete(path);
    this.symbolIndex.removeSymbolsForFile(path);
    this.projectDependencyGraph.removeNode(path);
    this.dependencyGraph.delete(path);
    this.dependentsGraph.delete(path);

    // Clean symbolTable
    this.symbolTable.forEach((syms, name) => {
      const filtered = syms.filter((s) => s.filePath !== path);
      if (filtered.length > 0) {
        this.symbolTable.set(name, filtered);
      } else {
        this.symbolTable.delete(name);
      }
    });

    // Clean table access
    this.tableAccess.forEach((accessors, table) => {
      accessors.delete(path);
      if (accessors.size === 0) this.tableAccess.delete(table);
    });

    // Rebuild BM25 index from scratch
    this.searchIndex.clear();
    this.fileContents.forEach((c, p) => {
      this.searchIndex.addDocument(p, c);
    });
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

  hasFile(path: string): boolean {
    return this.files.has(path) || this.fileContents.has(path);
  }

  getFileSummary(path: string): ParsedAstSummary | undefined {
    return this.files.get(path);
  }

  search(query: string, limit = 5): SearchResult[] {
    return this.searchIndex.search(query, limit);
  }

  findSymbol(name: string): ParsedSymbol[] {
    return this.symbolTable.get(name) || this.symbolIndex.getSymbolsByName(name);
  }

  searchSymbols(name: string): ParsedSymbol[] {
    return this.symbolIndex.search(name);
  }

  findDependencies(path: string): string[] {
    const directGraph = this.projectDependencyGraph.getDirectDependencies(path);
    if (directGraph.length > 0) return directGraph;
    return Array.from(this.dependencyGraph.get(path) || []);
  }

  /**
   * Identifies all files that depend on a given file (Answers: "What will break if I change X?")
   */
  getDependents(path: string): string[] {
    return this.findDependents(path);
  }

  findDependents(path: string): string[] {
    const directGraph = this.projectDependencyGraph.getDirectDependents(path);
    if (directGraph.length > 0) return directGraph;

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
   * Transitive dependents (Impact Radius / Blast Radius)
   */
  getTransitiveDependents(path: string, maxDepth = 10): string[] {
    return this.projectDependencyGraph.getTransitiveDependents(path, maxDepth);
  }

  /**
   * Circular dependency detection
   */
  getCycles(): string[][] {
    return this.projectDependencyGraph.detectCycles();
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

  getAllApiRoutes(): { filePath: string; route: ParsedApiRoute }[] {
    const routes: { filePath: string; route: ParsedApiRoute }[] = [];
    this.files.forEach((summary, filePath) => {
      (summary.routes || summary.apiRoutes).forEach((r) => routes.push({ filePath, route: r }));
    });
    return routes;
  }

  getApiRoutes(): { method: string; path: string; filePath: string; authRequired?: boolean | undefined }[] {
    return this.getAllApiRoutes().map((item) => ({
      method: item.route.method,
      path: item.route.path,
      filePath: item.filePath,
      authRequired: item.route.authRequired,
    }));
  }

  getArchitectureProfile(): ProjectArchitectureProfile {
    const pkgContent = this.getFileContent("package.json");
    return ArchitectureDetector.analyzeProject(this.files, pkgContent);
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
      totalSymbolsCount: this.symbolIndex.size(),
      totalIssuesCount: this.getAllIssues().length,
      dependencyEdgesCount: this.projectDependencyGraph.getEdges().length,
    };
  }
}

