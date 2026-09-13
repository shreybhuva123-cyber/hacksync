/**
 * Git Impact & Regression Risk Analyzer — HackSync Phase 3
 * Connects diff changes to the Phase 1 dependency graph to compute blast radius,
 * downstream impact, security-sensitive changes, and estimated regression risk.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { ParsedFileDiff } from "./diff-parser";
import type { ChangedSymbol } from "./changed-symbols";
import type { FindingSeverity, FindingConfidence, SecurityCategory } from "../security/finding-types";

export interface SecuritySensitiveChange {
  filePath: string;
  symbolName?: string | undefined;
  securityCategory: SecurityCategory;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidence: string;
  impactExplanation: string;
}

export interface GitImpactReport {
  changedFilesCount: number;
  changedSymbolsCount: number;
  directDependents: string[];
  transitiveDependents: string[];
  affectedRoutes: { method: string; path: string; filePath: string }[];
  affectedDatabaseTables: string[];
  affectedArchitectureLayers: string[];
  securitySensitiveChanges: SecuritySensitiveChange[];
  regressionRisk: {
    risk: "low" | "medium" | "high" | "critical";
    confidence: "low" | "medium" | "high";
    blastRadiusScore: number; // 0..100
    reasons: string[];
  };
  disclaimer: string;
}

export class GitImpactEngine {
  static readonly DISCLAIMER =
    "This impact analysis provides an estimated blast radius based on static dependency graphs and symbol calls. It represents potential downstream risk, not guaranteed runtime breakage.";

  /**
   * Evaluates downstream dependency impact, blast radius, and security sensitivities of Git diffs.
   */
  static analyze(params: {
    fileDiffs: ParsedFileDiff[];
    changedSymbols: ChangedSymbol[];
    graph: ProjectKnowledgeGraph;
  }): GitImpactReport {
    const { fileDiffs, changedSymbols, graph } = params;

    const directDependentsSet = new Set<string>();
    const transitiveDependentsSet = new Set<string>();
    const affectedTablesSet = new Set<string>();
    const affectedLayersSet = new Set<string>();
    const securityChanges: SecuritySensitiveChange[] = [];

    const changedFilePaths = new Set(fileDiffs.map((d) => d.newPath || d.oldPath).filter(Boolean));

    // 1. Dependency Graph Traversals
    for (const filePath of changedFilePaths) {
      // Direct callers/dependents
      const direct = graph.findDependents(filePath);
      direct.forEach((dep) => {
        if (!changedFilePaths.has(dep)) directDependentsSet.add(dep);
      });

      // Transitive blast radius
      const transitive = graph.getTransitiveDependents(filePath, 6);
      transitive.forEach((dep) => {
        if (!changedFilePaths.has(dep)) transitiveDependentsSet.add(dep);
      });

      // Architecture role
      const summary = graph.getFileSummary(filePath);
      if (summary?.architectureRole) {
        affectedLayersSet.add(summary.architectureRole);
      }

      // Check for security-sensitive file paths
      const fLower = filePath.toLowerCase();
      if (
        fLower.includes("auth") ||
        fLower.includes("security") ||
        fLower.includes("jwt") ||
        fLower.includes("token") ||
        fLower.includes("permission") ||
        fLower.includes("session") ||
        fLower.includes(".env") ||
        fLower.includes("crypto") ||
        fLower.includes("middleware")
      ) {
        securityChanges.push({
          filePath,
          securityCategory: fLower.includes("jwt") ? "jwt_session" : "authentication",
          severity: "high",
          confidence: "high",
          evidence: `Modified security-sensitive component: ${filePath}`,
          impactExplanation: `Changes in ${filePath} directly influence authentication, authorization, or cryptographic session validation.`,
        });
      }
    }

    // 2. Changed Symbols Analysis
    for (const sym of changedSymbols) {
      const sLower = sym.symbolName.toLowerCase();
      if (
        sLower.includes("auth") ||
        sLower.includes("login") ||
        sLower.includes("password") ||
        sLower.includes("token") ||
        sLower.includes("verify") ||
        sLower.includes("jwt") ||
        sLower.includes("role") ||
        sLower.includes("permission")
      ) {
        securityChanges.push({
          filePath: sym.filePath,
          symbolName: sym.symbolName,
          securityCategory: "authentication",
          severity: "high",
          confidence: "very_high",
          evidence: `Modified security-sensitive symbol: ${sym.symbolName} in ${sym.filePath}`,
          impactExplanation: `Altering ${sym.symbolName} can alter authentication assertions or access control boundaries across callers.`,
        });
      }

      if (sym.symbolKind === "database_call") {
        const parts = sym.symbolName.split(".");
        if (parts[1]) affectedTablesSet.add(parts[1]);
      }
    }

    // 3. Find Affected API Routes
    const allRoutes = graph.getApiRoutes();
    const affectedRoutes = allRoutes.filter((r) => {
      // If the route handler file itself was changed or is a dependent of changed files
      return (
        changedFilePaths.has(r.filePath) ||
        directDependentsSet.has(r.filePath) ||
        transitiveDependentsSet.has(r.filePath)
      );
    });

    if (affectedRoutes.length > 0) {
      affectedLayersSet.add("route");
    }

    // 4. Calculate Blast Radius Score and Regression Risk
    const totalDownstream = transitiveDependentsSet.size;
    let blastRadiusScore = 10;
    const reasons: string[] = [];

    if (changedFilePaths.size > 0) {
      reasons.push(`${changedFilePaths.size} file(s) modified across working changes.`);
    }

    if (totalDownstream > 0) {
      blastRadiusScore += Math.min(40, totalDownstream * 8);
      reasons.push(`${totalDownstream} downstream module(s) depend directly or transitively on modified files.`);
    }

    if (affectedRoutes.length > 0) {
      blastRadiusScore += Math.min(25, affectedRoutes.length * 5);
      reasons.push(`${affectedRoutes.length} public API endpoint(s) depend on changed modules.`);
    }

    if (securityChanges.length > 0) {
      blastRadiusScore += 25;
      reasons.push(`${securityChanges.length} security-sensitive area(s) modified (auth, session, or crypto).`);
    }

    if (affectedTablesSet.size > 0) {
      blastRadiusScore += 15;
      reasons.push(`Database operations modified affecting table(s): ${Array.from(affectedTablesSet).join(", ")}.`);
    }

    blastRadiusScore = Math.min(100, blastRadiusScore);

    let risk: GitImpactReport["regressionRisk"]["risk"] = "low";
    if (blastRadiusScore >= 75) risk = "critical";
    else if (blastRadiusScore >= 50) risk = "high";
    else if (blastRadiusScore >= 25) risk = "medium";

    let confidence: GitImpactReport["regressionRisk"]["confidence"] = "medium";
    if (graph.getAllFilePaths().length >= 3) {
      confidence = "high";
    }

    return {
      changedFilesCount: changedFilePaths.size,
      changedSymbolsCount: changedSymbols.length,
      directDependents: Array.from(directDependentsSet),
      transitiveDependents: Array.from(transitiveDependentsSet),
      affectedRoutes,
      affectedDatabaseTables: Array.from(affectedTablesSet),
      affectedArchitectureLayers: Array.from(affectedLayersSet),
      securitySensitiveChanges: securityChanges,
      regressionRisk: {
        risk,
        confidence,
        blastRadiusScore,
        reasons,
      },
      disclaimer: this.DISCLAIMER,
    };
  }
}
