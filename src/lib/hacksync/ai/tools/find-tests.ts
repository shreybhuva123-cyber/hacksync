/**
 * Find Tests AI Tool — HackSync Phase 4
 * Discovers project test suites, individual tests, and source-to-test coverage mappings.
 * Strictly READ_ONLY.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TestDiscovery } from "../../testing/test-discovery";
import type { TestDiscoveryResult } from "../../testing/test-types";

import { AuthorizationError } from "@/lib/errors";

export interface FindTestsParams {
  targetFile?: string | undefined;
}

export class FindTestsTool {
  static execute(
    graph: ProjectKnowledgeGraph,
    params: FindTestsParams = {},
    projectId: string,
  ): TestDiscoveryResult {
    if (!projectId || projectId === "default-project" || projectId.trim() === "") {
      throw new AuthorizationError("[FindTestsTool] Authorized projectId is mandatory.");
    }
    const discovery = TestDiscovery.discover(graph, projectId);
    if (params.targetFile) {
      const mapped = discovery.fileCoverageMapping[params.targetFile] || [];
      return {
        ...discovery,
        testFiles: mapped.map((m) => m.testFile),
      };
    }
    return discovery;
  }
}
