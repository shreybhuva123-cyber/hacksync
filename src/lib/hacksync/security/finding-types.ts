/**
 * Security Finding Model & Type Contracts — HackSync Phase 3
 * Decouples severity (impact) from confidence (certainty).
 */

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "informational";

export type FindingConfidence = "very_high" | "high" | "medium" | "low";

export type SecurityCategory =
  | "injection"
  | "xss"
  | "command_injection"
  | "path_traversal"
  | "ssrf"
  | "authentication"
  | "authorization"
  | "jwt_session"
  | "secrets"
  | "cryptography"
  | "insecure_configuration"
  | "database_security";

export interface SecurityFinding {
  id: string;
  projectId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number | undefined;
  endColumn?: number | undefined;
  ruleId: string;
  category: SecurityCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidence: string;
  remediation: string;
  source?: string | undefined;
  sink?: string | undefined;
  references: string[];
  fingerprint: string;
  createdAt: string;
}

export type SecurityMode = "PASSIVE_STATIC_AUDIT" | "ACTIVE_SECURITY_TEST";

export interface SecurityHealthBreakdown {
  score: number; // 0..100
  letterGrade: "A+" | "A" | "B" | "C" | "D" | "F";
  breakdown: {
    criticalPenalty: number;
    highPenalty: number;
    mediumPenalty: number;
    secretExposurePenalty: number;
    dependencyRiskPenalty: number;
    coverageConfidenceAdjustment: number;
  };
  totalFindings: number;
  severityDistribution: Record<FindingSeverity, number>;
  confidenceDistribution: Record<FindingConfidence, number>;
  secretStatus: {
    count: number;
    exposed: boolean;
  };
  dependencyStatus: {
    total: number;
    vulnerable: number;
    status: "clean" | "vulnerable" | "unavailable";
  };
  disclaimer: string;
  calculatedAt: string;
}

export interface SecurityReport {
  mode: SecurityMode;
  projectId: string;
  scannedAt: string;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
    total: number;
  };
  coverage: {
    scannedFilesCount: number;
    totalLoc: number;
  };
}
