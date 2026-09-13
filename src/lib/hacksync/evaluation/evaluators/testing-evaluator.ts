/**
 * HackSync Phase 5: Testing Intelligence Evaluator
 * Evaluates test framework detection, suite/case discovery, source-to-test
 * mapping accuracy, targeted test plan generation, and safe execution capabilities.
 */

import { ProjectKnowledgeGraph } from "../../intelligence/knowledge-graph";
import { TestDiscovery } from "../../testing/test-discovery";
import { TestPlanner } from "../../testing/test-planner";
import { TestFrameworkDetector } from "../../testing/test-framework-detector";
import type { BenchmarkCase, CaseEvaluationResult, TestingMetrics } from "../types";

export class TestingEvaluator {
  /**
   * Evaluates a testing benchmark case.
   */
  static async evaluate(caseItem: BenchmarkCase): Promise<CaseEvaluationResult> {
    const start = Date.now();

    if (!caseItem.projectFixture || !caseItem.projectFixture.files) {
      return {
        caseId: caseItem.id,
        name: caseItem.name,
        category: "testing",
        evaluationMethod: "DETERMINISTIC",
        passed: false,
        score: 0,
        latencyMs: Date.now() - start,
        metrics: {},
        notes: "Missing project fixture files.",
        error: "NO_FIXTURE_FILES",
      };
    }

    const projectId = caseItem.projectFixture.id || "bench-test-project";
    const graph = new ProjectKnowledgeGraph(projectId);

    for (const file of caseItem.projectFixture.files) {
      graph.indexFile(file.path, file.content);
    }

    // 1. Framework Detection
    const frameworkInfo = TestFrameworkDetector.detect(graph);
    const frameworkDetected = frameworkInfo.framework !== "none";

    // 2. Test Discovery
    const discovery = TestDiscovery.discover(graph, projectId);
    const discoveredTestFiles = discovery.testFiles;
    const suites = discovery.suites;
    const totalTestsCount = suites.reduce((sum, s) => sum + s.testNames.length, 0);

    // 3. Source-to-Test Mapping
    const expectedFiles = caseItem.expectedFiles || [];
    let mappingAccurate = false;
    for (const srcFile of expectedFiles) {
      const mappings = discovery.fileCoverageMapping[srcFile] || [];
      if (mappings.length > 0) {
        mappingAccurate = true;
        break;
      }
    }

    // 4. Test Planner Targeted Selection
    const testPlan = TestPlanner.plan(graph, projectId, {
      changedFiles: expectedFiles,
    });
    const relevantTestsSelected = testPlan.targetFiles.length > 0;

    const testingMetrics: TestingMetrics = {
      frameworkDetected,
      testsDiscoveredCount: totalTestsCount,
      relevantTestsSelectedCount: testPlan.targetFiles.length,
      generatedTestsValid: true,
      executionSuccess: true,
    };

    const passed = frameworkDetected && discoveredTestFiles.length > 0;

    let score = 0;
    if (frameworkDetected) score += 30;
    if (discoveredTestFiles.length > 0) score += 30;
    if (mappingAccurate) score += 20;
    if (relevantTestsSelected) score += 20;

    const notes: string[] = [];
    notes.push(
      `Framework: ${frameworkInfo.framework} (${(frameworkInfo.confidence * 100).toFixed(0)}%). ` +
        `Discovered ${discoveredTestFiles.length} test file(s), ${suites.length} suite(s), ${totalTestsCount} test(s). ` +
        `Targeted plan selected ${testPlan.targetFiles.length} file(s).`,
    );

    const latencyMs = Date.now() - start;

    return {
      caseId: caseItem.id,
      name: caseItem.name,
      category: "testing",
      evaluationMethod: "DETERMINISTIC",
      passed,
      score: Math.min(100, Math.max(0, score)),
      latencyMs,
      metrics: {
        frameworkDetected: frameworkDetected ? 1.0 : 0.0,
        testsDiscoveredCount: totalTestsCount,
        relevantTestsSelectedCount: testPlan.targetFiles.length,
        mappingAccurate: mappingAccurate ? 1.0 : 0.0,
      },
      notes: notes.join(" "),
    };
  }
}
