/**
 * Context Planner for HackSync Unified AI Orchestrator
 * Analyzes TaskPlan and extracts bounded, high-signal project intelligence.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { TaskPlan } from "./tool-types";
import { SecretRedactor } from "../security/secret-redactor";
import type { Workspace } from "../types";

export interface ContextSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  relevanceReason: string;
}

export interface PlannedContext {
  targetFiles: string[];
  targetSymbols: string[];
  snippets: ContextSnippet[];
  architectureContext?: string | undefined;
  apiContractsContext?: string | undefined;
  databaseSchemaContext?: string | undefined;
  formattedContext: string;
  hasSufficientEvidence: boolean;
  characterCount: number;
}

export interface ContextPlannerOptions {
  maxChars?: number;
  maxSnippets?: number;
  activeFilePath?: string | undefined;
}

export class ContextPlanner {
  /**
   * Plans and extracts minimal, high-signal codebase context based on TaskPlan and project intelligence.
   */
  static planContext(params: {
    plan: TaskPlan;
    query: string;
    graph: ProjectKnowledgeGraph;
    ws?: Workspace | null | undefined;
    options?: ContextPlannerOptions | undefined;
  }): PlannedContext {
    const { plan, query, graph, ws, options } = params;
    const maxChars = options?.maxChars ?? 8_000;
    const maxSnippets = options?.maxSnippets ?? 8;
    const activeFilePath = options?.activeFilePath;

    const targetFiles = new Set<string>();
    const targetSymbols = new Set<string>();
    const snippets: ContextSnippet[] = [];

    if (activeFilePath) {
      targetFiles.add(activeFilePath);
    }

    // 1. Symbol-based retrieval for high-signal code locations
    const queryTokens = query
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["the", "and", "for", "why", "how", "what", "with"].includes(t.toLowerCase()));

    for (const token of queryTokens) {
      const found = graph.findSymbol(token);
      if (found.length > 0) {
        for (const sym of found.slice(0, 3)) {
          targetSymbols.add(sym.name);
          if (sym.filePath) {
            targetFiles.add(sym.filePath);
          }
        }
      }
    }

    // 2. Fetch code slices for target files
    for (const filePath of Array.from(targetFiles).slice(0, 4)) {
      const raw = graph.getFileContent(filePath);
      if (raw) {
        const { redactedText } = SecretRedactor.redact(raw);
        const lines = redactedText.split("\n");
        const boundedSlice = lines.slice(0, Math.min(lines.length, 60)).join("\n");

        snippets.push({
          filePath,
          startLine: 1,
          endLine: Math.min(lines.length, 60),
          content: boundedSlice,
          relevanceReason: `Directly matched target file or symbol in '${filePath}'`,
        });
      }
    }

    // 3. Extract Architecture Context if relevant to the task
    let architectureContext: string | undefined;
    if (plan.taskType === "architecture" || plan.taskType === "project_overview" || plan.taskType === "explain") {
      const arch = graph.getArchitectureProfile();
      architectureContext = `### Architecture Profile:\n- Framework: ${arch.framework}\n- Database: ${arch.databaseEngine}\n- Auth System: ${arch.authSystem}\n- Scale: ${arch.totalFiles} files (${arch.totalLoc} LOC)`;
      if (arch.layerCounts) {
        const layerLines = Object.entries(arch.layerCounts)
          .filter(([_, count]) => count > 0)
          .map(([layer, count]) => `  • ${layer.toUpperCase()}: ${count} file(s)`);
        if (layerLines.length > 0) {
          architectureContext += `\n- Detected Layers:\n` + layerLines.join("\n");
        }
      }
    }

    // 4. Extract API Contracts if relevant
    let apiContractsContext: string | undefined;
    if (ws?.contracts && ws.contracts.length > 0 && (plan.taskType === "architecture" || plan.taskType === "debug" || query.toLowerCase().includes("api") || query.toLowerCase().includes("contract"))) {
      apiContractsContext = `### Registered API Contracts (${ws.contracts.length}):\n` +
        ws.contracts.slice(0, 6).map((c) => `- \`${c.method} ${c.route}\` (Auth: ${c.auth_required ? "Required" : "Public"})`).join("\n");
    }

    // 5. Extract Database Schema if relevant
    let databaseSchemaContext: string | undefined;
    if (ws?.tables && ws.tables.length > 0 && (plan.taskType === "architecture" || query.toLowerCase().includes("sql") || query.toLowerCase().includes("database") || query.toLowerCase().includes("table"))) {
      databaseSchemaContext = `### Database Tables (${ws.tables.length}):\n` +
        ws.tables.slice(0, 5).map((t) => `- Table: \`${t.name}\``).join("\n");
    }

    // 6. Assemble and enforce bounded character budget
    const sections: string[] = [];

    if (architectureContext) {
      sections.push(architectureContext);
    }
    if (apiContractsContext) {
      sections.push(apiContractsContext);
    }
    if (databaseSchemaContext) {
      sections.push(databaseSchemaContext);
    }

    let currentLength = sections.join("\n\n").length;

    for (const snip of snippets.slice(0, maxSnippets)) {
      const snipText = `### File: \`${snip.filePath}\` [Lines ${snip.startLine}-${snip.endLine}]\n*Relevance: ${snip.relevanceReason}*\n\`\`\`typescript\n${snip.content}\n\`\`\``;
      if (currentLength + snipText.length <= maxChars) {
        sections.push(snipText);
        currentLength += snipText.length;
      } else {
        break;
      }
    }

    const formattedContext = sections.join("\n\n---\n\n");
    const hasSufficientEvidence = snippets.length > 0 || !!architectureContext || !!apiContractsContext;

    return {
      targetFiles: Array.from(targetFiles),
      targetSymbols: Array.from(targetSymbols),
      snippets,
      architectureContext,
      apiContractsContext,
      databaseSchemaContext,
      formattedContext,
      hasSufficientEvidence,
      characterCount: formattedContext.length,
    };
  }
}
