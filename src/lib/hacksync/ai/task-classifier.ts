/**
 * Task Classifier & Planner for HackSync Unified AI Orchestrator
 * Maps user requests to structured, bounded TaskPlans.
 */

import type { TaskType, TaskPlan } from "./tool-types";
import type { AIIntentType } from "./types";

export class TaskClassifier {
  /**
   * Classifies a user query into one of the 11 typed engineering task categories.
   */
  static classify(query: string, activeFilePath?: string): { taskType: TaskType; confidence: number } {
    const q = query.toLowerCase().trim();

    // 1. Dependency Analysis
    if (
      q.includes("dependency") ||
      q.includes("dependencies") ||
      q.includes("package.json") ||
      q.includes("outdated package") ||
      q.includes("npm audit") ||
      q.includes("ghsa") ||
      q.includes("vulnerable package")
    ) {
      return { taskType: "dependency", confidence: 0.92 };
    }

    // 2. Verification Tasks
    if (
      q.includes("verify fix") ||
      q.includes("verify patch") ||
      q.includes("run verification") ||
      q.includes("verify the fix") ||
      q.startsWith("verify") ||
      q.includes("verification")
    ) {
      return { taskType: "verify", confidence: 0.96 };
    }

    // 3. Fix & Remediation Tasks
    if (
      !q.includes("prompt to") &&
      !q.includes("generate a prompt") &&
      (q.includes("fix ") ||
        q.includes("fix the ") ||
        q.includes("generate fix") ||
        q.includes("propose fix") ||
        q.includes("patch for") ||
        q.startsWith("fix"))
    ) {
      return { taskType: "fix", confidence: 0.95 };
    }

    // 4. Testing Intelligence Tasks
    if (
      q.includes("unit test") ||
      q.includes("regression test") ||
      q.includes("generate test") ||
      q.includes("run test") ||
      q.includes("run tests") ||
      q.includes("write test") ||
      q.includes("test suite") ||
      q.includes("spec") ||
      q.includes("find test") ||
      q.includes("find tests") ||
      q.includes("plan test") ||
      q.includes("test plan") ||
      q.includes("testing") ||
      q.includes("tests") ||
      q.includes("test")
    ) {
      return { taskType: "test", confidence: 0.94 };
    }

    // 5. Security & Vulnerability Analysis
    if (
      q.includes("security") ||
      q.includes("vulnerab") ||
      q.includes("injection") ||
      q.includes("auth bypass") ||
      q.includes("jwt") ||
      q.includes("secret") ||
      q.includes("leaked") ||
      q.includes("leak") ||
      q.includes("cve") ||
      q.includes("cwe") ||
      q.includes("sql safe") ||
      q.includes("safe from") ||
      q.includes("owasp") ||
      q.includes("xss") ||
      q.includes("csrf") ||
      q.includes("how secure")
    ) {
      return { taskType: "security", confidence: 0.95 };
    }

    // 4. Git & Diff Review
    if (
      q.includes("git diff") ||
      q.includes("git status") ||
      q.includes("review changes") ||
      q.includes("recent changes") ||
      q.includes("latest changes") ||
      q.includes("commit") ||
      q.includes("staged files") ||
      q.includes("what changed") ||
      q.includes("what files changed") ||
      q.includes("functions were modified") ||
      q.includes("uncommitted changes") ||
      q.includes("working tree")
    ) {
      return { taskType: "git", confidence: 0.93 };
    }

    // 5. Change Impact Analysis & Blast Radius
    if (
      q.includes("blast radius") ||
      q.includes("what breaks") ||
      q.includes("who uses") ||
      q.includes("impact of changing") ||
      q.includes("breaking change") ||
      q.includes("dependency impact") ||
      q.includes("downstream impact")
    ) {
      return { taskType: "impact", confidence: 0.91 };
    }

    // 6. Code Search & Symbol Lookup
    if (
      q.includes("find symbol") ||
      q.includes("symbol") ||
      q.startsWith("where is") ||
      q.startsWith("locate function") ||
      q.startsWith("locate symbol") ||
      q.startsWith("search for") ||
      q.includes("where are the") ||
      q.includes("find all occurrences") ||
      q.includes("search code") ||
      q.includes("code search")
    ) {
      return { taskType: "code_search", confidence: 0.88 };
    }

    // 7. Debugging & Error Diagnosis
    if (
      q.includes("why") ||
      q.includes("error") ||
      q.includes("fail") ||
      q.includes("500") ||
      q.includes("crash") ||
      q.includes("bug") ||
      q.includes("exception") ||
      q.includes("typeerror") ||
      q.includes("undefined is not") ||
      q.includes("fix this bug") ||
      q.includes("prompt to fix") ||
      q.includes("null access") ||
      q.includes("stack trace")
    ) {
      return { taskType: "debug", confidence: 0.95 };
    }

    // 8. Project Overview
    if (
      q.includes("project overview") ||
      q.includes("file tree") ||
      q.includes("codebase summary") ||
      q.includes("what does this project do") ||
      q.includes("project structure") ||
      q.includes("repository overview")
    ) {
      return { taskType: "project_overview", confidence: 0.9 };
    }

    // 9. Architecture & Responsibility
    if (
      q.includes("architecture") ||
      q.includes("layer") ||
      q.includes("responsible for") ||
      q.includes("attendance") ||
      q.includes("structure") ||
      q.includes("system design") ||
      q.includes("api contracts") ||
      q.includes("database schema")
    ) {
      return { taskType: "architecture", confidence: 0.92 };
    }

    // 10. Code Explanation
    if (
      q.includes("explain") ||
      q.includes("how does") ||
      q.includes("walk through") ||
      q.includes("what is the purpose of") ||
      q.includes("optimize re-renders") ||
      q.includes("react component")
    ) {
      return { taskType: "explain", confidence: 0.89 };
    }

    return { taskType: "general", confidence: 0.7 };
  }

  /**
   * Builds an actionable TaskPlan with bounded tool permissions.
   */
  static plan(query: string, activeFilePath?: string, overrideType?: TaskType): TaskPlan {
    const { taskType, confidence } = overrideType
      ? { taskType: overrideType, confidence: 1.0 }
      : this.classify(query, activeFilePath);

    switch (taskType) {
      case "security":
        return {
          taskType,
          goal: "Identify security vulnerabilities, injection hazards, credential leaks, and insecure dependencies.",
          requiredEvidence: ["ast_security_issues", "dependency_advisories", "credential_scans"],
          allowedTools: [
            "security_scan",
            "secret_scan",
            "dependency_vulnerabilities",
            "security_health",
            "analyze_security",
            "analyze_dependencies",
            "retrieve_code",
            "search_symbols",
          ],
          maxToolCalls: 6,
          requiresModel: true,
          confidence,
        };

      case "dependency":
        return {
          taskType,
          goal: "Inspect package dependencies for security advisories, pinned versions, and version conflicts.",
          requiredEvidence: ["manifest_dependencies", "ghsa_advisories"],
          allowedTools: ["analyze_dependencies", "get_project_structure"],
          maxToolCalls: 3,
          requiresModel: false,
          confidence,
        };

      case "debug":
        return {
          taskType,
          goal: "Diagnose code failures, trace root causes, locate faulty AST nodes, and outline fix strategies.",
          requiredEvidence: ["matching_files", "ast_code_issues", "symbol_definitions", "code_snippets"],
          allowedTools: ["search_project", "search_symbols", "analyze_code", "retrieve_code", "generate_fix"],
          maxToolCalls: 5,
          requiresModel: true,
          confidence,
        };

      case "explain":
        return {
          taskType,
          goal: "Explain code semantics, component logic, lifecycle, and design trade-offs with grounded evidence.",
          requiredEvidence: ["symbol_definitions", "code_snippets", "references"],
          allowedTools: ["search_symbols", "retrieve_code", "find_references", "get_project_structure"],
          maxToolCalls: 4,
          requiresModel: true,
          confidence,
        };

      case "architecture":
        return {
          taskType,
          goal: "Map architectural layers, determine component responsibilities, and analyze service boundaries.",
          requiredEvidence: ["architecture_profile", "structure_tree", "responsible_files", "references"],
          allowedTools: [
            "architecture_summary",
            "get_project_structure",
            "find_references",
            "find_api_routes",
            "find_database_usage",
          ],
          maxToolCalls: 5,
          requiresModel: true,
          confidence,
        };

      case "impact":
        return {
          taskType,
          goal: "Assess reverse dependencies and compute blast radius for code modifications.",
          requiredEvidence: ["direct_dependents", "transitive_dependents", "affected_routes"],
          allowedTools: [
            "git_impact",
            "dependency_impact",
            "git_changed_symbols",
            "find_references",
            "search_symbols",
          ],
          maxToolCalls: 5,
          requiresModel: false,
          confidence,
        };

      case "code_search":
        return {
          taskType,
          goal: "Locate exact symbol definitions, exports, interfaces, and file occurrences.",
          requiredEvidence: ["matching_symbols", "file_paths", "snippets"],
          allowedTools: ["search_symbols", "search_project", "retrieve_code"],
          maxToolCalls: 4,
          requiresModel: false,
          confidence,
        };

      case "project_overview":
        return {
          taskType,
          goal: "Provide complete project structural breakdown, file metrics, languages, and architecture layers.",
          requiredEvidence: ["structure_tree", "metrics", "architecture_profile"],
          allowedTools: ["get_project_structure", "architecture_summary"],
          maxToolCalls: 3,
          requiresModel: true,
          confidence,
        };

      case "test":
        return {
          taskType,
          goal: "Formulate unit and regression testing strategies and test cases based on implementation code.",
          requiredEvidence: ["target_symbols", "code_snippets", "api_contracts"],
          allowedTools: [
            "find_tests",
            "test_plan",
            "generate_tests",
            "run_tests",
            "search_symbols",
            "retrieve_code",
            "find_references",
            "search_project",
          ],
          maxToolCalls: 6,
          requiresModel: true,
          confidence,
        };

      case "fix":
        return {
          taskType,
          goal: "Diagnose root causes, formulate FixProposals with unified diff patches, and prepare approval requests.",
          requiredEvidence: ["ast_code_issues", "vulnerability_finding", "code_snippets"],
          allowedTools: [
            "generate_fix",
            "validate_patch",
            "apply_patch",
            "retrieve_code",
            "search_symbols",
            "security_scan",
          ],
          maxToolCalls: 6,
          requiresModel: true,
          confidence,
        };

      case "verify":
        return {
          taskType,
          goal: "Execute multi-dimensional post-fix verification: incremental re-indexing, targeted testing, and security rescan.",
          requiredEvidence: ["verification_results", "test_runs", "security_rescan"],
          allowedTools: [
            "verify_fix",
            "run_tests",
            "security_scan",
            "test_plan",
            "retrieve_code",
          ],
          maxToolCalls: 6,
          requiresModel: true,
          confidence,
        };

      case "git":
        return {
          taskType,
          goal: "Review git changes, staged diffs, additions, and modifications.",
          requiredEvidence: ["changed_files", "diff_snippets"],
          allowedTools: ["git_status", "git_diff", "git_changed_symbols", "git_impact", "retrieve_code"],
          maxToolCalls: 5,
          requiresModel: true,
          confidence,
        };

      case "general":
      default:
        return {
          taskType: "general",
          goal: "Answer general engineering and codebase questions using project evidence.",
          requiredEvidence: ["relevant_symbols", "structure_summary"],
          allowedTools: ["search_symbols", "get_project_structure", "retrieve_code", "search_project"],
          maxToolCalls: 4,
          requiresModel: true,
          confidence,
        };
    }
  }

  /**
   * Backward-compatible mapping from TaskType to Phase 0/0.1 AIIntentType
   */
  static toLegacyIntent(taskType: TaskType, query?: string): AIIntentType {
    if (taskType === "verify" || taskType === "test") {
      return "testing";
    }

    if (query) {
      const q = query.toLowerCase();
      if (!q.includes("verify") && (q.includes("fix") || q.includes("patch") || q.includes("prompt to fix"))) {
        return "fix";
      }
    }

    switch (taskType) {
      case "security":
      case "dependency":
        return "security";
      case "debug":
        return "debug";
      case "fix":
        return "fix";
      case "git":
        return "git";
      case "architecture":
      case "explain":
      case "project_overview":
      case "impact":
      case "code_search":
        return "architecture";
      case "general":
      default:
        return "general";
    }
  }

  /**
   * Backward-compatible mapping from AIIntentType to TaskType
   */
  static fromLegacyIntent(intent: AIIntentType): TaskType {
    switch (intent) {
      case "security":
        return "security";
      case "debug":
        return "debug";
      case "testing":
        return "test";
      case "fix":
        return "fix";
      case "git":
        return "git";
      case "architecture":
        return "architecture";
      case "general":
      default:
        return "general";
    }
  }
}
