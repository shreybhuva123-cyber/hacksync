/**
 * Tool: dependency_impact
 * Secure Read-Only change impact analysis and blast radius calculator.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TenantGuard } from "../../security/tenant-guard";

export interface DependencyImpactParams {
  target: string;
}

export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DependencyImpactResult {
  target: string;
  directDependents: string[];
  transitiveDependents: string[];
  affectedRoutes: string[];
  riskTier: RiskTier;
  blastRadiusScore: number; // 0..100
  recommendations: string[];
}

export class DependencyImpactTool {
  static readonly name = "dependency_impact";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph, params: DependencyImpactParams): DependencyImpactResult {
    let target = String(params.target || "").trim();
    if (!target) {
      throw new Error("Target file or symbol name is required for dependency_impact");
    }

    // If target looks like a path, sanitize it
    if (target.includes("/") || target.includes("\\") || target.includes(".")) {
      try {
        target = TenantGuard.sanitizeFilePath(target);
      } catch {
        // keep as symbol target
      }
    }

    const directDependents = graph.findDependents(target);
    const transitiveDependents = graph.getTransitiveDependents(target);
    const allAffected = Array.from(new Set([...directDependents, ...transitiveDependents]));

    // Check if any affected files define API routes
    const apiRoutes = graph.getApiRoutes();
    const affectedRoutes: string[] = [];

    for (const r of apiRoutes) {
      if (allAffected.includes(r.filePath) || r.filePath === target) {
        affectedRoutes.push(`${r.method.toUpperCase()} ${r.path} (${r.filePath})`);
      }
    }

    // Calculate blast radius score
    let score = allAffected.length * 15 + affectedRoutes.length * 25;
    score = Math.min(100, Math.max(10, score));

    let riskTier: RiskTier = "LOW";
    if (score >= 75 || affectedRoutes.length >= 2) {
      riskTier = "CRITICAL";
    } else if (score >= 50 || affectedRoutes.length > 0) {
      riskTier = "HIGH";
    } else if (score >= 25) {
      riskTier = "MEDIUM";
    }

    const recommendations: string[] = [];
    if (affectedRoutes.length > 0) {
      recommendations.push(
        `Verify backwards compatibility for ${affectedRoutes.length} affected API endpoint(s) before shipping changes.`,
      );
    }
    if (allAffected.length > 3) {
      recommendations.push(`Run regression tests across ${allAffected.length} dependent files.`);
    } else {
      recommendations.push("Direct unit test coverage on the modified target is sufficient.");
    }

    return {
      target,
      directDependents,
      transitiveDependents,
      affectedRoutes,
      riskTier,
      blastRadiusScore: score,
      recommendations,
    };
  }
}
