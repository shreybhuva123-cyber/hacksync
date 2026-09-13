/**
 * Test Framework Detector — HackSync Phase 4
 * Automatically detects repository testing frameworks and package managers.
 */

import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import type { TestFrameworkInfo } from "./test-types";

export class TestFrameworkDetector {
  /**
   * Detects the primary testing framework from files in the project knowledge graph.
   */
  static detect(graph: ProjectKnowledgeGraph): TestFrameworkInfo {
    const allFiles = graph.getAllFilePaths();
    const pkgContent = graph.getFileContent("package.json");
    let pkgJson: any = null;
    if (pkgContent) {
      try {
        pkgJson = JSON.parse(pkgContent);
      } catch {
        // ignore malformed JSON
      }
    }

    const packageManager = this.detectPackageManager(allFiles);

    // 1. Check Browser / E2E Frameworks
    const playwrightConfig = allFiles.find((f) => /playwright\.config\.(ts|js|mjs|cjs)$/i.test(f));
    if (playwrightConfig || (pkgJson?.devDependencies?.["@playwright/test"] || pkgJson?.dependencies?.["@playwright/test"])) {
      return {
        framework: "playwright",
        language: "typescript",
        configFiles: playwrightConfig ? [playwrightConfig] : [],
        testFilePatterns: ["**/*.spec.ts", "**/*.spec.js", "tests/e2e/**/*.ts"],
        packageManager,
        confidence: playwrightConfig ? 0.95 : 0.85,
      };
    }

    const cypressConfig = allFiles.find((f) => /cypress\.config\.(ts|js|mjs|cjs)$/i.test(f) || f === "cypress.json");
    if (cypressConfig || (pkgJson?.devDependencies?.["cypress"] || pkgJson?.dependencies?.["cypress"])) {
      return {
        framework: "cypress",
        language: "javascript",
        configFiles: cypressConfig ? [cypressConfig] : [],
        testFilePatterns: ["cypress/e2e/**/*.cy.ts", "cypress/e2e/**/*.cy.js"],
        packageManager,
        confidence: cypressConfig ? 0.95 : 0.85,
      };
    }

    // 2. Check JS/TS Unit / Integration Frameworks
    const vitestConfig = allFiles.find((f) => /vitest\.config\.(ts|js|mjs|mts)$/i.test(f));
    if (vitestConfig || (pkgJson?.devDependencies?.["vitest"] || pkgJson?.dependencies?.["vitest"])) {
      return {
        framework: "vitest",
        language: "typescript",
        configFiles: vitestConfig ? [vitestConfig] : [],
        testFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"],
        packageManager,
        confidence: vitestConfig ? 0.95 : 0.88,
      };
    }

    const jestConfig = allFiles.find((f) => /jest\.config\.(ts|js|json|mjs|cjs)$/i.test(f));
    if (jestConfig || (pkgJson?.devDependencies?.["jest"] || pkgJson?.dependencies?.["jest"])) {
      return {
        framework: "jest",
        language: "typescript",
        configFiles: jestConfig ? [jestConfig] : [],
        testFilePatterns: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
        packageManager,
        confidence: jestConfig ? 0.95 : 0.85,
      };
    }

    const mochaConfig = allFiles.find((f) => /\.mocharc\.(json|js|yml|yaml)$/i.test(f));
    if (mochaConfig || (pkgJson?.devDependencies?.["mocha"] || pkgJson?.dependencies?.["mocha"])) {
      return {
        framework: "mocha",
        language: "javascript",
        configFiles: mochaConfig ? [mochaConfig] : [],
        testFilePatterns: ["test/**/*.js", "tests/**/*.js"],
        packageManager,
        confidence: mochaConfig ? 0.92 : 0.80,
      };
    }

    // Bun test check: bunfig.toml, bun.lockb, or bun test scripts in package.json
    const hasBunConfig = allFiles.includes("bunfig.toml");
    const hasBunLock = allFiles.some((f) => f.includes("bun.lock"));
    const hasBunTestScript = pkgJson?.scripts?.test?.includes("bun test");
    if (hasBunConfig || hasBunLock || hasBunTestScript) {
      return {
        framework: "bun:test",
        language: "typescript",
        configFiles: hasBunConfig ? ["bunfig.toml"] : [],
        testFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx"],
        packageManager: "bun",
        confidence: hasBunConfig || hasBunTestScript ? 0.95 : 0.85,
      };
    }

    // 3. Check Python Frameworks
    const pyprojectContent = graph.getFileContent("pyproject.toml") || "";
    const pytestIni = allFiles.find((f) => f === "pytest.ini" || f.endsWith("/pytest.ini"));
    const reqContent = graph.getFileContent("requirements.txt") || "";

    if (pytestIni || pyprojectContent.includes("pytest") || reqContent.toLowerCase().includes("pytest")) {
      return {
        framework: "pytest",
        language: "python",
        configFiles: pytestIni ? [pytestIni] : pyprojectContent.includes("pytest") ? ["pyproject.toml"] : [],
        testFilePatterns: ["test_*.py", "*_test.py", "tests/**/*.py"],
        packageManager: allFiles.includes("poetry.lock") ? "poetry" : "pip",
        confidence: pytestIni ? 0.95 : 0.88,
      };
    }

    const hasPythonFiles = allFiles.some((f) => f.endsWith(".py"));
    if (hasPythonFiles && allFiles.some((f) => f.startsWith("tests/") || f.startsWith("test/"))) {
      return {
        framework: "unittest",
        language: "python",
        configFiles: [],
        testFilePatterns: ["test_*.py", "*_test.py"],
        packageManager: "pip",
        confidence: 0.75,
      };
    }

    const hasTsTestFiles = allFiles.some(
      (f) => f.includes(".test.ts") || f.includes(".spec.ts") || f.includes(".test.js") || f.includes(".spec.js"),
    );
    if (hasTsTestFiles || packageManager === "bun") {
      return {
        framework: "bun:test",
        language: "typescript",
        configFiles: [],
        testFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js"],
        packageManager: packageManager || "bun",
        confidence: 0.85,
      };
    }

    // Default fallback
    return {
      framework: "unknown",
      language: "typescript",
      configFiles: [],
      testFilePatterns: ["**/*.test.ts", "**/*.test.js"],
      packageManager,
      confidence: 0.2,
    };
  }

  private static detectPackageManager(allFiles: string[]): string | undefined {
    if (allFiles.some((f) => f.endsWith("bun.lockb") || f.endsWith("bun.lock"))) return "bun";
    if (allFiles.some((f) => f.endsWith("pnpm-lock.yaml"))) return "pnpm";
    if (allFiles.some((f) => f.endsWith("yarn.lock"))) return "yarn";
    if (allFiles.some((f) => f.endsWith("package-lock.json"))) return "npm";
    if (allFiles.some((f) => f.endsWith("poetry.lock"))) return "poetry";
    if (allFiles.some((f) => f.endsWith("Pipfile.lock"))) return "pipenv";
    return undefined;
  }
}
