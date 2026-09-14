/**
 * Generate Tests AI Tool — HackSync Phase 4
 * Synthesizes structured test case proposals and unified diff patches.
 * Strictly READ_ONLY (never directly modifies disk).
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TestGenerator, type GenerateTestOptions } from "../../testing/test-generator";
import type { GeneratedTestProposal } from "../../testing/test-types";

import { AuthorizationError } from "@/lib/errors";

export class GenerateTestsTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: Partial<GenerateTestOptions> = {},
    projectId: string,
  ): GeneratedTestProposal {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[GenerateTestsTool] Authorized projectId is mandatory.");
    }
    const targetFile = params.targetFile || graph.getAllFilePaths()[0] || "src/index.ts";
    const existingContent = graph.getFileContent(targetFile) || "";

    return TestGenerator.generateProposal({
      projectId,
      targetFile,
      targetSymbol: params.targetSymbol,
      framework: params.framework,
      existingTestPath: params.existingTestPath,
      existingTestContent: params.existingTestPath ? graph.getFileContent(params.existingTestPath) : undefined,
      securityFinding: params.securityFinding,
    });
  }
}
