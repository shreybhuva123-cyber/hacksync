import type {
  CodeParser,
  ParsedAstSummary,
  ParsedExport,
  CodeIssueCandidate,
} from "./parser-interface";

export class JsonParser implements CodeParser {
  canParse(filePath: string): boolean {
    return /\.json$/i.test(filePath);
  }

  parse(filePath: string, content: string): ParsedAstSummary {
    const lines = content.split("\n");
    const exports: ParsedExport[] = [];
    const issues: CodeIssueCandidate[] = [];

    try {
      const parsed = JSON.parse(content);

      if (filePath.endsWith("package.json") && typeof parsed === "object" && parsed !== null) {
        // Collect dependencies as exports / symbols
        const allDeps = {
          ...(parsed.dependencies || {}),
          ...(parsed.devDependencies || {}),
        };

        Object.entries(allDeps).forEach(([depName, version]) => {
          exports.push({
            name: `${depName}@${String(version)}`,
            kind: "variable",
            line: 1,
          });

          // Check for wildcard unpinned dependencies
          if (version === "*" || version === "latest") {
            issues.push({
              id: `issue-unpinned-dep-${depName}`,
              line: 1,
              type: "missing_auth",
              severity: "medium",
              confidence: 90,
              title: `Unpinned Dependency (${depName}) - Version: ${String(version)}`,
              description: `Dependency '${depName}' is configured with unpinned wildcard '${String(version)}', creating risks of unexpected upstream breaking changes or compromised supply chain updates.`,
              snippet: `"${depName}": "${String(version)}"`,
              suggestedFix: `Pin to an exact or semver-caret version (e.g. "^1.0.0")`,
            });
          }
        });
      }
    } catch {
      issues.push({
        id: "issue-malformed-json",
        line: 1,
        type: "unhandled_error",
        severity: "high",
        confidence: 100,
        title: "Malformed JSON Syntax",
        description: `File '${filePath}' contains invalid JSON syntax and cannot be parsed.`,
        snippet: lines[0] || "",
        suggestedFix: "Validate JSON structure against standard format.",
      });
    }

    return {
      filePath,
      language: "json",
      imports: [],
      exports,
      symbols: [],
      apiRoutes: [],
      dbCalls: [],
      issues,
      loc: lines.length,
    };
  }
}
