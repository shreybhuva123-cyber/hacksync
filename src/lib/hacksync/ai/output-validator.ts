/**
 * Evidence-First Output Validator & Citation Checker
 * Validates AI responses against real codebase evidence and flags hallucinated files/lines.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { TaskType, VerifiedEvidenceItem, AIResult } from "./tool-types";
import type { AIFinding } from "./types";

export interface CitationMatch {
  raw: string;
  filePath: string;
  lineStart?: number | undefined;
  lineEnd?: number | undefined;
}

export class OutputValidator {
  /**
   * Extracts file and line citations from model-generated text.
   * Matches patterns like:
   * - `src/api/login.ts:86`
   * - `src/api/login.ts` (Line 86)
   * - `src/api/login.ts` [Lines 10-25]
   * - `src/components/Header.tsx`
   */
  static extractCitations(text: string): CitationMatch[] {
    const citations: CitationMatch[] = [];
    const seen = new Set<string>();

    // Pattern 1: `path/to/file.ext:123` or `path/to/file.ext:123-145`
    const colonPattern = /`?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)(?:-(\d+))?`?/g;
    let match: RegExpExecArray | null;
    while ((match = colonPattern.exec(text)) !== null) {
      const filePath = match[1]?.replace(/\\/g, "/") || "";
      const lineStart = match[2] ? parseInt(match[2], 10) : undefined;
      const lineEnd = match[3] ? parseInt(match[3], 10) : lineStart;
      const key = `${filePath}:${lineStart}-${lineEnd}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({ raw: match[0], filePath, lineStart, lineEnd });
      }
    }

    // Pattern 2: `path/to/file.ext` (Line 123) or [Lines 10-25]
    const linePattern = /`?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)`?\s*(?:\(|\[)\s*(?:Lines?|Line)\s*(\d+)(?:\s*-\s*(\d+))?\s*(?:\)|\])/gi;
    while ((match = linePattern.exec(text)) !== null) {
      const filePath = match[1]?.replace(/\\/g, "/") || "";
      const lineStart = match[2] ? parseInt(match[2], 10) : undefined;
      const lineEnd = match[3] ? parseInt(match[3], 10) : lineStart;
      const key = `${filePath}:${lineStart}-${lineEnd}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({ raw: match[0], filePath, lineStart, lineEnd });
      }
    }

    // Pattern 3: general backticked file paths like `src/api/login.ts`
    const pathPattern = /`([a-zA-Z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|sql|py|md|env))`(?!\s*[:(\[])/g;
    while ((match = pathPattern.exec(text)) !== null) {
      const filePath = match[1]?.replace(/\\/g, "/") || "";
      if (!seen.has(filePath)) {
        seen.add(filePath);
        citations.push({ raw: match[0], filePath });
      }
    }

    return citations;
  }

  /**
   * Validates generated text against knowledge graph and verified evidence.
   */
  static validate(params: {
    text: string;
    taskType: TaskType;
    graph: ProjectKnowledgeGraph;
    evidence: VerifiedEvidenceItem[];
    findings?: AIFinding[] | undefined;
    baseConfidence?: number | undefined;
  }): {
    verifiedAnswer: string;
    uncertainty?: string[] | undefined;
    confidence: number;
    validatedCitations: CitationMatch[];
  } {
    const { text, taskType, graph, evidence, findings, baseConfidence = 0.9 } = params;
    const uncertainty: string[] = [];
    let confidence = baseConfidence;

    const citations = this.extractCitations(text);
    const validCitations: CitationMatch[] = [];

    // 1. Verify existence of each cited file in the project
    for (const citation of citations) {
      const exists = graph.hasFile(citation.filePath);
      if (!exists) {
        uncertainty.push(`Unverified citation: '${citation.filePath}' does not exist in the indexed project files.`);
        confidence = Math.max(0.2, confidence - 0.2);
      } else {
        validCitations.push(citation);
      }
    }

    // 2. Check for ground truth when evidence is empty
    let verifiedAnswer = text;
    if (evidence.length === 0 && (!findings || findings.length === 0) && validCitations.length === 0) {
      if (taskType === "debug" || taskType === "security" || taskType === "code_search") {
        if (!text.toLowerCase().includes("insufficient project evidence") && !text.toLowerCase().includes("no matching")) {
          uncertainty.push("Zero verified evidence found for query in project index.");
          confidence = Math.min(confidence, 0.4);
        }
      }
    }

    return {
      verifiedAnswer,
      uncertainty: uncertainty.length > 0 ? uncertainty : undefined,
      confidence: Math.round(confidence * 100) / 100,
      validatedCitations: validCitations,
    };
  }
}
