/**
 * Standard Code Parser Contract for HackSync Project Intelligence
 */

export interface ParsedSymbol {
  name: string;
  kind: "function" | "class" | "component" | "route" | "variable" | "type" | "table";
  lineStart: number;
  lineEnd: number;
  isAsync?: boolean | undefined;
  isExported: boolean;
  params?: string[] | undefined;
  calls?: string[] | undefined; // Other symbols called inside this symbol
}

export interface ParsedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  line: number;
}

export interface ParsedExport {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "default";
  line: number;
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
}

export interface CodeParser {
  canParse(filePath: string): boolean;
  parse(filePath: string, content: string): ParsedAstSummary;
}
