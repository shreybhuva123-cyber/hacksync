/**
 * Patch Validator Engine — HackSync Phase 4
 * Enforces strict pre-application integrity verification:
 * - Project confinement & path traversal prevention
 * - SHA-256 base-state verification (detects concurrent file modifications)
 * - Unexpected file scope containment (patchFiles ⊆ approvedFiles)
 * - Cryptographic SHA-256 diff hash validation
 */

import { timingSafeEqual } from "../ai/approval-gate";
import { PatchGenerator } from "./patch-generator";
import type { Patch, PatchValidationResult } from "./fix-types";
import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";

export interface ValidatePatchOptions {
  projectId?: string | undefined;
  patch: Patch;
  graph: ProjectKnowledgeGraph;
  approvedFiles?: string[] | undefined;
  expectedDiffHash?: string | undefined;
}

export class PatchValidator {
  /**
   * Validates a patch prior to application. Fails closed on any discrepancy.
   */
  static validate(options: ValidatePatchOptions): PatchValidationResult {
    const { projectId, patch, graph, approvedFiles, expectedDiffHash } = options;
    const checkedFiles: string[] = [];

    // 1. Project ID Confinement
    if (projectId && patch.projectId !== projectId) {
      return {
        valid: false,
        errorCode: "PATCH_PROJECT_MISMATCH",
        errorMessage: `Patch belongs to project '${patch.projectId}', but target project is '${projectId}'.`,
        checkedFiles,
        baseHashesMatched: false,
        diffHashMatched: false,
      };
    }

    // 2. Diff Hash Cryptographic Integrity Check
    if (expectedDiffHash) {
      const diffMatches = timingSafeEqual(patch.diffHash, expectedDiffHash);
      if (!diffMatches) {
        return {
          valid: false,
          errorCode: "PATCH_HASH_MISMATCH",
          errorMessage: `Cryptographic diff hash mismatch: Expected '${expectedDiffHash}', got '${patch.diffHash}'.`,
          checkedFiles,
          baseHashesMatched: false,
          diffHashMatched: false,
        };
      }
    }

    // 3. Unexpected File Scope Check (patchFiles ⊆ approvedFiles)
    if (approvedFiles && approvedFiles.length > 0) {
      const approvedSet = new Set(approvedFiles.map((f) => f.trim().toLowerCase()));
      for (const pFile of patch.files) {
        if (!approvedSet.has(pFile.path.trim().toLowerCase())) {
          return {
            valid: false,
            errorCode: "UNEXPECTED_PATCH_FILE",
            errorMessage: `Patch attempts to modify unapproved file '${pFile.path}'. Approval was only granted for: [${approvedFiles.join(", ")}].`,
            checkedFiles,
            baseHashesMatched: false,
            diffHashMatched: false,
          };
        }
      }
    }

    // 4. File-by-File Confinement & Base-State Hash Verification
    for (const pFile of patch.files) {
      checkedFiles.push(pFile.path);

      // Path traversal & dangerous character check
      if (
        pFile.path.includes("../") ||
        pFile.path.includes("..\\") ||
        pFile.path.startsWith("/") ||
        pFile.path.startsWith("\\") ||
        /^[a-zA-Z]:/.test(pFile.path)
      ) {
        return {
          valid: false,
          errorCode: "PATCH_PATH_FORBIDDEN",
          errorMessage: `Path traversal or absolute path violation detected in patch target '${pFile.path}'.`,
          checkedFiles,
          baseHashesMatched: false,
          diffHashMatched: false,
        };
      }

      const currentContent = graph.getFileContent(pFile.path);

      if (pFile.operation === "modify" || pFile.operation === "delete") {
        if (currentContent === undefined) {
          return {
            valid: false,
            errorCode: "PATCH_FILE_NOT_FOUND",
            errorMessage: `Cannot ${pFile.operation} file '${pFile.path}': File does not exist in project.`,
            checkedFiles,
            baseHashesMatched: false,
            diffHashMatched: false,
          };
        }

        // Base state hash validation
        const currentHash = PatchGenerator.sha256(currentContent);
        if (pFile.oldHash && currentHash !== pFile.oldHash) {
          return {
            valid: false,
            errorCode: "PATCH_BASE_STATE_MISMATCH",
            errorMessage: `Base state mismatch on '${pFile.path}'. Current hash '${currentHash}' does not match patch baseline '${pFile.oldHash}'. File was modified after patch generation.`,
            checkedFiles,
            baseHashesMatched: false,
            diffHashMatched: false,
          };
        }
      } else if (pFile.operation === "create") {
        if (currentContent !== undefined) {
          return {
            valid: false,
            errorCode: "PATCH_FILE_ALREADY_EXISTS",
            errorMessage: `Cannot create file '${pFile.path}': File already exists in project.`,
            checkedFiles,
            baseHashesMatched: false,
            diffHashMatched: false,
          };
        }
      }
    }

    return {
      valid: true,
      checkedFiles,
      baseHashesMatched: true,
      diffHashMatched: true,
    };
  }
}
