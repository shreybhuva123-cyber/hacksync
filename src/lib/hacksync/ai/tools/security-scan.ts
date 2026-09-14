/**
 * Security Scan AI Tool — HackSync Phase 3
 * Runs passive static security audit using AST, SAST rules, and source-sink analysis.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import type { Workspace } from "../../types";
import { StaticAuditor } from "../../security/static-auditor";
import type { SecurityReport } from "../../security/finding-types";

import { AuthorizationError } from "@/lib/errors";

export interface SecurityScanParams {
  targetFile?: string | undefined;
}

export class SecurityScanTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: SecurityScanParams = {},
    projectId: string,
    ws?: Workspace | null,
  ): SecurityReport {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[SecurityScanTool] Authorized projectId is mandatory.");
    }
    return StaticAuditor.runPassiveAudit({
      graph,
      projectId,
      ws,
      targetFile: params.targetFile,
    });
  }
}
