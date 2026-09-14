/**
 * Isolated Test Workspace Runner — HackSync Phase 4
 * Creates isolated temporary directory trees for safe test execution and patch validation.
 * Cleans up temporary workspaces automatically after execution and strips secrets.
 *
 * NOTE: Operates as an isolated filesystem workspace copy. Does not claim VM/OS kernel isolation.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { TestRunner } from "./test-runner";
import type { TestRun, TestRunnerOptions } from "./test-types";
import type { Patch } from "../fixing/fix-types";
import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { applyUnifiedDiff } from "../fixing/patch-applier";
import { PatchGenerator } from "../fixing/patch-generator";
import { timingSafeEqual } from "../ai/approval-gate";

export interface SandboxExecutionParams {
  projectId: string;
  graph: ProjectKnowledgeGraph;
  command: string;
  patch?: Patch | undefined;
  extraArgs?: string[] | undefined;
  options?: TestRunnerOptions | undefined;
}

export class SandboxRunner {
  /**
   * Executes a test command in an isolated temporary workspace copy.
   */
  static async runInSandbox(params: {
    projectId: string;
    command: string;
    graph: ProjectKnowledgeGraph;
    patch?: Patch | undefined;
    extraArgs?: string[] | undefined;
    options?: TestRunnerOptions | undefined;
  }): Promise<TestRun> {
    const sandboxDir = mkdtempSync(join(tmpdir(), `hacksync-workspace-${params.projectId}-`));

    try {
      // 1. Populate isolated workspace with files from KnowledgeGraph
      const allFiles = params.graph.getAllFilePaths();
      for (const filePath of allFiles) {
        // Strip production .env files from workspace to prevent credential leakage
        if (filePath === ".env" || filePath.startsWith(".env.")) {
          continue;
        }

        const content = params.graph.getFileContent(filePath);
        if (content !== undefined) {
          const targetPath = join(sandboxDir, filePath);
          const dir = dirname(targetPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(targetPath, content, "utf-8");
        }
      }

      // Add safe test workspace environment variables mock
      const safeEnvMock = "NODE_ENV=test\nCI=true\n";
      writeFileSync(join(sandboxDir, ".env.sandbox"), safeEnvMock, "utf-8");

      // 2. Apply patch in isolated workspace if provided
      if (params.patch) {
        for (const pFile of params.patch.files) {
          const targetPath = join(sandboxDir, pFile.path);
          const dir = dirname(targetPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          if (pFile.operation === "delete") {
            if (existsSync(targetPath)) {
              rmSync(targetPath, { force: true });
            }
          } else {
            const originalContent = params.graph.getFileContent(pFile.path) || "";
            const patchedContent = applyUnifiedDiff(pFile.diff, originalContent);

            if (pFile.newHash) {
              const computedHash = PatchGenerator.sha256(patchedContent);
              if (!timingSafeEqual(computedHash, pFile.newHash)) {
                throw new Error(
                  `[SandboxRunner] Hash mismatch when applying patch to isolated workspace for '${pFile.path}'. Expected '${pFile.newHash}', got '${computedHash}'.`,
                );
              }
            }

            writeFileSync(targetPath, patchedContent, "utf-8");
          }
        }
      }

      // 3. Execute allowlisted test runner via TestRunner
      const testRun = await TestRunner.run({
        projectId: params.projectId,
        command: params.command,
        cwd: sandboxDir,
        extraArgs: params.extraArgs,
        options: params.options,
      });

      return testRun;
    } catch (err: any) {
      return {
        id: `run_sandbox_error_${Date.now()}`,
        projectId: params.projectId,
        framework: params.command.split(" ")[0] || "unknown",
        command: params.command,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: "failed",
        summary: { total: 1, passed: 0, failed: 1, skipped: 0 },
        stdout: "",
        stderr: err?.message || "Sandbox execution error",
        failures: [{
          testName: "SandboxRunner",
          message: err?.message || "Sandbox execution failed",
          classification: "environment",
        }],
        confidence: 0.8,
      };
    } finally {
      // 4. Guaranteed cleanup of temporary workspace
      try {
        rmSync(sandboxDir, { recursive: true, force: true });
      } catch {
        // Non-blocking cleanup failure
      }
    }
  }
}
