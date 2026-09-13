/**
 * Tool: retrieve_code
 * Secure Read-Only code retrieval with path sanitization and secret redaction.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TenantGuard } from "../../security/tenant-guard";
import { SecretRedactor } from "../../security/secret-redactor";

export interface RetrieveCodeParams {
  path?: string | undefined;
  filePath?: string | undefined;
  startLine?: number | undefined;
  endLine?: number | undefined;
}

export interface RetrieveCodeResult {
  path: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  content: string;
}

export class RetrieveCodeTool {
  static readonly name = "retrieve_code";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph, params: RetrieveCodeParams): RetrieveCodeResult {
    const rawPath = params.path || params.filePath || "";
    if (!rawPath.trim()) {
      throw new Error("File path is required for retrieve_code");
    }

    const safePath = TenantGuard.sanitizeFilePath(rawPath);
    const rawContent = graph.getFileContent(safePath);

    if (rawContent === undefined) {
      throw new Error(`File '${safePath}' not found in project index.`);
    }

    const { redactedText } = SecretRedactor.redact(rawContent);
    const lines = redactedText.split("\n");

    const startLine = Math.max(1, Number(params.startLine || 1));
    const maxLinesPerCall = 150;
    const requestedEnd = params.endLine ? Number(params.endLine) : lines.length;
    const endLine = Math.min(lines.length, Math.min(requestedEnd, startLine + maxLinesPerCall - 1));

    return {
      path: safePath,
      totalLines: lines.length,
      startLine,
      endLine,
      content: lines.slice(startLine - 1, endLine).join("\n"),
    };
  }
}
