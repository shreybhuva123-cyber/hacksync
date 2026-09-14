/**
 * Patch Applier Engine — HackSync Phase 4
 * Applies approved patches with transactional safety and automatic atomic rollback.
 * Completely independent of Git CLI commands (no git commit, no git push, no git apply).
 */

import { ApprovalGate, timingSafeEqual } from "../ai/approval-gate";
import { AuditTrail } from "../security/audit-trail";
import { PatchValidator } from "./patch-validator";
import { PatchGenerator } from "./patch-generator";
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

/**
 * Senior-grade unified diff hunk applicator.
 * Parses hunk headers (@@ -origStart,origCount +newStart,newCount @@)
 * and reconstructs file contents without losing surrounding context.
 */
export function applyUnifiedDiff(diff: string, originalContent: string): string {
  if (!diff || !diff.trim()) return originalContent;

  const normalizedDiff = diff.replace(/\r\n/g, "\n");
  const normalizedOriginal = originalContent.replace(/\r\n/g, "\n");
  const diffLines = normalizedDiff.split("\n");
  const origLines = normalizedOriginal === "" ? [] : normalizedOriginal.split("\n");

  const hasHunks = diffLines.some((l) => l.startsWith("@@"));
  if (!hasHunks) {
    const plusLines = diffLines.filter((l) => l.startsWith("+")).map((l) => l.slice(1));
    return plusLines.length > 0 ? plusLines.join("\n") : originalContent;
  }

  interface Hunk {
    origStart: number;
    origCount: number;
    lines: string[];
  }

  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;

  for (const line of diffLines) {
    if (line.startsWith("@@")) {
      const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (match && match[1]) {
        currentHunk = {
          origStart: parseInt(match[1], 10),
          origCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
          lines: [],
        };
        hunks.push(currentHunk);
      } else {
        currentHunk = null;
      }
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
        currentHunk.lines.push(line);
      }
    }
  }

  if (hunks.length === 0) {
    return originalContent;
  }

  const resultLines = [...origLines];
  let lineOffset = 0;

  for (const hunk of hunks) {
    let targetIdx = hunk.origStart - 1 + lineOffset;
    if (targetIdx < 0) targetIdx = 0;

    const newHunkLines: string[] = [];
    let origConsumed = 0;

    for (const hLine of hunk.lines) {
      const type = hLine[0];
      const text = hLine.slice(1);

      if (type === " ") {
        newHunkLines.push(text);
        origConsumed++;
      } else if (type === "-") {
        origConsumed++;
      } else if (type === "+") {
        newHunkLines.push(text);
      }
    }

    resultLines.splice(targetIdx, origConsumed, ...newHunkLines);
    lineOffset += newHunkLines.length - origConsumed;
  }

  return resultLines.join("\n");
}

export class PatchApplier {
  /**
   * Applies an approved patch to the project knowledge graph and workspace with transactional rollback safety.
   */
  static async apply(options: ApplyPatchOptions): Promise<PatchApplicationResult> {
    const { projectId, userId, approvalId, patch, graph } = options;
    const requestId = options.requestId || `req_apply_${Date.now()}`;

    // 1. Authoritative verification of the Approval Request
    const approval = await ApprovalGate.getAuthoritativeApproval(approvalId, userId, projectId);
    if (!approval) {
      throw new AuthorizationError(`[PatchApplier] Approval request '${approvalId}' not found.`);
    }

    if (approval.projectId !== projectId) {
      throw new AuthorizationError(
        `[PatchApplier] Approval project mismatch: Approval is for '${approval.projectId}', but target is '${projectId}'.`,
      );
    }

    if (approval.status !== "approved") {
      throw new AuthorizationError(
        `[PatchApplier] Approval '${approvalId}' status is '${approval.status}'. Must be 'approved' before applying.`,
      );
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
          const originalContent = backups.get(pFile.path) || "";
          const newContent = applyUnifiedDiff(pFile.diff, originalContent);

          // Verify post-apply hash if newHash is provided
          if (pFile.newHash) {
            const appliedHash = PatchGenerator.sha256(newContent);
            if (!timingSafeEqual(appliedHash, pFile.newHash)) {
              throw new Error(
                `[PatchApplier] Post-application SHA-256 hash mismatch for '${pFile.path}'. Expected '${pFile.newHash}', got '${appliedHash}'.`,
              );
            }
          }

          graph.indexFile(pFile.path, newContent);
          appliedFiles.push(pFile.path);
        }
      }

      // 6. Atomically consume the approval (transitions from 'approved' to 'applied')
      await ApprovalGate.consumeAuthoritativeApproval({
        approvalId,
        userId,
        projectId,
        expectedDiffHash: patch.diffHash,
      });

      // 7. Record Audit Event
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
      // 8. Atomic Rollback: Restore all original files on any failure
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
}
