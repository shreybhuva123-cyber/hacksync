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

    // Helper to calculate block end based on indentation
    const findBlockEnd = (startIdx: number, baseIndent: number): number => {
      for (let i = startIdx + 1; i < lines.length; i++) {
        const l = lines[i];
        if (l === undefined) break;
        const trimmed = l.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const indent = l.search(/\S/);
        if (indent <= baseIndent) {
          return i; // 1-indexed line is previous line i
        }
      }
      return lines.length;
    };

    let pendingDecorators: string[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || trimmed === "") {
        continue;
      }

      // Track decorators
      if (trimmed.startsWith("@")) {
        pendingDecorators.push(trimmed);

        // FastAPI / Flask / Django Routes
        const routeDecorator = trimmed.match(/^@(?:app|router|bp)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
        const flaskRoute = trimmed.match(/^@(?:app|bp)\.route\s*\(\s*["']([^"']+)["'](?:.*methods=\[([^\]]+)\])?/i);

        if (routeDecorator) {
          apiRoutes.push({
            method: (routeDecorator[1] || "GET").toUpperCase() as ParsedApiRoute["method"],
            path: routeDecorator[2] || "/",
            lineStart: lineNum,
            lineEnd: lineNum + 5,
            authRequired:
              trimmed.includes("auth") ||
              trimmed.includes("protect") ||
              pendingDecorators.some((d) => /auth|login|permission/i.test(d)),
          });
        } else if (flaskRoute) {
          const methodMatch = flaskRoute[2]?.match(/POST|PUT|DELETE|PATCH/i);
          apiRoutes.push({
            method: (methodMatch ? methodMatch[0].toUpperCase() : "GET") as ParsedApiRoute["method"],
            path: flaskRoute[1] || "/",
            lineStart: lineNum,
            lineEnd: lineNum + 5,
            authRequired: pendingDecorators.some((d) => /auth|login|permission/i.test(d)),
          });
        }
        continue;
      }

      // 1. Imports
      const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.,\s]+)/);
      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_.,*\s]+)/);

      if (importMatch) {
        const rawSources = (importMatch[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
        imports.push({
          source: rawSources[0] || "",
          specifiers: rawSources,
          isDefault: true,
          line: lineNum,
          importedSymbols: rawSources.map((s) => ({ name: s, isDefault: true })),
        });
      } else if (fromMatch) {
        const source = fromMatch[1]?.trim() || "";
        const specs = (fromMatch[2] || "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0]?.trim() || "").filter(Boolean);
        imports.push({
          source,
          specifiers: specs,
          isDefault: false,
          line: lineNum,
          importedSymbols: specs.map((s) => ({ name: s })),
        });
      }

      // 2. Functions & Classes
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/);

      if (funcMatch) {
        const name = funcMatch[1] || "anonymous";
        const baseIndent = line.search(/\S/);
        const lineEnd = findBlockEnd(index, baseIndent);
        const rawParams = funcMatch[2] || "";
        const params = rawParams
          .split(",")
          .map((p) => p.trim().split(/[:=]/)[0]?.trim() || "")
          .filter(Boolean);
        const returnType = funcMatch[3]?.trim();
        const isAsync = trimmed.startsWith("async");

        symbols.push({
          symbolId: `${filePath}#${name}:${lineNum}`,
          filePath,
          name,
          kind: "function",
          lineStart: lineNum,
          lineEnd,
          isAsync,
          isExported: !name.startsWith("_"),
          params,
          returnType,
          signature: `${isAsync ? "async " : ""}def ${name}(${params.join(", ")})${returnType ? ` -> ${returnType}` : ""}:`,
          decorators: [...pendingDecorators],
          calls: [],
        });

        pendingDecorators = [];
      } else if (classMatch) {
        const name = classMatch[1] || "AnonymousClass";
        const baseIndent = line.search(/\S/);
        const lineEnd = findBlockEnd(index, baseIndent);

        symbols.push({
          symbolId: `${filePath}#${name}:${lineNum}`,
          filePath,
          name,
          kind: "class",
          lineStart: lineNum,
          lineEnd,
          isExported: !name.startsWith("_"),
          decorators: [...pendingDecorators],
          calls: [],
        });

        pendingDecorators = [];
      } else {
        pendingDecorators = [];
      }

      // 3. Track calls inside functions
      if (symbols.length > 0) {
        const lastSym = symbols[symbols.length - 1];
        if (lastSym && lastSym.lineStart <= lineNum && lastSym.lineEnd >= lineNum) {
          const callsInLine = trimmed.match(/\b([a-zA-Z0-9_]+)\s*\(/g);
          if (callsInLine) {
            callsInLine.forEach((c) => {
              const sym = c.replace(/\s*\(/, "");
              if (
                sym !== lastSym.name &&
                !["if", "for", "while", "print", "len", "range", "str", "int", "list", "dict"].includes(sym)
              ) {
                if (!lastSym.calls) lastSym.calls = [];
                if (!lastSym.calls.includes(sym)) lastSym.calls.push(sym);
              }
            });
          }
        }
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

