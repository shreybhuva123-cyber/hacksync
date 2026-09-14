/**
 * Secret Scan AI Tool — HackSync Phase 3
 * Scans codebase files for hardcoded credentials and high-entropy secrets with guaranteed redaction.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { SecretScanner } from "../../security/secret-scanner";
import type { SecurityFinding } from "../../security/finding-types";
import { FindingDeduplicator } from "../../security/finding-deduplicator";

import { AuthorizationError } from "@/lib/errors";

export interface SecretScanParams {
  targetFile?: string | undefined;
}

export class SecretScanTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: SecretScanParams = {},
    projectId: string,
  ): { totalSecrets: number; findings: SecurityFinding[] } {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[SecretScanTool] Authorized projectId is mandatory.");
    }
    const files = params.targetFile ? [params.targetFile] : graph.getAllFilePaths();
    const allFindings: SecurityFinding[] = [];

    for (const file of files) {
      const content = graph.getFileContent(file);
      if (content) {
        const fileFindings = SecretScanner.scanFile(file, content, projectId);
        allFindings.push(...fileFindings);
      }
    }

    const deduplicated = FindingDeduplicator.deduplicate(allFindings);

    return {
      totalSecrets: deduplicated.length,
      findings: deduplicated,
    };
  }
}
