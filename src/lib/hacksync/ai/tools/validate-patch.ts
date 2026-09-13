/**
 * Validate Patch AI Tool — HackSync Phase 4
 * Performs strict pre-application integrity verification:
 * SHA-256 base hashes, diff hashes, path boundaries, and unexpected file prevention.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { PatchValidator, type ValidatePatchOptions } from "../../fixing/patch-validator";
import type { PatchValidationResult, Patch } from "../../fixing/fix-types";

export interface ValidatePatchParams {
  patch: Patch;
  approvedFiles?: string[] | undefined;
  expectedDiffHash?: string | undefined;
}

export class ValidatePatchTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: ValidatePatchParams,
    projectId = "default-project",
  ): PatchValidationResult {
    return PatchValidator.validate({
      projectId,
      patch: params.patch,
      graph,
      approvedFiles: params.approvedFiles,
      expectedDiffHash: params.expectedDiffHash,
    });
  }
}
