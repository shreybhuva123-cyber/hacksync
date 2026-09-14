/**
 * Test Plan AI Tool — HackSync Phase 4
 * Formulates targeted, prioritized test plans from modified files, symbols, or security findings.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TestPlanner, type TestPlannerOptions } from "../../testing/test-planner";
import type { TestPlan } from "../../testing/test-types";

import { AuthorizationError } from "@/lib/errors";

export class TestPlanTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: TestPlannerOptions = {},
    projectId: string,
  ): TestPlan {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[TestPlanTool] Authorized projectId is mandatory.");
    }
    return TestPlanner.plan(graph, projectId, params);
  }
}
