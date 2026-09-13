import type {
  CodeParser,
  ParsedAstSummary,
  ParsedSymbol,
  ParsedDbCall,
  CodeIssueCandidate,
} from "./parser-interface";

export class SqlParser implements CodeParser {
  canParse(filePath: string): boolean {
    return /\.sql$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const lines = content.split("\n");
    const symbols: ParsedSymbol[] = [];
    const dbCalls: ParsedDbCall[] = [];
    const issues: CodeIssueCandidate[] = [];

    // 1. Extract CREATE TABLE statements
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-zA-Z0-9_]+)["']?\s*\(([\s\S]*?)\);/gi;
    let match: RegExpExecArray | null;

    while ((match = tableRegex.exec(content)) !== null) {
      const tableName = match[1] || "unknown_table";
      const tableBody = match[2] || "";

      // Find approximate line number
      const offset = match.index;
      const lineStart = content.slice(0, offset).split("\n").length;
      const lineEnd = lineStart + tableBody.split("\n").length;

      const hasPrimaryKey = /PRIMARY\s+KEY/i.test(tableBody);
      const hasPlaintextPassword = /(?:password|passwd|pwd)\s+(?:TEXT|VARCHAR\([0-9]+\))\b/i.test(tableBody);

      symbols.push({
        name: tableName,
        kind: "table",
        lineStart,
        lineEnd,
        isExported: true,
        calls: [],
      });

      dbCalls.push({
        table: tableName,
        operation: "raw_sql",
        line: lineStart,
        isParameterized: true,
        rawSnippet: `CREATE TABLE ${tableName}`,
      });

      if (!hasPrimaryKey) {
        issues.push({
          id: `issue-missing-pk-${tableName}`,
          line: lineStart,
          type: "unhandled_error",
          severity: "high",
          confidence: 96,
          title: `Table '${tableName}' Missing PRIMARY KEY`,
          description: `The database table '${tableName}' has no primary key defined. Primary keys are required for deduplication, indexing, and row-level synchronization.`,
          snippet: `CREATE TABLE ${tableName} (...)`,
          suggestedFix: `ALTER TABLE "${tableName}" ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();`,
        });
      }

      if (hasPlaintextPassword) {
        issues.push({
          id: `issue-plaintext-password-${tableName}`,
          line: lineStart,
          type: "missing_auth",
          severity: "critical",
          confidence: 90,
          title: `Potential Plaintext Password Column in Table '${tableName}'`,
          description: `Column definition appears to store passwords directly as plain text. Passwords must always be hashed using Argon2 or Bcrypt before storage.`,
          snippet: tableBody.split("\n").find((l) => /password/i.test(l))?.trim() || "",
          suggestedFix: `Store only salted hashes (e.g. bcrypt hashes of 60 chars) or use Supabase/Auth identity management.`,
        });
      }
    }

    return {
      filePath,
      language: "sql",
      imports: [],
      exports: [],
      symbols,
      apiRoutes: [],
      dbCalls,
      issues,
      loc: lines.length,
    };
  }
}
