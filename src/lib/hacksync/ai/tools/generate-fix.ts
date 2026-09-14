/**
 * Generate Fix AI Tool — HackSync Phase 4
 * Synthesizes evidence-first FixProposals with root cause analysis,
 * unified diffs, and regression risk assessments.
 * Strictly READ_ONLY (generates a proposal; does not modify disk).
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { FixPlanner, type PlanFixOptions } from "../../fixing/fix-planner";
import type { FixProposal } from "../../fixing/fix-types";

import { AuthorizationError } from "@/lib/errors";

export class GenerateFixTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: Partial<PlanFixOptions> = {},
    projectId: string,
  ): FixProposal {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[GenerateFixTool] Authorized projectId is mandatory.");
    }
    return FixPlanner.planFix(graph, {
      projectId,
      finding: params.finding,
      filePath: params.filePath,
      issueDescription: params.issueDescription,
    });
  }
}
