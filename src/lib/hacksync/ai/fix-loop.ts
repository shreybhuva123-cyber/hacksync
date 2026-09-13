import { ApprovalGate, type PendingApprovalRequest } from "./approval-gate";
import type { AIFinding } from "./types";

export interface FixLoopState {
  findingId: string;
  stage: "ROOT_CAUSE_ANALYSIS" | "FIX_PLAN" | "PENDING_APPROVAL" | "PATCH_APPLIED" | "TESTING" | "VERIFIED" | "FAILED";
  bugTitle: string;
  rootCause: string;
  impact: string;
  fixSteps: string[];
  patchDiff: string;
  approvalId?: string | undefined;
  testPassed?: boolean | undefined;
  feedback?: string | undefined;
}

export class FixLoopEngine {
  /**
   * Initializes a fix plan workflow for a detected finding.
   */
  static startFixWorkflow(
    finding: AIFinding,
    requestId: string,
    projectId: string,
    userId: string,
  ): { state: FixLoopState; approvalRequest: PendingApprovalRequest } {
    const patchDiff = `--- a/${finding.primaryLocation.filePath}\n+++ b/${finding.primaryLocation.filePath}\n@@ Line ${finding.primaryLocation.line} @@\n+${finding.recommendedFix}`;

    const approvalRequest = ApprovalGate.createApprovalRequest({
      requestId,
      projectId,
      userId,
      toolName: "apply_patch",
      summary: `Fix: ${finding.title}`,
      rationale: finding.explanation,
      filesAffected: [finding.primaryLocation.filePath],
      diffPreview: patchDiff,
    });

    const state: FixLoopState = {
      findingId: finding.id,
      stage: "PENDING_APPROVAL",
      bugTitle: finding.title,
      rootCause: finding.explanation,
      impact: finding.impact,
      fixSteps: [
        "1. Identify where nullable entity is accessed prior to validation.",
        "2. Add defensive null/undefined check before dereferencing properties.",
        "3. Return sanitized error response without leaking stack traces or entity existence.",
        "4. Run unit and regression tests to confirm fix.",
      ],
      patchDiff,
      approvalId: approvalRequest.id,
    };

    return { state, approvalRequest };
  }

  /**
   * Advances the fix loop once user approves or tests pass.
   */
  static verifyFix(state: FixLoopState, testPassed: boolean): FixLoopState {
    if (testPassed) {
      return {
        ...state,
        stage: "VERIFIED",
        testPassed: true,
        feedback: "Patch successfully verified! Regression tests passed with 0 errors.",
      };
    }

    return {
      ...state,
      stage: "FAILED",
      testPassed: false,
      feedback: "Regression tests failed after applying patch. Re-analyzing root cause...",
    };
  }
}
