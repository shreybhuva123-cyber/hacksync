/**
 * Tool: get_project_structure
 * Secure Read-Only project hierarchy, architectural layout, and metrics.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";

export interface ProjectStructureResult {
  metrics: Record<string, any>;
  structure: any;
  architectureProfile: any;
  cycles: string[][];
}

export class GetProjectStructureTool {
  static readonly name = "get_project_structure";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph): ProjectStructureResult {
    return {
      metrics: graph.getMetrics(),
      structure: graph.getStructureTree(),
      architectureProfile: graph.getArchitectureProfile(),
      cycles: graph.getCycles(),
    };
  }
}
