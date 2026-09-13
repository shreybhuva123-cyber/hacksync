import type {
  CodeParser,
  ParsedAstSummary,
  ParsedImport,
  ParsedExport,
  ParsedSymbol,
  ParsedApiRoute,
  ParsedDbCall,
  CodeIssueCandidate,
} from "./parser-interface";

export class TypeScriptParser implements CodeParser {
  canParse(filePath: string): boolean {
    return /\.(ts|tsx)$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const lines = content.split("\n");
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const apiRoutes: ParsedApiRoute[] = [];
    const dbCalls: ParsedDbCall[] = [];
    const issues: CodeIssueCandidate[] = [];

    let currentSymbol: ParsedSymbol | null = null;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Skip pure comments
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        continue;
      }

      // 1. Imports
      const importMatch = trimmed.match(/^import\s+(?:type\s+)?(?:(\*\s+as\s+[a-zA-Z0-9_]+)|([a-zA-Z0-9_]+)|\{([^}]+)\})\s+from\s+["']([^"']+)["']/);
      if (importMatch) {
        const defaultSpec = importMatch[2];
        const namedSpecs = importMatch[3];
        const wildcard = importMatch[1];
        const source = importMatch[4] || "";

        const specifiers: string[] = [];
        if (defaultSpec) specifiers.push(defaultSpec.trim());
        if (wildcard) specifiers.push(wildcard.replace(/\*\s+as\s+/, "").trim());
        if (namedSpecs) {
          namedSpecs.split(",").forEach((s) => {
            const clean = s.trim().split(/\s+as\s+/)[0]?.trim();
            if (clean) specifiers.push(clean);
          });
        }

        imports.push({
          source,
          specifiers,
          isDefault: Boolean(defaultSpec),
          line: lineNum,
        });
      }

      // 2. Exports
      const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:(async\s+)?function\s+([a-zA-Z0-9_]+)|class\s+([a-zA-Z0-9_]+)|(?:const|let|var)\s+([a-zA-Z0-9_]+)|interface\s+([a-zA-Z0-9_]+)|type\s+([a-zA-Z0-9_]+))/);
      if (exportMatch) {
        const name = exportMatch[2] || exportMatch[3] || exportMatch[4] || exportMatch[5] || exportMatch[6] || "defaultExport";
        const kind = exportMatch[2] ? "function" : exportMatch[3] ? "class" : exportMatch[5] || exportMatch[6] ? "type" : "variable";
        exports.push({ name, kind, line: lineNum });
      }

      // 3. Functions & Components Symbol Detection
      const funcDecl = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      const arrowDecl = trimmed.match(/^(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|:)/);
      const classDecl = trimmed.match(/^(?:export\s+)?class\s+([a-zA-Z0-9_]+)/);

      if (funcDecl || arrowDecl) {
        if (currentSymbol) {
          currentSymbol.lineEnd = lineNum - 1;
          symbols.push(currentSymbol);
        }

        const name = (funcDecl ? funcDecl[1] : arrowDecl ? arrowDecl[1] : "anonymous")!;
        const rawParams = funcDecl ? funcDecl[2] : arrowDecl ? arrowDecl[2] : "";
        const params = rawParams
          ? rawParams.split(",").map((p) => p.trim().split(/[:=]/)[0]?.trim() || "").filter(Boolean)
          : [];

        const isComponent = /^[A-Z]/.test(name);
        const isAsync = trimmed.includes("async ");

        currentSymbol = {
          name,
          kind: isComponent ? "component" : "function",
          lineStart: lineNum,
          lineEnd: lineNum + 10,
          isAsync,
          isExported: trimmed.startsWith("export"),
          params,
          calls: [],
        };
      } else if (classDecl) {
        if (currentSymbol) {
          currentSymbol.lineEnd = lineNum - 1;
          symbols.push(currentSymbol);
        }
        currentSymbol = {
          name: classDecl[1]!,
          kind: "class",
          lineStart: lineNum,
          lineEnd: lineNum + 20,
          isExported: trimmed.startsWith("export"),
          calls: [],
        };
      }

      // Track called symbols inside the active symbol
      if (currentSymbol) {
        const callsInLine = trimmed.match(/\b([a-zA-Z0-9_]+)\s*\(/g);
        if (callsInLine) {
          callsInLine.forEach((c) => {
            const sym = c.replace(/\s*\(/, "");
            if (currentSymbol && sym !== currentSymbol.name && !["if", "for", "while", "switch", "catch"].includes(sym)) {
              if (!currentSymbol.calls) currentSymbol.calls = [];
              if (!currentSymbol.calls.includes(sym)) {
                currentSymbol.calls.push(sym);
              }
            }
          });
        }
      }

      // 4. API Routes (Express, Fastify, Next.js / TanStack Router)
      const routeMatch = trimmed.match(/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i);
      if (routeMatch) {
        apiRoutes.push({
          method: (routeMatch[1] || "GET").toUpperCase() as ParsedApiRoute["method"],
          path: routeMatch[2] || "/",
          lineStart: lineNum,
          lineEnd: lineNum + 5,
          authRequired: trimmed.includes("auth") || trimmed.includes("protect") || trimmed.includes("verifyToken"),
        });
      }

      // 5. Database Calls (Supabase, Prisma, Drizzle, raw SQL)
      const supabaseMatch = trimmed.match(/supabase\s*\.\s*from\s*\(\s*["']([^"']+)["']\s*\)\s*\.\s*(select|insert|update|delete)/i);
      if (supabaseMatch) {
        dbCalls.push({
          table: supabaseMatch[1] || "unknown",
          operation: (supabaseMatch[2] || "select").toLowerCase() as ParsedDbCall["operation"],
          line: lineNum,
          isParameterized: true,
          rawSnippet: trimmed,
        });
      }

      const prismaMatch = trimmed.match(/prisma\s*\.\s*([a-zA-Z0-9_]+)\s*\.\s*(findMany|findUnique|create|update|delete)/i);
      if (prismaMatch) {
        const op = prismaMatch[2]?.startsWith("find") ? "select" : prismaMatch[2]?.startsWith("create") ? "insert" : "update";
        dbCalls.push({
          table: prismaMatch[1] || "unknown",
          operation: op as ParsedDbCall["operation"],
          line: lineNum,
          isParameterized: true,
          rawSnippet: trimmed,
        });
      }

      // 6. Concrete AST / Code Issue Candidates (Deterministic Evidence)
      if (/(?:user|account|member|record|profile|u)\.(?:password|profile|role|email|token|data|settings|name)\b/i.test(trimmed)) {
        const priorContext = lines.slice(Math.max(0, index - 15), index).join("\n");
        const hasCheck = /if\s*\(\s*!(?:user|account|member|record|profile|u)\b|\bif\s*\(\s*(?:user|account|member|record|profile|u)\s*===?\s*null\b|\bif\s*\(\s*(?:user|account|member|record|profile|u)\s*===?\s*undefined\b/i.test(priorContext);

        if (!hasCheck) {
          const propMatch = trimmed.match(/(?:user|account|member|record|profile|u)\.([a-zA-Z0-9_]+)/i);
          const prop = propMatch ? `.${propMatch[1]}` : "property";
          issues.push({
            id: `issue-null-access-${lineNum}`,
            line: lineNum,
            type: "null_access_before_check",
            severity: "critical",
            confidence: 92,
            title: "Unchecked Property Access on Nullable Entity",
            description: `Property '${prop}' is accessed on line ${lineNum} before validating whether the preceding database query returned a non-null record. If the record does not exist, this throws a TypeError and triggers a 500 Internal Server Error.`,
            snippet: trimmed,
            suggestedFix: `if (!user) {\n  return res.status(401).json({ error: "Invalid credentials" });\n}`,
          });
        }
      }

      if (
        /\b(?:fetch|supabase\..*|axios\..*)\(/.test(trimmed) &&
        !/\bawait\b/.test(trimmed) &&
        !/\.then|\.catch/.test(trimmed)
      ) {
        issues.push({
          id: `issue-unhandled-promise-${lineNum}`,
          line: lineNum,
          type: "unhandled_promise",
          severity: "high",
          confidence: 88,
          title: "Floating Unhandled Asynchronous Promise",
          description: `Asynchronous call initiated on line ${lineNum} without 'await' or error rejection handler. If rejected, it leads to silent failures or uncaught promise rejections.`,
          snippet: trimmed,
          suggestedFix: `const res = await ${trimmed.replace(/^const\s+[a-zA-Z0-9_]+\s*=\s*/, "")};`,
        });
      }

      if (/(?:SELECT|UPDATE|DELETE|INSERT)\s+.*(?:\$\{[^}]+\}|\+\s*[a-zA-Z0-9_]+)/i.test(trimmed) || /query\s*\(\s*["'`].*\$\{.*\}["'`]\s*\)/i.test(trimmed)) {
        issues.push({
          id: `issue-sqli-${lineNum}`,
          line: lineNum,
          type: "raw_sql_injection",
          severity: "critical",
          confidence: 95,
          title: "SQL Injection via String Interpolation",
          description: `Direct parameter concatenation or template interpolation detected in SQL statement on line ${lineNum}. User-supplied data can manipulate the query AST.`,
          snippet: trimmed,
          suggestedFix: `// Use parameterized query with bindings ($1, $2) or Supabase/Prisma query builder`,
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
      language: filePath.endsWith(".tsx") ? "tsx" : "typescript",
      imports,
      exports,
      symbols,
      apiRoutes,
      routes: apiRoutes,
      dbCalls,
      issues,
      loc: lines.length,
    };
  }
}
