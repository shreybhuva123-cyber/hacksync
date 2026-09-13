import type { Workspace } from "../types";
import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";

export interface HealthScoreBreakdown {
  overallScore: number; // 0..100
  securityScore: number; // 0..100
  codeQualityScore: number; // 0..100
  testingScore: number; // 0..100
  performanceScore: number; // 0..100
  dependenciesScore: number; // 0..100
  letterGrade: "A+" | "A" | "B" | "C" | "D" | "F";
  disclaimer: string;
  calculatedAt: string;
  factors: {
    name: string;
    score: number;
    weight: number;
    explanation: string;
  }[];
}

export class ProjectHealthCalculator {
  static readonly DISCLAIMER =
    "HackSync Health Score is a heuristic based on detected static AST findings, security patterns, and configured test status. It is an engineering health indicator and not a formal guarantee of security.";

  static calculate(graph: ProjectKnowledgeGraph, ws?: Workspace | null): HealthScoreBreakdown {
    const issues = graph.getAllIssues();
    const criticalIssues = issues.filter((i) => i.issue.severity === "critical").length;
    const highIssues = issues.filter((i) => i.issue.severity === "high").length;
    const mediumIssues = issues.filter((i) => i.issue.severity === "medium").length;

    // 1. Security Score (Weight: 30%)
    const secPenalty = criticalIssues * 20 + highIssues * 10 + mediumIssues * 4;
    const securityScore = Math.max(10, Math.min(100, 100 - secPenalty));

    // 2. Code Quality Score (Weight: 20%)
    const qualityPenalty = highIssues * 8 + mediumIssues * 5;
    const codeQualityScore = Math.max(20, Math.min(100, 100 - qualityPenalty));

    // 3. Testing Score (Weight: 20%)
    // Check if test files or contracts have passing tests
    const contracts = ws?.contracts || [];
    const passingContracts = contracts.filter((c) => c.test_status === "passing").length;
    const testPct = contracts.length > 0 ? (passingContracts / contracts.length) * 100 : 70;
    const testingScore = Math.round(Math.max(25, Math.min(100, testPct)));

    // 4. Performance Score (Weight: 15%)
    const unhandledPromises = issues.filter((i) => i.issue.type === "unhandled_promise").length;
    const perfScore = Math.max(30, 100 - unhandledPromises * 12);

    // 5. Dependencies Score (Weight: 15%)
    const unpinnedDeps = issues.filter((i) => i.issue.title.includes("Unpinned")).length;
    const depScore = Math.max(40, 100 - unpinnedDeps * 15);

    // Weighted Overall Formula
    const overallScore = Math.round(
      securityScore * 0.3 +
      codeQualityScore * 0.2 +
      testingScore * 0.2 +
      perfScore * 0.15 +
      depScore * 0.15,
    );

    let letterGrade: HealthScoreBreakdown["letterGrade"] = "F";
    if (overallScore >= 95) letterGrade = "A+";
    else if (overallScore >= 85) letterGrade = "A";
    else if (overallScore >= 75) letterGrade = "B";
    else if (overallScore >= 65) letterGrade = "C";
    else if (overallScore >= 50) letterGrade = "D";

    return {
      overallScore,
      securityScore,
      codeQualityScore,
      testingScore,
      performanceScore: perfScore,
      dependenciesScore: depScore,
      letterGrade,
      disclaimer: this.DISCLAIMER,
      calculatedAt: new Date().toISOString(),
      factors: [
        {
          name: "Cyber Security",
          score: securityScore,
          weight: 30,
          explanation: `${criticalIssues} critical / ${highIssues} high severity AST and credential flags detected`,
        },
        {
          name: "Code Quality & Correctness",
          score: codeQualityScore,
          weight: 20,
          explanation: `Evaluated null-check existence, type contracts, and infinite loop guards`,
        },
        {
          name: "Test Coverage & Contracts",
          score: testingScore,
          weight: 20,
          explanation: `${passingContracts}/${contracts.length || 1} API contracts marked as passing`,
        },
        {
          name: "Runtime & Async Performance",
          score: perfScore,
          weight: 15,
          explanation: `${unhandledPromises} unhandled async operations / floating promises identified`,
        },
        {
          name: "Dependencies & Supply Chain",
          score: depScore,
          weight: 15,
          explanation: `Manifest packages checked against pinned version best practices`,
        },
      ],
    };
  }
}
