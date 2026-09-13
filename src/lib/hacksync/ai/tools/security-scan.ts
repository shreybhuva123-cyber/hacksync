/**
 * Security Scan AI Tool — HackSync Phase 3
 * Runs passive static security audit using AST, SAST rules, and source-sink analysis.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import type { Workspace } from "../../types";
import { StaticAuditor } from "../../security/static-auditor";
import type { SecurityReport } from "../../security/finding-types";

export interface SecurityScanParams {
  targetFile?: string | undefined;
}

export class SecurityScanTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: SecurityScanParams = {},
    projectId = "default-project",
    ws?: Workspace | null,
  ): SecurityReport {
    return StaticAuditor.runPassiveAudit({
      graph,
      projectId,
      ws,
      targetFile: params.targetFile,
    });
  }
}
