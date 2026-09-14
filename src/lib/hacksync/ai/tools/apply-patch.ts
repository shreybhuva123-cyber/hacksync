/**
 * Apply Patch AI Tool — HackSync Phase 4
 * Applies an approved patch with atomic rollback guarantees.
 * Permission tier: WRITE (requires explicit human approval).
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { PatchApplier, type ApplyPatchOptions } from "../../fixing/patch-applier";
import type { Patch, PatchApplicationResult } from "../../fixing/fix-types";

import { AuthorizationError, AuthenticationError } from "@/lib/errors";

export interface ApplyPatchParams {
  approvalId: string;
  patch: Patch;
  userId?: string | undefined;
}

export class ApplyPatchTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: ApplyPatchParams,
    projectId: string,
    userId: string,
  ): Promise<PatchApplicationResult> {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[ApplyPatchTool] Authorized projectId is mandatory.");
    }
    if (!userId || userId === "system-user" || userId.trim() === "") {
      throw new AuthenticationError("[ApplyPatchTool] Authenticated userId is mandatory.");
    }

    return PatchApplier.apply({
      projectId,
      userId: params.userId || userId,
      approvalId: params.approvalId,
      patch: params.patch,
      graph,
    });
  }
}
