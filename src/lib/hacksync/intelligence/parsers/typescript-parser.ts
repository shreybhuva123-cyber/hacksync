import ts from "typescript";
import type {
  CodeParser,
  ParsedAstSummary,
  ParsedImport,
  ParsedExport,
  ParsedSymbol,
  ParsedApiRoute,
  ParsedDbCall,
  CodeIssueCandidate,
  SymbolKind,
} from "./parser-interface";

export class TypeScriptParser implements CodeParser {
  protected scriptKind: ts.ScriptKind = ts.ScriptKind.TS;

  canParse(filePath: string): boolean {
    return /\.(ts|tsx)$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const lines = content.split("\n");
    const isTsx = filePath.endsWith(".tsx");
    const isJsx = filePath.endsWith(".jsx");
    const isJs = /\.(js|mjs|cjs)$/i.test(filePath);

    const scriptKind = isTsx
      ? ts.ScriptKind.TSX
      : isJsx
        ? ts.ScriptKind.JSX
        : isJs
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const apiRoutes: ParsedApiRoute[] = [];
    const dbCalls: ParsedDbCall[] = [];
    const issues: CodeIssueCandidate[] = [];

    const getLine = (pos: number): number => {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    };

    const getEndLine = (pos: number): number => {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    };

    const extractCalls = (node: ts.Node | undefined): string[] => {
      if (!node) return [];
      const calls: string[] = [];
      const walk = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          let callName = "";
          if (ts.isIdentifier(n.expression)) {
            callName = n.expression.text;
          } else if (ts.isPropertyAccessExpression(n.expression)) {
            callName = n.expression.name.text;
          }
          if (
            callName &&
            !["if", "for", "while", "switch", "catch", "return"].includes(callName) &&
            !calls.includes(callName)
          ) {
            calls.push(callName);
          }
        }
        ts.forEachChild(n, walk);
      };
      walk(node);
      return calls;
    };

    // ─── 1. AST TRAVERSAL FOR IMPORTS, EXPORTS, SYMBOLS, ROUTES ──────────────

    const visitNode = (node: ts.Node) => {
      // 1. Imports
      if (ts.isImportDeclaration(node)) {
        const line = getLine(node.getStart(sourceFile));
        let source = "";
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          source = node.moduleSpecifier.text;
        }

        const specifiers: string[] = [];
        const importedSymbols: ParsedImport["importedSymbols"] = [];
        let isDefault = false;
        const isTypeOnly = Boolean(node.importClause?.isTypeOnly);

        if (node.importClause) {
          if (node.importClause.name) {
            const defName = node.importClause.name.text;
            isDefault = true;
            specifiers.push(defName);
            importedSymbols.push({ name: defName, isDefault: true });
          }

          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              const nsName = node.importClause.namedBindings.name.text;
              specifiers.push(nsName);
              importedSymbols.push({ name: nsName, isNamespace: true });
            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const elem of node.importClause.namedBindings.elements) {
                const name = elem.propertyName ? elem.propertyName.text : elem.name.text;
                const alias = elem.propertyName ? elem.name.text : undefined;
                specifiers.push(alias || name);
                importedSymbols.push({ name, alias });
              }
            }
          }
        }

        imports.push({
          source,
          specifiers,
          isDefault,
          line,
          isTypeOnly,
          importedSymbols,
        });
      }

      // 2. Export Declarations (e.g. export { a, b as c } from './foo')
      if (ts.isExportDeclaration(node)) {
        const line = getLine(node.getStart(sourceFile));
        const reExportFrom =
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
            ? node.moduleSpecifier.text
            : undefined;

        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const elem of node.exportClause.elements) {
            const exportName = elem.name.text;
            exports.push({
              name: exportName,
              kind: "variable",
              line,
              isTypeOnly: Boolean(node.isTypeOnly),
              reExportFrom,
            });
          }
        }
      }

      // 3. Export Assignment (e.g. export default foo)
      if (ts.isExportAssignment(node)) {
        const line = getLine(node.getStart(sourceFile));
        const name = node.expression.getText(sourceFile);
        exports.push({
          name: name || "defaultExport",
          kind: "default",
          line,
        });
      }

      // 4. Function Declarations
      if (ts.isFunctionDeclaration(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const name = node.name?.text || "anonymous";
        const isExported = Boolean(
          node.modifiers?.some(
            (m) =>
              m.kind === ts.SyntaxKind.ExportKeyword ||
              m.kind === ts.SyntaxKind.DefaultKeyword,
          ),
        );
        const isAsync = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword),
        );
        const params = node.parameters.map((p) => p.name.getText(sourceFile));
        const returnType = node.type?.getText(sourceFile);
        const calls = extractCalls(node.body);

        let kind: SymbolKind = "function";
        if (/^[A-Z]/.test(name)) {
          kind = "component";
        } else if (/^use[A-Z]/.test(name)) {
          kind = "hook";
        }

        const symbol: ParsedSymbol = {
          symbolId: `${filePath}#${name}:${lineStart}`,
          filePath,
          name,
          kind,
          lineStart,
          lineEnd,
          isAsync,
          isExported,
          params,
          returnType,
          signature: `${isAsync ? "async " : ""}function ${name}(${params.join(", ")})${returnType ? `: ${returnType}` : ""}`,
          calls,
        };
        symbols.push(symbol);

        if (isExported) {
          exports.push({ name, kind: "function", line: lineStart });
        }

        // Check Next.js App Router route handlers: export async function GET/POST
        if (
          isExported &&
          ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(name.toUpperCase()) &&
          (filePath.includes("/api/") || filePath.endsWith("route.ts") || filePath.endsWith("route.js"))
        ) {
          apiRoutes.push({
            method: name.toUpperCase() as ParsedApiRoute["method"],
            path: filePath.replace(/^.*\/app\//, "/api/").replace(/\/route\.(ts|js)$/, ""),
            handlerName: name,
            lineStart,
            lineEnd,
            authRequired: content.includes("auth") || content.includes("getUser") || content.includes("session"),
          });
        }
      }

      // 5. Class Declarations
      if (ts.isClassDeclaration(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const name = node.name?.text || "AnonymousClass";
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        );
        const classCalls: string[] = [];

        const classSymbol: ParsedSymbol = {
          symbolId: `${filePath}#${name}:${lineStart}`,
          filePath,
          name,
          kind: "class",
          lineStart,
          lineEnd,
          isExported,
          calls: classCalls,
        };
        symbols.push(classSymbol);

        if (isExported) {
          exports.push({ name, kind: "class", line: lineStart });
        }

        // Extract class methods
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member)) {
            const mStart = getLine(member.getStart(sourceFile));
            const mEnd = getEndLine(member.getEnd());
            const mName = member.name.getText(sourceFile);
            const mAsync = Boolean(
              member.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword),
            );
            const mParams = member.parameters.map((p) => p.name.getText(sourceFile));
            const mCalls = extractCalls(member.body);
            mCalls.forEach((c) => {
              if (!classCalls.includes(c)) classCalls.push(c);
            });

            symbols.push({
              symbolId: `${filePath}#${name}.${mName}:${mStart}`,
              filePath,
              name: mName,
              kind: "method",
              lineStart: mStart,
              lineEnd: mEnd,
              isAsync: mAsync,
              isExported,
              params: mParams,
              parentSymbol: name,
              signature: `${mAsync ? "async " : ""}${mName}(${mParams.join(", ")})`,
              calls: mCalls,
            });
          }
        }
      }

      // 6. Interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const name = node.name.text;
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        );

        symbols.push({
          symbolId: `${filePath}#${name}:${lineStart}`,
          filePath,
          name,
          kind: "interface",
          lineStart,
          lineEnd,
          isExported,
        });

        if (isExported) {
          exports.push({ name, kind: "interface", line: lineStart, isTypeOnly: true });
        }
      }

      // 7. Type Aliases
      if (ts.isTypeAliasDeclaration(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const name = node.name.text;
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        );

        symbols.push({
          symbolId: `${filePath}#${name}:${lineStart}`,
          filePath,
          name,
          kind: "type",
          lineStart,
          lineEnd,
          isExported,
        });

        if (isExported) {
          exports.push({ name, kind: "type", line: lineStart, isTypeOnly: true });
        }
      }

      // 8. Enums
      if (ts.isEnumDeclaration(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const name = node.name.text;
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        );

        symbols.push({
          symbolId: `${filePath}#${name}:${lineStart}`,
          filePath,
          name,
          kind: "enum",
          lineStart,
          lineEnd,
          isExported,
        });

        if (isExported) {
          exports.push({ name, kind: "enum", line: lineStart });
        }
      }

      // 9. Variable Statements (const Foo = () => ..., const x = 123)
      if (ts.isVariableStatement(node)) {
        const lineStart = getLine(node.getStart(sourceFile));
        const lineEnd = getEndLine(node.getEnd());
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        );

        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            const init = decl.initializer;

            if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
              const isAsync = Boolean(
                init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword),
              );
              const params = init.parameters.map((p) => p.name.getText(sourceFile));
              const calls = extractCalls(init.body);

              let kind: SymbolKind = "function";
              if (/^[A-Z]/.test(name)) {
                kind = "component";
              } else if (/^use[A-Z]/.test(name)) {
                kind = "hook";
              }

              symbols.push({
                symbolId: `${filePath}#${name}:${lineStart}`,
                filePath,
                name,
                kind,
                lineStart,
                lineEnd,
                isAsync,
                isExported,
                params,
                signature: `const ${name} = ${isAsync ? "async " : ""}(${params.join(", ")}) => ...`,
                calls,
              });

              if (isExported) {
                exports.push({ name, kind: "function", line: lineStart });
              }
            } else {
              // Regular variable
              symbols.push({
                symbolId: `${filePath}#${name}:${lineStart}`,
                filePath,
                name,
                kind: "variable",
                lineStart,
                lineEnd,
                isExported,
              });

              if (isExported) {
                exports.push({ name, kind: "variable", line: lineStart });
              }
            }
          }
        }
      }

      // 10. Express / Fastify / Router Call Expressions (app.get('/users', ...))
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const methodName = expr.name.text.toLowerCase();
          if (["get", "post", "put", "patch", "delete", "all"].includes(methodName)) {
            const callerName = expr.expression.getText(sourceFile).toLowerCase();
            if (
              callerName === "app" ||
              callerName === "router" ||
              callerName === "server" ||
              callerName.includes("route")
            ) {
              const firstArg = node.arguments[0];
              if (firstArg && ts.isStringLiteral(firstArg)) {
                const routePath = firstArg.text;
                const lineStart = getLine(node.getStart(sourceFile));
                const lineEnd = getEndLine(node.getEnd());
                const fullSnippet = node.getText(sourceFile);

                apiRoutes.push({
                  method: methodName.toUpperCase() as ParsedApiRoute["method"],
                  path: routePath,
                  lineStart,
                  lineEnd,
                  authRequired:
                    fullSnippet.includes("auth") ||
                    fullSnippet.includes("protect") ||
                    fullSnippet.includes("verifyToken") ||
                    fullSnippet.includes("jwt"),
                });
              }
            }
          }

          // 11. Database Operations (Supabase, Prisma, Drizzle)
          // Supabase: supabase.from("table").select/insert/update/delete
          const op = expr.name.text.toLowerCase();
          if (["select", "insert", "update", "delete"].includes(op)) {
            const subExpr = expr.expression;
            if (ts.isCallExpression(subExpr) && ts.isPropertyAccessExpression(subExpr.expression)) {
              if (subExpr.expression.name.text === "from") {
                const tableArg = subExpr.arguments[0];
                const tableName =
                  tableArg && ts.isStringLiteral(tableArg) ? tableArg.text : "unknown_table";
                const line = getLine(node.getStart(sourceFile));

                dbCalls.push({
                  table: tableName,
                  operation: op as ParsedDbCall["operation"],
                  line,
                  isParameterized: true,
                  rawSnippet: node.getText(sourceFile).slice(0, 150),
                });
              }
            }
          }

          // Prisma: prisma.user.findMany / create / update / delete
          if (
            ["findmany", "findunique", "findfirst", "create", "createmany", "update", "updatemany", "delete", "deletemany"].includes(op)
          ) {
            const caller = expr.expression;
            if (ts.isPropertyAccessExpression(caller) && caller.expression.getText(sourceFile) === "prisma") {
              const tableName = caller.name.text;
              const mappedOp = op.startsWith("find") ? "select" : op.startsWith("create") ? "insert" : op.startsWith("delete") ? "delete" : "update";
              const line = getLine(node.getStart(sourceFile));

              dbCalls.push({
                table: tableName,
                operation: mappedOp,
                line,
                isParameterized: true,
                rawSnippet: node.getText(sourceFile).slice(0, 150),
              });
            }
          }
        }
      }

      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);

    // ─── 2. DETERMINISTIC AST CODE DEFECTS & SECURITY AUDITING ────────────────

    // Check line-by-line for fast and accurate pattern matching
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        continue;
      }

      // Issue A: Unchecked Nullable Property Access
      if (
        /(?:user|account|member|record|profile|u)\.(?:password|profile|role|email|token|data|settings|name)\b/i.test(trimmed) &&
        !trimmed.includes("?.")
      ) {
        const priorContext = lines.slice(Math.max(0, index - 15), index).join("\n");
        const hasCheck =
          /if\s*\(\s*!(?:user|account|member|record|profile|u)\b|\bif\s*\(\s*(?:user|account|member|record|profile|u)\s*===?\s*null\b|\bif\s*\(\s*(?:user|account|member|record|profile|u)\s*===?\s*undefined\b/i.test(
            priorContext,
          );

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

      // Issue B: Floating Unhandled Promise
      if (
        /\b(?:fetch|supabase\..*|axios\..*)\(/.test(trimmed) &&
        !/\bawait\b/.test(trimmed) &&
        !/\.then|\.catch/.test(trimmed) &&
        !trimmed.startsWith("return ")
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

      // Issue C: SQL Injection via String Interpolation
      if (
        /(?:SELECT|UPDATE|DELETE|INSERT)\s+.*(?:\$\{[^}]+\}|\+\s*[a-zA-Z0-9_]+)/i.test(trimmed) ||
        /query\s*\(\s*["'`].*\$\{.*\}["'`]\s*\)/i.test(trimmed)
      ) {
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

    return {
      filePath,
      language: isTsx ? "tsx" : isJsx ? "jsx" : isJs ? "javascript" : "typescript",
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

