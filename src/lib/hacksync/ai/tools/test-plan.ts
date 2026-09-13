/**
 * Test Plan AI Tool — HackSync Phase 4
 * Formulates targeted, prioritized test plans from modified files, symbols, or security findings.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TestPlanner, type TestPlannerOptions } from "../../testing/test-planner";
import type { TestPlan } from "../../testing/test-types";

export class TestPlanTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: TestPlannerOptions = {},
    projectId = "default-project",
  ): TestPlan {
    return TestPlanner.plan(graph, projectId, params);
  }
}
