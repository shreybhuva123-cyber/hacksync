import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { SecretRedactor } from "../security/secret-redactor";
import type { AIFinding, EvidenceItem, FindingSeverity } from "./types";

export class EvidenceEngine {
  /**
   * Transforms raw AST issues and symbol relationships into verified evidence-based findings.
   */
  static collectFindings(graph: ProjectKnowledgeGraph, targetPath?: string): AIFinding[] {
    const rawIssues = graph.getAllIssues();
    const findings: AIFinding[] = [];

    const relevant = targetPath
      ? rawIssues.filter((i) => i.filePath === targetPath)
      : rawIssues;

    relevant.forEach(({ filePath, issue }, idx) => {
      const severity: FindingSeverity =
        issue.severity === "critical"
          ? "CRITICAL"
          : issue.severity === "high"
            ? "HIGH"
            : issue.severity === "medium"
              ? "MEDIUM"
              : "LOW";

      // Build call chain trace if symbol info exists
      const fileSummary = graph.getFileSummary(filePath);
      const surroundingSymbol = fileSummary?.symbols.find(
        (s) => s.lineStart <= issue.line && s.lineEnd >= issue.line,
      );

      const callChain: string[] = [filePath];
      if (surroundingSymbol) {
        callChain.push(`${surroundingSymbol.name}()`);
        if (surroundingSymbol.calls && surroundingSymbol.calls.length > 0) {
          callChain.push(...surroundingSymbol.calls.slice(0, 3).map((c) => `${c}()`));
        }
      }

      // Automatically redact any sensitive credentials from the snippet
      const { redactedText: safeSnippet } = SecretRedactor.redact(issue.snippet);
      const { redactedText: safeFix } = SecretRedactor.redact(issue.suggestedFix);

      const evidenceItem: EvidenceItem = {
        id: `ev-${idx + 1}`,
        filePath,
        line: issue.line,
        snippet: safeSnippet,
        category: issue.type,
        reason: issue.description,
        callChain,
        severity,
        confidence: issue.confidence,
      };

      findings.push({
        id: `FINDING-${idx + 1}`,
        title: issue.title,
        severity,
        confidence: issue.confidence,
        evidenceCount: 1,
        primaryLocation: {
          filePath,
          line: issue.line,
        },
        evidenceItems: [evidenceItem],
        explanation: issue.description,
        impact:
          issue.type === "null_access_before_check"
            ? "API throws unhandled TypeError (HTTP 500 Internal Server Error) when a user does not exist."
            : issue.type === "raw_sql_injection"
              ? "Critical database manipulation or authentication bypass via unauthorized SQL payload."
              : "Unexpected runtime failure or silent error desynchronization.",
        recommendedFix: safeFix,
      });
    });

    return findings;
  }
}
