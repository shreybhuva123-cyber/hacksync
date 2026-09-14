/**
 * Dependency Vulnerabilities AI Tool — HackSync Phase 3
 * Inspects manifests against security advisories with graceful offline fallback.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { DependencyVulnerabilityScanner, type DependencyScanResult } from "../../security/dependency-vulnerability-scanner";

import { AuthorizationError } from "@/lib/errors";

export interface DependencyVulnerabilitiesParams {
  manifestFile?: string | undefined;
}

export class DependencyVulnerabilitiesTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: DependencyVulnerabilitiesParams = {},
    projectId: string,
  ): DependencyScanResult {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[DependencyVulnerabilitiesTool] Authorized projectId is mandatory.");
    }
    const targetManifest = params.manifestFile || "package.json";
    const content = graph.getFileContent(targetManifest) || "";

    if (!content) {
      // Check requirements.txt if package.json absent
      const pyContent = graph.getFileContent("requirements.txt");
      if (pyContent) {
        return DependencyVulnerabilityScanner.scanManifest({
          projectId,
          filePath: "requirements.txt",
          content: pyContent,
        });
      }

      return {
        status: "unavailable",
        scannedAt: new Date().toISOString(),
        ecosystem: "unknown",
        manifestPath: targetManifest,
        totalDependencies: 0,
        findings: [],
        securityFindings: [],
        message: `Manifest file '${targetManifest}' not found in project knowledge graph.`,
      };
    }

    return DependencyVulnerabilityScanner.scanManifest({
      projectId,
      filePath: targetManifest,
      content,
    });
  }
}
