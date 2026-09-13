/**
 * Tool: architecture_summary
 * Secure Read-Only architectural layer breakdown and role mapping.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";

export interface ArchitectureSummaryResult {
  summary: string;
  primaryLanguage: string;
  framework?: string | undefined;
  databaseEngine: string;
  authSystem: string;
  layerCounts: Record<string, number>;
}

export class ArchitectureSummaryTool {
  static readonly name = "architecture_summary";
  static readonly tier = "READ_ONLY";

  static execute(graph: ProjectKnowledgeGraph): ArchitectureSummaryResult {
    const profile = graph.getArchitectureProfile();
    const primaryLang = Object.keys(profile.languageBreakdown)[0] || "TypeScript";

    return {
      summary: profile.summaryText,
      primaryLanguage: primaryLang,
      framework: profile.framework,
      databaseEngine: profile.databaseEngine,
      authSystem: profile.authSystem,
      layerCounts: profile.layerCounts,
    };
  }
}
