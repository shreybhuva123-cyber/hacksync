/**
 * Unified AI Orchestrator and Typed Tool System Contracts
 * Phase 2 Standard Type Definitions
 */

import type { AIFinding } from "./types";
import type { AISecurityContext } from "../security/tenant-guard";
import type { Workspace, CodeNode, MemberFile } from "../types";

export type TaskType =
  | "explain"
  | "debug"
  | "security"
  | "architecture"
  | "test"
  | "fix"
  | "verify"
  | "code_search"
  | "impact"
  | "dependency"
  | "project_overview"
  | "git"
  | "general";

export interface TaskPlan {
  taskType: TaskType;
  goal: string;
  requiredEvidence: string[];
  allowedTools: string[];
  maxToolCalls: number;
  requiresModel: boolean;
  confidence: number; // 0.0 - 1.0
}

export interface VerifiedEvidenceItem {
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  confidence: number; // 0.0 - 1.0 or percentage
  relevanceReason?: string | undefined;
  symbolName?: string | undefined;
}

export interface TrustedExecutionContext {
  requestId: string;
  userId: string;
  projectId: string;
  role: string;
}

export interface AIResult {
  requestId: string;
  taskType: TaskType;
  answer: string;
  evidence: VerifiedEvidenceItem[];
  findings?: AIFinding[] | undefined;
  recommendations?: string[] | undefined;
  uncertainty?: string[] | undefined;
  confidence: number; // 0.0 to 1.0
  actionsRequired?: { label: string; action: string; payload?: any }[] | undefined;
  modelUsed: string;
  toolCalls: { name: string; success: boolean; summary: string; executionMs?: number }[];
  metrics?: {
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  } | undefined;

  // Phase 3 Security Intelligence
  securityFindings?: import("../security/finding-types").SecurityFinding[] | undefined;
  securityHealth?: import("../security/finding-types").SecurityHealthBreakdown | undefined;
  dependencyFindings?: import("../security/dependency-vulnerability-scanner").DependencyAdvisoryFinding[] | undefined;
  secretsDetected?: import("../security/finding-types").SecurityFinding[] | undefined;
  securityCoverage?: string | undefined;
  securityMode?: import("../security/finding-types").SecurityMode | undefined;

  // Phase 3 Git / Diff Intelligence
  gitStatus?: import("../git/git-status").GitStatusSummary | undefined;
  diffSummary?: string | undefined;
  changedFiles?: import("../git/diff-parser").ParsedFileDiff[] | undefined;
  changedSymbols?: import("../git/changed-symbols").ChangedSymbol[] | undefined;
  impactAnalysis?: import("../git/git-impact").GitImpactReport | undefined;
  risk?: "low" | "medium" | "high" | "critical" | undefined;
  riskConfidence?: "low" | "medium" | "high" | undefined;
  securityImpact?: import("../git/git-impact").SecuritySensitiveChange[] | undefined;

  // Phase 4 Testing Intelligence & Fix Verification
  testPlan?: import("../testing/test-types").TestPlan | undefined;
  testRun?: import("../testing/test-types").TestRun | undefined;
  fixProposal?: import("../fixing/fix-types").FixProposal | undefined;
  verificationResult?: import("../fixing/fix-types").VerificationResult | undefined;
  approvalRequest?: import("./approval-gate").PendingApprovalRequest | undefined;
}

export interface OrchestratorRequest {
  query: string;
  projectId?: string | undefined;
  userId?: string | undefined;
  securityContext?: AISecurityContext | undefined;
  ws?: Workspace | null | undefined;
  activeNode?: CodeNode | null | undefined;
  memberFiles?: MemberFile[] | undefined;
  modelPreference?: string | undefined;
  chatHistory?: { role: string; content: string }[] | undefined;
  taskOverride?: TaskType | undefined;
  maxBudgetCalls?: number | undefined;
}
