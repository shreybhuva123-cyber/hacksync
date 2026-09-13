/**
 * Fix Engine & Patch System Type Contracts — HackSync Phase 4
 * Strictly uses SHA-256 for all base-state and diff hashes.
 */

import type { VerifiedEvidenceItem } from "../ai/tool-types";

export interface PatchFile {
  path: string;
  operation: "modify" | "create" | "delete" | "rename";
  oldHash?: string | undefined;
  newHash?: string | undefined;
  diff: string;
}

export interface Patch {
  id: string;
  projectId: string;
  baseStateHash: string;
  diffHash: string;
  files: PatchFile[];
  createdAt: string;
}

export interface FixProposal {
  id: string;
  projectId: string;
  findingId?: string | undefined;
  title: string;
  rootCause: string;
  evidence: VerifiedEvidenceItem[];
  affectedFiles: string[];
  affectedSymbols: string[];
  explanation: string;
  patch: Patch;
  expectedBehavior: string;
  regressionRisks: string[];
  securityImpact?: string | undefined;
  confidence: number;
  requiresApproval: true;
}

export interface PatchValidationResult {
  valid: boolean;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  checkedFiles: string[];
  baseHashesMatched: boolean;
  diffHashMatched: boolean;
}

export interface PatchApplicationResult {
  success: boolean;
  appliedFiles: string[];
  rolledBack: boolean;
  error?: string | undefined;
  rollbackError?: string | undefined;
}

export interface VerificationResult {
  success: boolean;
  testsPassed: boolean;
  regressionPassed: boolean;
  securityPassed: boolean;
  reindexPassed: boolean;
  patchIntegrityPassed: boolean;
  unexpectedChanges: string[];
  remainingFindings: string[];
  confidence: number;
  explanation: string;
}

export interface FixIterationState {
  iteration: number;
  maxIterations: number;
  activeProposal?: FixProposal | undefined;
  history: {
    iteration: number;
    proposalId: string;
    patchId: string;
    approvalId?: string | undefined;
    testRunStatus?: string | undefined;
    verificationSuccess: boolean;
  }[];
}
