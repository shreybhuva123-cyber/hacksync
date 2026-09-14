/**
 * Security Health AI Tool — HackSync Phase 3
 * Returns heuristic project health score, penalty breakdown, and mandatory disclaimer.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import type { Workspace } from "../../types";
import { StaticAuditor } from "../../security/static-auditor";
import { SecurityHealthCalculator } from "../../security/security-health";
import { DependencyVulnerabilityScanner } from "../../security/dependency-vulnerability-scanner";
import type { SecurityHealthBreakdown } from "../../security/finding-types";

import { AuthorizationError } from "@/lib/errors";

export class SecurityHealthTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    projectId: string,
    ws?: Workspace | null,
  ): SecurityHealthBreakdown {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[SecurityHealthTool] Authorized projectId is mandatory.");
    }
    const report = StaticAuditor.runPassiveAudit({ graph, projectId, ws });

    const pkgContent = graph.getFileContent("package.json");
    let depResult = pkgContent
      ? DependencyVulnerabilityScanner.scanManifest({ projectId, filePath: "package.json", content: pkgContent })
      : undefined;

    return SecurityHealthCalculator.calculate({
      findings: report.findings,
      dependencyFindings: depResult?.findings,
      scannedFilesCount: report.coverage.scannedFilesCount,
      dependencyStatus: depResult?.status,
    });
  }
}
