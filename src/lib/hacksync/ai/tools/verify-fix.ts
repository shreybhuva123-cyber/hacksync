/**
 * Verify Fix AI Tool — HackSync Phase 4
 * Executes multi-dimensional verification: re-indexing, targeted testing, and security rescan.
 * Permission tier: READ / EXECUTE.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { FixVerificationEngine, type VerifyFixOptions } from "../../fixing/fix-verification";
import type { Patch, VerificationResult, FixProposal, FixIterationState } from "../../fixing/fix-types";
import type { SecurityFinding } from "../../security/finding-types";

export interface VerifyFixParams {
  patch: Patch;
  approvalId: string;
  originalFinding?: SecurityFinding | undefined;
  testCommand?: string | undefined;
  workspacePath?: string | undefined;
  iterationState?: FixIterationState | undefined;
}

export class VerifyFixTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: VerifyFixParams,
    projectId = "default-project",
    userId = "system-user",
  ): Promise<{
    verification: VerificationResult;
    nextProposal?: FixProposal | undefined;
    iterationState: FixIterationState;
  }> {
    return FixVerificationEngine.verify({
      projectId,
      userId,
      graph,
      patch: params.patch,
      approvalId: params.approvalId,
      originalFinding: params.originalFinding,
      testCommand: params.testCommand,
      workspacePath: params.workspacePath,
      iterationState: params.iterationState,
    });
  }
}
