import type {
  CodeParser,
  ParsedAstSummary,
  ParsedImport,
  ParsedSymbol,
  ParsedApiRoute,
  CodeIssueCandidate,
} from "./parser-interface";

export class PythonParser implements CodeParser {
  canParse(filePath: string): boolean {
    return /\.py$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const lines = content.split("\n");
    const imports: ParsedImport[] = [];
    const symbols: ParsedSymbol[] = [];
    const apiRoutes: ParsedApiRoute[] = [];
    const issues: CodeIssueCandidate[] = [];

    let currentSymbol: ParsedSymbol | null = null;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed.startsWith("#")) continue;

      // 1. Imports
      const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.,\s]+)/);
      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_.,*\s]+)/);

      if (importMatch) {
        imports.push({
          source: importMatch[1]?.trim() || "",
          specifiers: (importMatch[1] || "").split(",").map((s) => s.trim()),
          isDefault: true,
          line: lineNum,
        });
      } else if (fromMatch) {
        imports.push({
          source: fromMatch[1]?.trim() || "",
          specifiers: (fromMatch[2] || "").split(",").map((s) => s.trim()),
          isDefault: false,
          line: lineNum,
        });
      }

      // 2. Functions & Classes
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/);
      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/);

      if (funcMatch) {
        if (currentSymbol) {
          currentSymbol.lineEnd = lineNum - 1;
          symbols.push(currentSymbol);
        }
        currentSymbol = {
          name: funcMatch[1] || "anonymous",
          kind: "function",
          lineStart: lineNum,
          lineEnd: lineNum + 10,
          isAsync: trimmed.startsWith("async"),
          isExported: !funcMatch[1]?.startsWith("_"),
          params: (funcMatch[2] || "").split(",").map((p) => p.trim()).filter(Boolean),
          calls: [],
        };
      } else if (classMatch) {
        if (currentSymbol) {
          currentSymbol.lineEnd = lineNum - 1;
          symbols.push(currentSymbol);
        }
        currentSymbol = {
          name: classMatch[1] || "anonymous_class",
          kind: "class",
          lineStart: lineNum,
          lineEnd: lineNum + 20,
          isExported: true,
          calls: [],
        };
      }

      // 3. FastAPI / Flask Routes
      const routeDecorator = trimmed.match(/^@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (routeDecorator) {
        apiRoutes.push({
          method: (routeDecorator[1] || "GET").toUpperCase() as ParsedApiRoute["method"],
          path: routeDecorator[2] || "/",
          lineStart: lineNum,
          lineEnd: lineNum + 5,
        });
      }

      // 4. SQL Injection in Python (e.g. f"SELECT ... {user_id}")
      if (/f["'].*(?:SELECT|UPDATE|DELETE|INSERT)\s+.*\{[^}]+\}/i.test(trimmed)) {
        issues.push({
          id: `issue-py-sqli-${lineNum}`,
          line: lineNum,
          type: "raw_sql_injection",
          severity: "critical",
          confidence: 94,
          title: "SQL Injection via Python F-String",
          description: `Direct parameter interpolation using an f-string in SQL statement on line ${lineNum}. Use parameterized queries with %s or SQLAlchemy expressions.`,
          snippet: trimmed,
          suggestedFix: `cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`,
        });
      }
    }

    if (currentSymbol) {
      const finalSym: ParsedSymbol = currentSymbol;
      finalSym.lineEnd = lines.length;
      symbols.push(finalSym);
    }

    return {
      filePath,
      language: "python",
      imports,
      exports: [],
      symbols,
      apiRoutes,
      routes: apiRoutes,
      dbCalls: [],
      issues,
      loc: lines.length,
    };
  }
}
