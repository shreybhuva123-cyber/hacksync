/**
 * Standard Code Parser Contract for HackSync Project Intelligence
 * Enhanced for Phase 1: Real AST, Symbol Hierarchy, Exact Line Ranges & Diagnostics
 */

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "component"
  | "hook"
  | "route"
  | "variable"
  | "type"
  | "interface"
  | "enum"
  | "table";

export interface ParsedSymbol {
  symbolId?: string | undefined; // Unique identifier e.g. `${filePath}#${name}:${lineStart}`
  projectId?: string | undefined;
  filePath?: string | undefined;
  name: string;
  kind: SymbolKind;
  lineStart: number;
  lineEnd: number;
  isAsync?: boolean | undefined;
  isExported: boolean;
  params?: string[] | undefined;
  returnType?: string | undefined;
  signature?: string | undefined;
  parentSymbol?: string | undefined;
  decorators?: string[] | undefined;
  calls?: string[] | undefined; // Other symbols called inside this symbol
}

export interface ImportedSymbolSpec {
  name: string;
  alias?: string | undefined;
  isDefault?: boolean | undefined;
  isNamespace?: boolean | undefined;
}

export interface ParsedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  line: number;
  isTypeOnly?: boolean | undefined;
  resolvedPath?: string | null | undefined;
  unresolved?: boolean | undefined;
  importedSymbols?: ImportedSymbolSpec[] | undefined;
}

export interface ParsedExport {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "interface" | "enum" | "default";
  line: number;
  isTypeOnly?: boolean | undefined;
  reExportFrom?: string | undefined;
}

export interface ParsedApiRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
  path: string;
  handlerName?: string | undefined;
  lineStart: number;
  lineEnd: number;
  authRequired?: boolean | undefined;
}

export interface ParsedDbCall {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "raw_sql";
  line: number;
  isParameterized: boolean;
  rawSnippet: string;
}

export interface CodeIssueCandidate {
  id: string;
  line: number;
  type:
    | "null_access_before_check"
    | "unhandled_promise"
    | "state_mutation"
    | "infinite_loop"
    | "raw_sql_injection"
    | "unhandled_error"
    | "missing_auth";
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: number; // 0..100
  title: string;
  description: string;
  snippet: string;
  suggestedFix: string;
}

export type ArchitectureRole =
  | "component"
  | "route"
  | "service"
  | "repository"
  | "database"
  | "auth"
  | "middleware"
  | "config"
  | "test"
  | "util"
  | "unknown";

export interface ParsedAstSummary {
  filePath: string;
  language: string;
  imports: ParsedImport[];
  exports: ParsedExport[];
  symbols: ParsedSymbol[];
  apiRoutes: ParsedApiRoute[];
  routes?: ParsedApiRoute[] | undefined;
  dbCalls: ParsedDbCall[];
  issues: CodeIssueCandidate[];
  loc: number;
  contentHash?: string | undefined;
  architectureRole?: ArchitectureRole | undefined;
}

export interface CodeParser {
  canParse(filePath: string): boolean;
  parse(filePath: string, content: string): ParsedAstSummary;
}
