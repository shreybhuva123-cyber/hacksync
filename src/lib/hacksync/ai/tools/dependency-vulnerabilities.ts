/**
 * Dependency Vulnerabilities AI Tool — HackSync Phase 3
 * Inspects manifests against security advisories with graceful offline fallback.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { DependencyVulnerabilityScanner, type DependencyScanResult } from "../../security/dependency-vulnerability-scanner";

export interface DependencyVulnerabilitiesParams {
  manifestFile?: string | undefined;
}

export class DependencyVulnerabilitiesTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: DependencyVulnerabilitiesParams = {},
    projectId = "default-project",
  ): DependencyScanResult {
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
