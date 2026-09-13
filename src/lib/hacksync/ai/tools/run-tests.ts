/**
 * Run Tests AI Tool — HackSync Phase 4
 * Executes allowlisted test runners in a controlled, sandboxed environment.
 * Permission tier: EXECUTE.
 */

import type { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { SandboxRunner } from "../../testing/sandbox-runner";
import { TestRunner } from "../../testing/test-runner";
import type { TestRun, TestRunnerOptions } from "../../testing/test-types";

export interface RunTestsParams {
  command?: string | undefined;
  targetFile?: string | undefined;
  workspacePath?: string | undefined;
  options?: TestRunnerOptions | undefined;
}

export class RunTestsTool {
  static async execute(
    graph: ProjectKnowledgeGraph,
    params: RunTestsParams = {},
    projectId = "default-project",
  ): Promise<TestRun> {
    const command = params.command || (params.targetFile ? `bun test ${params.targetFile}` : "bun test");

    if (params.workspacePath) {
      return TestRunner.run({
        projectId,
        command,
        cwd: params.workspacePath,
        options: params.options,
      });
    }

    return SandboxRunner.runInSandbox({
      projectId,
      command,
      graph,
      options: params.options,
    });
  }
}
