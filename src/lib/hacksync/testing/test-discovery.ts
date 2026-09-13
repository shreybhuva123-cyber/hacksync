/**
 * Test Discovery Engine — HackSync Phase 4
 * Discovers test files, test suites, individual test cases, and establishes
 * honest source-to-test file coverage mappings.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { TestFrameworkDetector } from "./test-framework-detector";
import type { TestDiscoveryResult, TestSuite, TestFrameworkInfo } from "./test-types";

export class TestDiscovery {
  /**
   * Discovers all tests, suites, and coverage mappings within the project.
   */
  static discover(graph: ProjectKnowledgeGraph, projectId: string): TestDiscoveryResult {
    const frameworkInfo = TestFrameworkDetector.detect(graph);
    const allFiles = graph.getAllFilePaths();

    // 1. Identify test files
    const testFiles = allFiles.filter((path) => this.isTestFile(path));

    // 2. Parse suites and test names from test files
    const suites: TestSuite[] = [];
    for (const testPath of testFiles) {
      const content = graph.getFileContent(testPath) || "";
      const parsedSuite = this.parseSuite(testPath, content, frameworkInfo.framework);
      suites.push(parsedSuite);
    }

    // 3. Establish source -> test coverage mapping
    const fileCoverageMapping: Record<string, { testFile: string; confidence: "high" | "medium" | "low" }[]> = {};
    const sourceFiles = allFiles.filter((p) => !this.isTestFile(p) && this.isSourceFile(p));

    for (const src of sourceFiles) {
      const mappings: { testFile: string; confidence: "high" | "medium" | "low" }[] = [];
      const srcBase = this.getFileBasenameWithoutExt(src);

      for (const tFile of testFiles) {
        const tContent = graph.getFileContent(tFile) || "";
        const tBase = this.getFileBasenameWithoutExt(tFile);

        // A. Direct mirror path or basename matching
        if (tBase === `${srcBase}.test` || tBase === `${srcBase}.spec` || tBase === `test_${srcBase}` || tBase === `${srcBase}_test`) {
          mappings.push({ testFile: tFile, confidence: "high" });
          continue;
        }

        // B. Source file imported directly in test file
        const normalizedSrcImport = src.replace(/\.[^/.]+$/, "");
        if (tContent.includes(normalizedSrcImport) || tContent.includes(srcBase)) {
          // Check import statements
          if (new RegExp(`from\\s+["'][^"']*${srcBase}["']`, "i").test(tContent) ||
              new RegExp(`require\\s*\\(["'][^"']*${srcBase}["']\\)`, "i").test(tContent) ||
              new RegExp(`import\\s+.*${srcBase}`, "i").test(tContent)) {
            mappings.push({ testFile: tFile, confidence: "high" });
            continue;
          }

          mappings.push({ testFile: tFile, confidence: "medium" });
          continue;
        }

        // C. Directory/package similarity
        const srcDir = src.split("/")[0] || "";
        if (srcDir && tFile.includes(srcDir) && tContent.includes(srcBase)) {
          mappings.push({ testFile: tFile, confidence: "low" });
        }
      }

      if (mappings.length > 0) {
        fileCoverageMapping[src] = mappings;
      }
    }

    // 4. Formulate candidate test commands
    const testCommands = this.generateTestCommands(frameworkInfo, testFiles);

    return {
      projectId,
      frameworkInfo,
      testFiles,
      suites,
      fileCoverageMapping,
      testCommands,
    };
  }

  private static isTestFile(path: string): boolean {
    const pLower = path.toLowerCase();
    return (
      pLower.includes(".test.") ||
      pLower.includes(".spec.") ||
      pLower.includes("/__tests__/") ||
      pLower.includes("/tests/") ||
      pLower.includes("/test/") ||
      pLower.startsWith("test_") ||
      pLower.endsWith("_test.py") ||
      pLower.endsWith(".cy.ts") ||
      pLower.endsWith(".cy.js")
    );
  }

  private static isSourceFile(path: string): boolean {
    return (
      (path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".js") ||
        path.endsWith(".jsx") ||
        path.endsWith(".py")) &&
      !path.endsWith(".d.ts") &&
      !path.includes("node_modules/")
    );
  }

  private static parseSuite(filePath: string, content: string, framework: string): TestSuite {
    const testNames: string[] = [];
    const lines = content.split("\n");
    let name = this.getFileBasenameWithoutExt(filePath);

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for describe("...", ...) block name
      const describeMatch = trimmed.match(/describe\s*\(\s*["'`](.+?)["'`]/);
      if (describeMatch && describeMatch[1] && name === this.getFileBasenameWithoutExt(filePath)) {
        name = describeMatch[1];
      }

      // JS / TS test runners: it("...", ...), test("...", ...)
      const jsTestMatch = trimmed.match(/(?:it|test)\s*\(\s*["'`](.+?)["'`]/);
      if (jsTestMatch && jsTestMatch[1]) {
        testNames.push(jsTestMatch[1]);
        continue;
      }

      // Python test runners: def test_foo(...)
      const pyTestMatch = trimmed.match(/^def\s+(test_[a-zA-Z0-9_]+)\s*\(/);
      if (pyTestMatch && pyTestMatch[1]) {
        testNames.push(pyTestMatch[1]);
      }
    }

    return {
      filePath,
      name,
      testNames,
      framework,
    };
  }

  private static getFileBasenameWithoutExt(path: string): string {
    const parts = path.split("/");
    const filename = parts[parts.length - 1] || path;
    return filename.replace(/\.[^/.]+$/, "");
  }

  private static generateTestCommands(frameworkInfo: TestFrameworkInfo, testFiles: string[]): string[] {
    const commands: string[] = [];
    switch (frameworkInfo.framework) {
      case "bun:test":
        commands.push("bun test");
        if (testFiles[0]) commands.push(`bun test ${testFiles[0]}`);
        break;
      case "vitest":
        commands.push("bunx vitest run");
        if (testFiles[0]) commands.push(`bunx vitest run ${testFiles[0]}`);
        break;
      case "jest":
        commands.push("bunx jest");
        if (testFiles[0]) commands.push(`bunx jest ${testFiles[0]}`);
        break;
      case "pytest":
        commands.push("pytest");
        if (testFiles[0]) commands.push(`pytest ${testFiles[0]}`);
        break;
      case "playwright":
        commands.push("playwright test");
        break;
      case "cypress":
        commands.push("cypress run");
        break;
      default:
        commands.push("bun test");
    }
    return commands;
  }
}
