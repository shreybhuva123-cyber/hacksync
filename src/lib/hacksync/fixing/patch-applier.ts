/**
 * Patch Applier Engine — HackSync Phase 4
 * Applies approved patches with transactional safety and automatic atomic rollback.
 * Completely independent of Git CLI commands (no git commit, no git push, no git apply).
 */

import { ApprovalGate, timingSafeEqual } from "../ai/approval-gate";
import { AuditTrail } from "../security/audit-trail";
import { PatchValidator } from "./patch-validator";
import type { Patch, PatchApplicationResult } from "./fix-types";
import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { AuthorizationError } from "@/lib/errors";

export interface ApplyPatchOptions {
  projectId: string;
  userId: string;
  approvalId: string;
  patch: Patch;
  graph: ProjectKnowledgeGraph;
  requestId?: string | undefined;
  approvedFiles?: string[] | undefined;
}

export class PatchApplier {
  /**
   * Applies an approved patch to the project knowledge graph and workspace with transactional rollback safety.
   */
  static async apply(options: ApplyPatchOptions): Promise<PatchApplicationResult> {
    const { projectId, userId, approvalId, patch, graph } = options;
    const requestId = options.requestId || `req_apply_${Date.now()}`;

    // 1. Load and verify Authoritative Approval
    const approval = ApprovalGate.getApproval(approvalId);
    if (!approval) {
      throw new AuthorizationError(`[PatchApplier] Approval request '${approvalId}' not found.`);
    }

    if (approval.projectId !== projectId) {
      throw new AuthorizationError(`[PatchApplier] Approval project mismatch: Approval is for '${approval.projectId}', but target is '${projectId}'.`);
    }

    if (approval.status !== "approved") {
      throw new AuthorizationError(`[PatchApplier] Approval '${approvalId}' status is '${approval.status}'. Must be 'approved' before applying.`);
    }

    if (new Date(approval.expiresAt).getTime() < Date.now()) {
      throw new AuthorizationError(`[PatchApplier] Approval '${approvalId}' has expired.`);
    }

    // 2. Revalidate Cryptographic Diff Hash
    if (approval.diffHash && !timingSafeEqual(approval.diffHash, patch.diffHash)) {
      throw new AuthorizationError(`[PatchApplier] Tampered diff detected! Approval diff hash does not match current patch.`);
    }

    // 3. Pre-application Patch Validation (base state, paths, unexpected files)
    const validation = PatchValidator.validate({
      projectId,
      patch,
      graph,
      approvedFiles: options.approvedFiles || approval.filesAffected,
      expectedDiffHash: approval.diffHash,
    });

    if (!validation.valid) {
      AuditTrail.recordPhase4Event({
        requestId,
        userId,
        projectId,
        operation: "PATCH_ROLLBACK",
        status: "failed",
        targetFiles: patch.files.map((f) => f.path),
        patchHash: patch.diffHash,
        approvalId,
        details: `Patch validation failed (${validation.errorCode}): ${validation.errorMessage}`,
      });

      return {
        success: false,
        appliedFiles: [],
        rolledBack: true,
        error: `[PatchApplier] Patch validation failed (${validation.errorCode}): ${validation.errorMessage}`,
      };
    }

    // 4. Transactional Backup: Snapshot previous state for atomic rollback
    const backups = new Map<string, string | undefined>();
    for (const pFile of patch.files) {
      backups.set(pFile.path, graph.getFileContent(pFile.path));
    }

    const appliedFiles: string[] = [];

    try {
      // 5. Apply each file change incrementally
      for (const pFile of patch.files) {
        if (pFile.operation === "delete") {
          graph.removeFile(pFile.path);
          appliedFiles.push(pFile.path);
        } else if (pFile.operation === "create" || pFile.operation === "modify") {
          // Extract new content from patch diff or file representation
          const newContent = this.extractNewContent(pFile.diff, backups.get(pFile.path) || "");
          graph.indexFile(pFile.path, newContent);
          appliedFiles.push(pFile.path);
        }
      }

      // 6. Record Audit Event
      AuditTrail.recordPhase4Event({
        requestId,
        userId,
        projectId,
        operation: "PATCH_APPLIED",
        targetFiles: appliedFiles,
        patchHash: patch.diffHash,
        approvalId,
        details: `Successfully applied patch '${patch.id}' across ${appliedFiles.length} file(s).`,
      });

      return {
        success: true,
        appliedFiles,
        rolledBack: false,
      };
    } catch (err: any) {
      // 7. Atomic Rollback: Restore all original files on any failure
      let rollbackError: string | undefined;
      try {
        for (const [path, originalContent] of backups.entries()) {
          if (originalContent !== undefined) {
            graph.indexFile(path, originalContent);
          } else {
            graph.removeFile(path);
          }
        }

        AuditTrail.recordPhase4Event({
          requestId,
          userId,
          projectId,
          operation: "PATCH_ROLLBACK",
          status: "failed",
          targetFiles: Array.from(backups.keys()),
          patchHash: patch.diffHash,
          approvalId,
          details: `Atomic rollback executed for patch '${patch.id}': ${err?.message}`,
        });
      } catch (rErr: any) {
        rollbackError = rErr?.message;
      }

      return {
        success: false,
        appliedFiles: [],
        rolledBack: true,
        error: err?.message || "Failed to apply patch",
        rollbackError,
      };
    }
  }

  /**
   * Helper to reconstruct file content from a simple unified diff or fallback.
   */
  private static extractNewContent(diff: string, originalContent: string): string {
    const lines = diff.split("\n");
    const newLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;

      if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        newLines.push(line.slice(1));
      }
      // skip '-' lines
    }

    return newLines.length > 0 ? newLines.join("\n") : originalContent;
  }
}
