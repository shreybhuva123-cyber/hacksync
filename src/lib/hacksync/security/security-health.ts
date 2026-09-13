/**
 * Heuristic Security Health Score Calculator — HackSync Phase 3
 * Evaluates static findings, secret disclosures, and dependency risks.
 * Explicitly labeled as a heuristic engineering indicator, NOT a proof of security.
 */

import type { SecurityFinding, SecurityHealthBreakdown, FindingSeverity, FindingConfidence } from "./finding-types";
import type { DependencyAdvisoryFinding } from "./dependency-vulnerability-scanner";

export class SecurityHealthCalculator {
  static readonly DISCLAIMER =
    "This score is a heuristic engineering indicator, not a proof of security. It reflects static AST patterns, dependency advisories, and credential scans identified within indexed files, and does not guarantee the absence of runtime vulnerabilities or zero-day flaws.";

  /**
   * Calculates the heuristic SecurityHealthBreakdown for a project.
   */
  static calculate(params: {
    findings: SecurityFinding[];
    dependencyFindings?: DependencyAdvisoryFinding[] | undefined;
    scannedFilesCount?: number | undefined;
    dependencyStatus?: "clean" | "vulnerable" | "unavailable" | undefined;
  }): SecurityHealthBreakdown {
    const { findings, dependencyFindings = [], scannedFilesCount = 1, dependencyStatus = "clean" } = params;

    const severityDistribution: Record<FindingSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const confidenceDistribution: Record<FindingConfidence, number> = {
      very_high: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let secretCount = 0;

    for (const f of findings) {
      severityDistribution[f.severity] = (severityDistribution[f.severity] || 0) + 1;
      confidenceDistribution[f.confidence] = (confidenceDistribution[f.confidence] || 0) + 1;
      if (f.category === "secrets") {
        secretCount++;
      }
    }

    // Penalties
    const criticalPenalty = severityDistribution.critical * 20;
    const highPenalty = severityDistribution.high * 10;
    const mediumPenalty = severityDistribution.medium * 5;
    const secretExposurePenalty = secretCount > 0 ? Math.min(30, secretCount * 10) : 0;
    const dependencyRiskPenalty = dependencyFindings.length > 0 ? Math.min(25, dependencyFindings.length * 5) : 0;

    // Coverage confidence adjustment (+5 bonus if at least 3 files scanned with no criticals)
    let coverageConfidenceAdjustment = 0;
    if (scannedFilesCount >= 3 && severityDistribution.critical === 0) {
      coverageConfidenceAdjustment = 5;
    }

    const totalPenalties =
      criticalPenalty + highPenalty + mediumPenalty + secretExposurePenalty + dependencyRiskPenalty;

    const rawScore = 100 - totalPenalties + coverageConfidenceAdjustment;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    let letterGrade: SecurityHealthBreakdown["letterGrade"] = "F";
    if (score >= 95) letterGrade = "A+";
    else if (score >= 85) letterGrade = "A";
    else if (score >= 75) letterGrade = "B";
    else if (score >= 65) letterGrade = "C";
    else if (score >= 50) letterGrade = "D";

    return {
      score,
      letterGrade,
      breakdown: {
        criticalPenalty,
        highPenalty,
        mediumPenalty,
        secretExposurePenalty,
        dependencyRiskPenalty,
        coverageConfidenceAdjustment,
      },
      totalFindings: findings.length,
      severityDistribution,
      confidenceDistribution,
      secretStatus: {
        count: secretCount,
        exposed: secretCount > 0,
      },
      dependencyStatus: {
        total: dependencyFindings.length,
        vulnerable: dependencyFindings.filter((d) => d.severity === "critical" || d.severity === "high").length,
        status: dependencyStatus,
      },
      disclaimer: this.DISCLAIMER,
      calculatedAt: new Date().toISOString(),
    };
  }
}
