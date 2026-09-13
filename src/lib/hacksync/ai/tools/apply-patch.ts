/**
 * Apply Patch AI Tool — HackSync Phase 4
 * Applies an approved patch with atomic rollback guarantees.
 * Permission tier: WRITE (requires explicit human approval).
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { PatchApplier, type ApplyPatchOptions } from "../../fixing/patch-applier";
import type { Patch, PatchApplicationResult } from "../../fixing/fix-types";

export interface ApplyPatchParams {
  approvalId: string;
  patch: Patch;
  userId?: string | undefined;
}

export class ApplyPatchTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: ApplyPatchParams,
    projectId = "default-project",
    userId = "system-user",
  ): Promise<PatchApplicationResult> {
    return PatchApplier.apply({
      projectId,
      userId: params.userId || userId,
      approvalId: params.approvalId,
      patch: params.patch,
      graph,
    });
  }
}
