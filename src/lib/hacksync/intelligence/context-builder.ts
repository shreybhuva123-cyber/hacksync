/**
 * Project Context Builder for HackSync Project Intelligence
 * 
 * Assembles high-density, verified codebase context for LLM prompts:
 * - Exact line numbers and verified code snippets
 * - Call chains and symbol signatures
 * - Architectural layer classification
 * - Secret redaction on all snippets via SecretRedactor
 * - Enforces token/character budget limit (default 12,000 chars / ~3,000 tokens)
 * - Safe fallback when no relevant evidence exists to eliminate hallucinations
 */

import { SecretRedactor } from "../security/secret-redactor";
import type { RetrievalResult } from "./retrieval-engine";
import type { ProjectArchitectureProfile } from "./architecture-detector";
import type { AIFinding } from "../ai/types";

export interface ContextBuilderOptions {
  maxCharacters?: number | undefined; // Default 12,000 characters
  includeArchitectureProfile?: boolean | undefined;
}

export interface BuiltContext {
  formattedContext: string;
  totalCharacters: number;
  totalTokensEstimate: number;
  evidenceItemsCount: number;
  hasSufficientEvidence: boolean;
}

export class ProjectContextBuilder {
  private static readonly DEFAULT_MAX_CHARS = 12000;

  /**
   * Builds high-density prompt context from retrieval results, findings, and architecture profile.
   */
  static build(
    retrieval: RetrievalResult,
    findings: AIFinding[] = [],
    archProfile?: ProjectArchitectureProfile | undefined,
    options: ContextBuilderOptions = {},
  ): BuiltContext {
    const maxChars = options.maxCharacters || this.DEFAULT_MAX_CHARS;
    const sections: string[] = [];
    let currentLength = 0;
    let evidenceCount = 0;

    // Check if we have any evidence
    const hasEvidence = retrieval.hits.length > 0 || findings.length > 0;

    if (!hasEvidence) {
      const fallbackText = `[Project Context]: Insufficient project evidence found for query '${retrieval.query}'. No matching symbols or files located in the project index.`;
      return {
        formattedContext: fallbackText,
        totalCharacters: fallbackText.length,
        totalTokensEstimate: Math.ceil(fallbackText.length / 4),
        evidenceItemsCount: 0,
        hasSufficientEvidence: false,
      };
    }

    // 1. Architecture Profile Header (if requested & available)
    if (options.includeArchitectureProfile !== false && archProfile) {
      const archSection = `### PROJECT ARCHITECTURE PROFILE
${archProfile.summaryText}
`;
      sections.push(archSection);
      currentLength += archSection.length;
    }

    // 2. Verified Deterministic AST Code Defects & Security Findings
    if (findings.length > 0) {
      const findingBlocks: string[] = ["### VERIFIED AST CODE ISSUES & EVIDENCE:"];

      for (const f of findings) {
        const item = f.evidenceItems[0];
        const rawSnippet = item?.snippet || "";
        const { redactedText: safeSnippet } = SecretRedactor.redact(rawSnippet);
        const { redactedText: safeFix } = SecretRedactor.redact(f.recommendedFix);

        const block = `
- [${f.severity}] ${f.title}
  File: ${f.primaryLocation.filePath}:${f.primaryLocation.line}
  Confidence: ${f.confidence}%
  Explanation: ${f.explanation}
  Code Snippet:
  \`\`\`
  ${safeSnippet}
  \`\`\`
  Suggested Fix:
  \`\`\`
  ${safeFix}
  \`\`\``;

        if (currentLength + block.length > maxChars) break;
        findingBlocks.push(block);
        currentLength += block.length;
        evidenceCount++;
      }

      sections.push(findingBlocks.join("\n"));
    }

    // 3. Retrieved File Snippets & Exact Line Ranges
    if (retrieval.hits.length > 0) {
      const snippetBlocks: string[] = ["\n### RELEVANT CODEBASE EVIDENCE:"];

      for (const hit of retrieval.hits) {
        const rawSnippet = hit.snippet || "";
        const { redactedText: safeSnippet } = SecretRedactor.redact(rawSnippet);

        const rangeStr = hit.lineRange
          ? ` (Lines ${hit.lineRange.start}-${hit.lineRange.end})`
          : "";

        const uniqueSymbols = Array.from(new Set(hit.matchedSymbols.map((s) => s.name))).slice(0, 5);
        const symStr = uniqueSymbols.length > 0 ? ` | Symbols: ${uniqueSymbols.join(", ")}` : "";

        const block = `
#### File: ${hit.filePath}${rangeStr}${symStr}
Match Reasons: ${hit.matchReasons.slice(0, 3).join(", ")}
\`\`\`
${safeSnippet}
\`\`\``;

        if (currentLength + block.length > maxChars) {
          const remaining = maxChars - currentLength;
          if (remaining > 80) {
            const truncatedBlock = block.slice(0, remaining - 30) + "\n```\n... [truncated to budget]";
            snippetBlocks.push(truncatedBlock);
            currentLength += truncatedBlock.length;
            evidenceCount++;
          }
          break;
        }

        snippetBlocks.push(block);
        currentLength += block.length;
        evidenceCount++;
      }

      sections.push(snippetBlocks.join("\n"));
    }

    let finalContext = sections.join("\n\n").trim();
    if (finalContext.length > maxChars) {
      finalContext = finalContext.slice(0, maxChars - 30) + "\n... [truncated to budget]";
    }

    return {
      formattedContext: finalContext,
      totalCharacters: finalContext.length,
      totalTokensEstimate: Math.ceil(finalContext.length / 4),
      evidenceItemsCount: evidenceCount,
      hasSufficientEvidence: evidenceCount > 0,
    };
  }
}
