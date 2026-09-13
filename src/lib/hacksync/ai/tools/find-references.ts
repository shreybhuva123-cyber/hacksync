/**
 * Tool: find_references
 * Secure Read-Only reference and dependent graph traversal.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";

export interface FindReferencesParams {
  target: string;
}

export interface ReferencesResult {
  target: string;
  directDependents: string[];
  transitiveDependents: string[];
  responsibleFiles: string[];
  message: string;
}

export class FindReferencesTool {
  static readonly name = "find_references";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph, params: FindReferencesParams): ReferencesResult {
    const target = String(params.target || "").trim();
    if (!target) {
      return {
        target: "",
        directDependents: [],
        transitiveDependents: [],
        responsibleFiles: [],
        message: "No target specified for reference search.",
      };
    }

    const directDependents = graph.findDependents(target);
    const transitiveDependents = graph.getTransitiveDependents(target);
    const responsibleFiles = graph.getFilesResponsibleFor(target);

    return {
      target,
      directDependents,
      transitiveDependents,
      responsibleFiles,
      message: `Found ${directDependents.length} direct and ${transitiveDependents.length} transitive dependent(s) for '${target}'.`,
    };
  }
}
