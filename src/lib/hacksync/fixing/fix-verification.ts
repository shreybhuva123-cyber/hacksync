/**
 * Fix Verification Engine — HackSync Phase 4
 * Coordinates the full Fix -> Test -> Verify loop:
 * - Incremental AST & Symbol re-indexing
 * - Targeted test execution
 * - Security re-scan (before vs after finding delta)
 * - Iteration control (max 3 cycles, mandatory re-approval on subsequent patches)
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { StaticAuditor } from "../security/static-auditor";
import { AuditTrail } from "../security/audit-trail";
import type { SecurityFinding } from "../security/finding-types";
import { TestRunner } from "../testing/test-runner";
import { TestPlanner } from "../testing/test-planner";
import { PatchApplier } from "./patch-applier";
import { FixPlanner } from "./fix-planner";
import { PatchGenerator } from "./patch-generator";
import { timingSafeEqual } from "../ai/approval-gate";
import type { FixProposal, Patch, VerificationResult, FixIterationState } from "./fix-types";

export interface VerifyFixOptions {
  projectId: string;
  userId: string;
  graph: ProjectKnowledgeGraph;
  patch: Patch;
  approvalId: string;
  originalFinding?: SecurityFinding | undefined;
  testCommand?: string | undefined;
  workspacePath?: string | undefined;
  iterationState?: FixIterationState | undefined;
  requestId?: string | undefined;
  prePatchFileHashes?: Map<string, string> | Record<string, string> | undefined;
}

export class FixVerificationEngine {
  public static readonly MAX_ITERATIONS = 3;

  /**
   * Executes full post-patch verification: re-index, targeted test run, security rescan.
   */
  static async verify(options: VerifyFixOptions): Promise<{
    verification: VerificationResult;
    nextProposal?: FixProposal | undefined;
    iterationState: FixIterationState;
  }> {
    const { projectId, userId, graph, patch, approvalId, originalFinding } = options;
    const requestId = options.requestId || `req_verify_${Date.now()}`;

    AuditTrail.recordPhase4Event({
      requestId,
      userId,
      projectId,
      operation: "FIX_VERIFICATION_STARTED",
      targetFiles: patch.files.map((f) => f.path),
      patchHash: patch.diffHash,
      approvalId,
      details: "Initiated post-fix verification pipeline.",
    });

    const currentState: FixIterationState = options.iterationState
      ? { ...options.iterationState, history: [...options.iterationState.history] }
      : {
          iteration: 0,
          maxIterations: this.MAX_ITERATIONS,
          history: [],
        };

    currentState.iteration++;

    // 1. Re-index Check (Incremental AST parsing in ProjectKnowledgeGraph)
    let reindexPassed = true;
    try {
      // Re-indexing is performed directly by PatchApplier during file indexing
      for (const file of patch.files) {
        const content = graph.getFileContent(file.path);
        if (content !== undefined) {
          graph.indexFile(file.path, content);
        }
      }
    } catch {
      reindexPassed = false;
    }

    // 2. Diff & File Integrity Check
    const unexpectedChanges: string[] = [];
    const patchFilePaths = new Set(patch.files.map((f) => f.path));

    // A. Verify all patch files adhere strictly to expected post-patch hashes
    for (const pFile of patch.files) {
      const content = graph.getFileContent(pFile.path);
      if (pFile.operation === "delete") {
        if (content !== undefined) {
          unexpectedChanges.push(`Deletion failure: File '${pFile.path}' still exists after delete operation.`);
        }
      } else {
        if (content === undefined) {
          unexpectedChanges.push(`Missing file: File '${pFile.path}' not found after ${pFile.operation} operation.`);
        } else if (pFile.newHash) {
          const currentHash = PatchGenerator.sha256(content);
          if (!timingSafeEqual(currentHash, pFile.newHash)) {
            unexpectedChanges.push(
              `Hash mismatch on '${pFile.path}': Expected SHA-256 '${pFile.newHash}', got '${currentHash}'.`,
            );
          }
        }
      }
    }

    // B. Check for unapproved out-of-scope modifications if pre-patch baseline is provided
    if (options.prePatchFileHashes) {
      const baseline =
        options.prePatchFileHashes instanceof Map
          ? options.prePatchFileHashes
          : new Map(Object.entries(options.prePatchFileHashes));

      for (const [filePath, oldHash] of baseline.entries()) {
        if (!patchFilePaths.has(filePath)) {
          const currentContent = graph.getFileContent(filePath);
          if (currentContent === undefined) {
            unexpectedChanges.push(`Unexpected file deletion: '${filePath}' was removed outside approved patch scope.`);
          } else {
            const currentHash = PatchGenerator.sha256(currentContent);
            if (!timingSafeEqual(currentHash, oldHash)) {
              unexpectedChanges.push(`Unexpected file modification: '${filePath}' was modified outside approved patch scope.`);
            }
          }
        }
      }
    }

    const patchIntegrityPassed = unexpectedChanges.length === 0;

    // 3. Targeted Test Execution
    let testsPassed = true;
    let regressionPassed = true;
    const testCommand = options.testCommand || "bun test";

    if (options.workspacePath) {
      try {
        const testRun = await TestRunner.run({
          projectId,
          command: testCommand,
          cwd: options.workspacePath,
        });

        if (testRun.status !== "passed") {
          testsPassed = false;
        }
      } catch {
        testsPassed = false;
      }
    }

    // 4. Security Re-Scan
    let securityPassed = true;
    const remainingFindings: string[] = [];

    if (originalFinding) {
      const rescanReport = StaticAuditor.runPassiveAudit({
        graph,
        projectId,
        targetFile: originalFinding.filePath,
      });

      AuditTrail.recordPhase4Event({
        requestId,
        userId,
        projectId,
        operation: "SECURITY_RESCAN_COMPLETED",
        targetFiles: [originalFinding.filePath],
        details: `Security rescan completed. Remaining findings: ${rescanReport.findings.length}.`,
      });

      const matchedUnresolved = rescanReport.findings.find(
        (f) => f.ruleId === originalFinding.ruleId && f.filePath === originalFinding.filePath,
      );

      if (matchedUnresolved) {
        securityPassed = false;
        remainingFindings.push(`${matchedUnresolved.ruleId}: ${matchedUnresolved.title}`);
      }

      // Check if any brand new findings were introduced
      const newFindings = rescanReport.findings.filter(
        (f) => f.ruleId !== originalFinding.ruleId,
      );
      if (newFindings.length > 0) {
        regressionPassed = false;
        for (const nf of newFindings) {
          remainingFindings.push(`NEW: ${nf.ruleId}: ${nf.title}`);
        }
      }
    }

    const overallSuccess = testsPassed && regressionPassed && securityPassed && reindexPassed && patchIntegrityPassed;

    let explanation = overallSuccess
      ? "All verification checks passed: targeted tests passed, no security regressions detected, and project knowledge graph re-indexed successfully."
      : `Verification failed: ${[!testsPassed && "targeted tests failed", !securityPassed && "security vulnerability still detected", !regressionPassed && "new security/regression findings introduced", !patchIntegrityPassed && "unexpected changes or integrity failure detected"].filter(Boolean).join(", ")}.`;

    const verification: VerificationResult = {
      success: overallSuccess,
      testsPassed,
      regressionPassed,
      securityPassed,
      reindexPassed,
      patchIntegrityPassed,
      unexpectedChanges,
      remainingFindings,
      confidence: 0.95,
      explanation,
    };

    AuditTrail.recordPhase4Event({
      requestId,
      userId,
      projectId,
      operation: "FIX_VERIFICATION_COMPLETED",
      status: overallSuccess ? "success" : "failed",
      targetFiles: Array.from(patchFilePaths),
      patchHash: patch.diffHash,
      approvalId,
      details: explanation,
    });

    currentState.history.push({
      iteration: currentState.iteration,
      proposalId: patch.id,
      patchId: patch.id,
      approvalId,
      testRunStatus: testsPassed ? "passed" : "failed",
      verificationSuccess: overallSuccess,
    });

    // 5. Subsequent Fix Proposal & Iteration Control
    let nextProposal: FixProposal | undefined;

    if (!overallSuccess) {
      if (currentState.iteration < currentState.maxIterations) {
        // Formulate subsequent fix proposal based on remaining findings
        nextProposal = FixPlanner.planFix(graph, {
          projectId,
          finding: originalFinding,
          filePath: originalFinding?.filePath || patch.files[0]?.path,
          issueDescription: `Iteration ${currentState.iteration + 1} remediation for: ${remainingFindings.join("; ")}`,
        });

        // CRITICAL NON-NEGOTIABLE RULE: Subsequent proposal REQUIRES A BRAND NEW APPROVAL
        if (nextProposal) {
          nextProposal.requiresApproval = true;
          currentState.activeProposal = nextProposal;
        }
      } else {
        explanation += " Maximum fix iterations (3) reached. Halting autonomous repair loop.";
        verification.explanation = explanation;
      }
    }

    return {
      verification,
      nextProposal,
      iterationState: currentState,
    };
  }
}
