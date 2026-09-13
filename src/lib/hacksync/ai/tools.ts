import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { TenantGuard, type AISecurityContext } from "../security/tenant-guard";
import { SecretRedactor } from "../security/secret-redactor";
import { DependencyScanner } from "../intelligence/dependency-scanner";
import { EvidenceEngine } from "./evidence-engine";
import { ApprovalGate } from "./approval-gate";
import { AuditTrail } from "../security/audit-trail";
import type { ToolCallResult, AIFinding } from "./types";
import { AuthorizationError } from "@/lib/errors";
import { ExecutionBudgetManager } from "./execution-budget";
import type { Workspace } from "../types";

// Import dedicated Phase 2 tools
import { SearchSymbolsTool } from "./tools/search-symbols";
import { FindReferencesTool } from "./tools/find-references";
import { GetProjectStructureTool } from "./tools/get-project-structure";
import { RetrieveCodeTool } from "./tools/retrieve-code";
import { FindApiRoutesTool } from "./tools/find-api-routes";
import { FindDatabaseUsageTool } from "./tools/find-database-usage";
import { ArchitectureSummaryTool } from "./tools/architecture-summary";
import { DependencyImpactTool } from "./tools/dependency-impact";
import { SecurityScanTool } from "./tools/security-scan";
import { SecretScanTool } from "./tools/secret-scan";
import { DependencyVulnerabilitiesTool } from "./tools/dependency-vulnerabilities";
import { SecurityHealthTool } from "./tools/security-health";
import { GitStatusTool } from "./tools/git-status";
import { GitDiffTool } from "./tools/git-diff";
import { GitChangedSymbolsTool } from "./tools/git-changed-symbols";
import { GitImpactTool } from "./tools/git-impact";
import { FindTestsTool } from "./tools/find-tests";
import { TestPlanTool } from "./tools/test-plan";
import { GenerateTestsTool } from "./tools/generate-tests";
import { RunTestsTool } from "./tools/run-tests";
import { GenerateFixTool } from "./tools/generate-fix";
import { ValidatePatchTool } from "./tools/validate-patch";
import { ApplyPatchTool } from "./tools/apply-patch";
import { VerifyFixTool } from "./tools/verify-fix";
import { EvaluationEngine } from "../evaluation/evaluation-engine";
import { BenchmarkLoader } from "../evaluation/benchmark-loader";
import { ModelComparisonEngine } from "../evaluation/model-comparison";

// ─── TOOL PERMISSION TIERS ───────────────────────────────────────────────────

export type ToolPermissionTier = "READ" | "WRITE" | "EXECUTE";

export const TOOL_PERMISSIONS: Record<string, ToolPermissionTier> = {
  // Core Phase 2 READ tools
  search_symbols: "READ",
  find_references: "READ",
  get_project_structure: "READ",
  retrieve_code: "READ",
  find_api_routes: "READ",
  find_database_usage: "READ",
  architecture_summary: "READ",
  dependency_impact: "READ",

  // Core Phase 3 READ tools
  security_scan: "READ",
  secret_scan: "READ",
  dependency_vulnerabilities: "READ",
  security_health: "READ",
  git_status: "READ",
  git_diff: "READ",
  git_changed_symbols: "READ",
  git_impact: "READ",

  // Core Phase 4 Testing & Fix Tools
  find_tests: "READ",
  test_plan: "READ",
  generate_tests: "READ",
  run_tests: "EXECUTE",
  generate_fix: "READ",
  validate_patch: "READ",
  apply_patch: "WRITE",
  verify_fix: "READ",

  // Phase 6 Evaluation Tools (Safe READ_ONLY)
  run_benchmark: "READ",
  get_evaluation_history: "READ",
  compare_models: "READ",
  get_regressions: "READ",
  get_evaluation_metrics: "READ",

  // Backward-compatible READ tools
  search_project: "READ",
  read_file: "READ",
  get_file: "READ",
  analyze_code: "READ",
  analyze_security: "READ",
  analyze_dependencies: "READ",
  generate_fix_prompt: "READ",

  // WRITE tools (require explicit user approval)
  modify_file: "WRITE",
  create_file: "WRITE",
  delete_file: "WRITE",

  // EXECUTE tools (require approval + sandbox)
  execute_command: "EXECUTE",
  run_migration: "EXECUTE",
};

/**
 * Centralized tool authorization and argument validation boundary.
 * Never trusts LLM-supplied arguments; validates path confinement and project boundaries.
 */
export function authorizeToolExecution(params: {
  securityContext: AISecurityContext;
  toolName: string;
  arguments: Record<string, any>;
}): { authorized: boolean; tier: ToolPermissionTier; sanitizedArgs: Record<string, any> } {
  const { securityContext, toolName, arguments: args } = params;

  // 1. Verify project tenant access
  TenantGuard.validateProjectAccess(securityContext, securityContext.projectId, toolName);

  // 2. Reject LLM attempts to specify a foreign projectId
  if (args["projectId"] && String(args["projectId"]).trim() !== securityContext.projectId) {
    throw new AuthorizationError(
      `[Security] Cross-project parameter escape prevented. Target '${args["projectId"]}' does not match bound project '${securityContext.projectId}'.`,
    );
  }

  // 3. Determine permission tier
  const tier = TOOL_PERMISSIONS[toolName] || "WRITE";

  // 4. Sanitize and validate file paths
  const sanitizedArgs = { ...args };
  const pathKey = ["path", "filePath", "targetFile", "file"].find((k) => typeof sanitizedArgs[k] === "string");
  if (pathKey && sanitizedArgs[pathKey]) {
    sanitizedArgs[pathKey] = TenantGuard.sanitizeFilePath(String(sanitizedArgs[pathKey]));
  }

  // 5. EXECUTE tier policy: host execution is strictly disabled in Phase 0
  if (tier === "EXECUTE") {
    if (toolName === "execute_command") {
      throw new AuthorizationError(
        `[Security] Host command execution ('${toolName}') is strictly disabled in Phase 0. Isolated container sandboxing will be available in Phase 1.`,
      );
    }
  }

  return { authorized: true, tier, sanitizedArgs };
}

export class AIToolExecutor {
  private budget: ExecutionBudgetManager;

  constructor(
    private graph: ProjectKnowledgeGraph,
    private context: AISecurityContext,
    private requestId: string,
    private ws?: Workspace | null | undefined,
    budget?: ExecutionBudgetManager,
  ) {
    this.budget = budget || new ExecutionBudgetManager();
  }

  getBudgetManager(): ExecutionBudgetManager {
    return this.budget;
  }

  async execute(toolName: string, rawArgs: Record<string, any> = {}): Promise<ToolCallResult> {
    const startTime = Date.now();

    // 1. Enforce Execution Budget & Deduplication Guard
    const budgetCheck = this.budget.checkCanExecute(toolName, rawArgs);
    if (!budgetCheck.allowed) {
      return {
        toolName,
        success: false,
        data: null,
        error: budgetCheck.reason,
        executionMs: Date.now() - startTime,
      };
    }

    try {
      // 2. Centralized Authorization Boundary
      const { tier, sanitizedArgs: args } = authorizeToolExecution({
        securityContext: this.context,
        toolName,
        arguments: rawArgs,
      });

      // Record call in budget manager
      this.budget.recordCall(toolName, args);

      let data: any = null;
      let requiresApproval = tier === "WRITE" || tier === "EXECUTE";
      let approvalId: string | undefined;

      switch (toolName) {
        // ── Phase 2 Tools ────────────────────────────────────────────────────
        case "search_symbols": {
          data = SearchSymbolsTool.execute(this.graph, { name: String(args["name"] || "") });
          break;
        }

        case "find_references": {
          data = FindReferencesTool.execute(this.graph, { target: String(args["target"] || "") });
          break;
        }

        case "get_project_structure": {
          data = GetProjectStructureTool.execute(this.graph);
          break;
        }

        case "retrieve_code":
        case "get_file":
        case "read_file": {
          data = RetrieveCodeTool.execute(this.graph, {
            path: String(args["path"] || args["filePath"] || ""),
            startLine: args["startLine"] ? Number(args["startLine"]) : undefined,
            endLine: args["endLine"] ? Number(args["endLine"]) : undefined,
          });
          break;
        }

        case "find_api_routes": {
          data = FindApiRoutesTool.execute(
            this.graph,
            {
              method: args["method"] ? String(args["method"]) : undefined,
              routePrefix: args["routePrefix"] ? String(args["routePrefix"]) : undefined,
            },
            this.ws,
          );
          break;
        }

        case "find_database_usage": {
          data = FindDatabaseUsageTool.execute(
            this.graph,
            { tableName: args["tableName"] ? String(args["tableName"]) : undefined },
            this.ws,
          );
          break;
        }

        case "architecture_summary": {
          data = ArchitectureSummaryTool.execute(this.graph);
          break;
        }

        case "dependency_impact": {
          data = DependencyImpactTool.execute(this.graph, { target: String(args["target"] || "") });
          break;
        }

        // ── Phase 3 Security & Git Tools ─────────────────────────────────────
        case "security_scan": {
          data = SecurityScanTool.execute(
            this.graph,
            { targetFile: args["targetFile"] ? String(args["targetFile"]) : undefined },
            this.context.projectId,
            this.ws,
          );
          break;
        }

        case "secret_scan": {
          data = SecretScanTool.execute(
            this.graph,
            { targetFile: args["targetFile"] ? String(args["targetFile"]) : undefined },
            this.context.projectId,
          );
          break;
        }

        case "dependency_vulnerabilities": {
          data = DependencyVulnerabilitiesTool.execute(
            this.graph,
            { manifestFile: args["manifestFile"] ? String(args["manifestFile"]) : undefined },
            this.context.projectId,
          );
          break;
        }

        case "security_health": {
          data = SecurityHealthTool.execute(this.graph, this.context.projectId, this.ws);
          break;
        }

        case "git_status": {
          data = await GitStatusTool.execute(
            { repoPath: args["repoPath"] ? String(args["repoPath"]) : undefined },
            this.ws,
            (this.ws as any)?.memberFiles || [],
          );
          break;
        }

        case "git_diff": {
          data = await GitDiffTool.execute(
            {
              repoPath: args["repoPath"] ? String(args["repoPath"]) : undefined,
              staged: args["staged"] ? Boolean(args["staged"]) : undefined,
              commitRange: args["commitRange"] ? String(args["commitRange"]) : undefined,
              fileFilter: args["fileFilter"] ? String(args["fileFilter"]) : undefined,
            },
            this.ws,
            (this.ws as any)?.memberFiles || [],
          );
          break;
        }

        case "git_changed_symbols": {
          data = await GitChangedSymbolsTool.execute(
            this.graph,
            {
              repoPath: args["repoPath"] ? String(args["repoPath"]) : undefined,
              staged: args["staged"] ? Boolean(args["staged"]) : undefined,
            },
            this.ws,
            (this.ws as any)?.memberFiles || [],
          );
          break;
        }

        case "git_impact": {
          data = await GitImpactTool.execute(
            this.graph,
            {
              repoPath: args["repoPath"] ? String(args["repoPath"]) : undefined,
              staged: args["staged"] ? Boolean(args["staged"]) : undefined,
            },
            this.ws,
            (this.ws as any)?.memberFiles || [],
          );
          break;
        }

        // ── Phase 4 Testing Intelligence & Fix Tools ─────────────────────────
        case "find_tests": {
          data = FindTestsTool.execute(
            this.graph,
            { targetFile: args["targetFile"] ? String(args["targetFile"]) : undefined },
            this.context.projectId,
          );
          break;
        }

        case "test_plan": {
          data = TestPlanTool.execute(
            this.graph,
            {
              targetFile: args["targetFile"] ? String(args["targetFile"]) : (Array.isArray(args["targetFiles"]) ? args["targetFiles"][0] : undefined),
              changedFiles: args["changedFiles"] || args["targetFiles"],
              changedSymbols: args["changedSymbols"],
              securityFinding: args["securityFinding"],
              query: args["query"] ? String(args["query"]) : undefined,
            },
            this.context.projectId,
          );
          break;
        }

        case "generate_tests": {
          data = GenerateTestsTool.execute(
            this.graph,
            {
              targetFile: args["targetFile"] ? String(args["targetFile"]) : undefined,
              targetSymbol: args["targetSymbol"] ? String(args["targetSymbol"]) : undefined,
              framework: args["framework"] ? String(args["framework"]) : undefined,
              existingTestPath: args["existingTestPath"] ? String(args["existingTestPath"]) : undefined,
              securityFinding: args["securityFinding"],
            },
            this.context.projectId,
          );
          break;
        }

        case "run_tests": {
          data = await RunTestsTool.execute(
            this.graph,
            {
              command: args["command"] ? String(args["command"]) : undefined,
              targetFile: args["targetFile"] ? String(args["targetFile"]) : undefined,
              workspacePath: args["workspacePath"] ? String(args["workspacePath"]) : undefined,
              options: args["options"],
            },
            this.context.projectId,
          );
          break;
        }

        case "generate_fix": {
          const targetFile = args["filePath"] || args["targetFile"] ? String(args["filePath"] || args["targetFile"]) : undefined;
          data = GenerateFixTool.execute(
            this.graph,
            {
              finding: args["finding"],
              filePath: targetFile,
              issueDescription: args["issueDescription"] ? String(args["issueDescription"]) : undefined,
            },
            this.context.projectId,
          );
          break;
        }

        case "validate_patch": {
          if (!args["patch"]) {
            throw new Error("[validate_patch] 'patch' parameter is required.");
          }
          data = ValidatePatchTool.execute(
            this.graph,
            {
              patch: args["patch"],
              approvedFiles: args["approvedFiles"],
              expectedDiffHash: args["expectedDiffHash"],
            },
            this.context.projectId,
          );
          break;
        }

        case "apply_patch": {
          requiresApproval = true;
          if (args["approvalId"] && args["patch"]) {
            data = await ApplyPatchTool.execute(
              this.graph,
              {
                approvalId: String(args["approvalId"]),
                patch: args["patch"],
                userId: this.context.userId,
              },
              this.context.projectId,
              this.context.userId,
            );
          } else {
            const patchSummary = String(args["summary"] || "Apply code patch");
            const targetFiles = args["patch"]?.files?.map((f: any) => f.path) || [String(args["targetFile"] || args["path"] || "unknown")];
            const patchDiff = args["patch"]?.files?.map((f: any) => f.diff).join("\n") || String(args["patch"] || args["diff"] || "");

            const approvalReq = await ApprovalGate.createApprovalRequest({
              requestId: this.requestId,
              projectId: this.context.projectId,
              userId: this.context.userId,
              toolName: "apply_patch",
              summary: patchSummary,
              rationale: "Fix identified code defect via verified patch.",
              filesAffected: targetFiles,
              diffPreview: patchDiff,
            });

            approvalId = approvalReq.id;
            data = {
              status: "PENDING_APPROVAL",
              approvalId,
              message: "This mutating operation requires explicit user approval before execution.",
              approvalRequest: approvalReq,
            };
          }
          break;
        }

        case "verify_fix": {
          if (!args["patch"] || !args["approvalId"]) {
            throw new Error("[verify_fix] Both 'patch' and 'approvalId' are required.");
          }
          data = await VerifyFixTool.execute(
            this.graph,
            {
              patch: args["patch"],
              approvalId: String(args["approvalId"]),
              originalFinding: args["originalFinding"],
              testCommand: args["testCommand"] ? String(args["testCommand"]) : undefined,
              workspacePath: args["workspacePath"] ? String(args["workspacePath"]) : undefined,
              iterationState: args["iterationState"],
            },
            this.context.projectId,
            this.context.userId,
          );
          break;
        }

        // ── Existing / Compatibility Tools ───────────────────────────────────
        case "search_project": {
          const query = String(args["query"] || "");
          const limit = Math.min(20, Math.max(1, Number(args["limit"] || 5)));
          data = this.graph.search(query, limit);
          break;
        }

        case "analyze_code": {
          const path = args["path"] ? String(args["path"]) : undefined;
          const findings = EvidenceEngine.collectFindings(this.graph, path);
          data = {
            totalFindings: findings.length,
            findings,
          };
          break;
        }

        case "analyze_security": {
          const findings = EvidenceEngine.collectFindings(this.graph);
          const securityFindings = findings.filter(
            (f) =>
              f.title.toLowerCase().includes("sql") ||
              f.title.toLowerCase().includes("auth") ||
              f.title.toLowerCase().includes("password") ||
              f.severity === "CRITICAL" ||
              f.severity === "HIGH",
          );

          data = {
            auditMode: "PASSIVE_STATIC_SECURITY_AUDIT",
            totalFindings: securityFindings.length,
            findings: securityFindings,
          };
          break;
        }

        case "analyze_dependencies": {
          const packageJson = this.graph.getFileContent("package.json") || "";
          data = DependencyScanner.scan(packageJson);
          break;
        }

        case "generate_fix_prompt": {
          const findingId = String(args["findingId"] || "");
          const findings = EvidenceEngine.collectFindings(this.graph);
          const targetFinding = findings.find((f) => f.id === findingId) || findings[0];

          if (!targetFinding) {
            throw new Error(`No finding available to generate prompt for.`);
          }

          const prompt = `ROLE:
You are a senior full-stack TypeScript engineer.

PROJECT:
HackSync Project (${this.context.projectId})

BUG:
${targetFinding.title}

FILE:
${targetFinding.primaryLocation.filePath}

LINE:
${targetFinding.primaryLocation.line}

ROOT CAUSE:
${targetFinding.explanation}

REQUIREMENTS:
1. Handle null/undefined checks defensively before accessing properties.
2. Return safe HTTP status codes without leaking stack traces.
3. Preserve existing API response contracts and database behaviors.

CONSTRAINTS:
- Do not modify unrelated files.
- Do not remove authentication middleware.
- Do not hardcode credentials.

OUTPUT:
Return:
1. Explanation of fix
2. Unified Git patch
3. Unit test case`;

          data = { prompt };
          break;
        }

        case "modify_file": {
          requiresApproval = true;
          const patchSummary = String(args["summary"] || "Apply code patch");
          const targetFile = String(args["targetFile"] || args["path"] || "unknown");
          const patchDiff = String(args["patch"] || args["diff"] || "");

          const approvalReq = await ApprovalGate.createApprovalRequest({
            requestId: this.requestId,
            projectId: this.context.projectId,
            userId: this.context.userId,
            toolName,
            summary: patchSummary,
            rationale: "Fix identified code defect via verified patch.",
            filesAffected: [targetFile],
            diffPreview: patchDiff,
          });

          approvalId = approvalReq.id;
          data = {
            status: "PENDING_APPROVAL",
            approvalId,
            message: "This mutating operation requires explicit user approval before execution.",
            approvalRequest: approvalReq,
          };
          break;
        }

        case "run_benchmark": {
          const categories = args["categories"] as any;
          const model = args["model"] ? String(args["model"]) : undefined;
          const provider = args["provider"] ? String(args["provider"]) : undefined;
          data = await EvaluationEngine.runBenchmark({
            projectId: this.context.projectId,
            userId: this.context.userId,
            provider,
            model,
            filter: categories ? { categories } : undefined,
          });
          break;
        }

        case "get_evaluation_history": {
          data = await EvaluationEngine.getRuns(this.context.projectId);
          break;
        }

        case "compare_models": {
          const modelA = args["modelA"] as any;
          const modelB = args["modelB"] as any;
          if (!modelA || !modelB) {
            throw new Error("Both modelA and modelB are required for model comparison.");
          }
          data = ModelComparisonEngine.compareModels(modelA, modelB);
          break;
        }

        case "get_regressions": {
          const runId = String(args["runId"] || "");
          const run = await EvaluationEngine.getRunById(runId);
          data = run ? run.regressions : [];
          break;
        }

        case "get_evaluation_metrics": {
          const allCases = BenchmarkLoader.getAllCases();
          data = {
            caseCount: allCases.length,
            categories: Array.from(new Set(allCases.map((c) => c.category))),
          };
          break;
        }

        default:
          throw new Error(`Unknown AI tool: '${toolName}'`);
      }

      // Record Audit Event
      AuditTrail.record({
        requestId: this.requestId,
        userId: this.context.userId,
        projectId: this.context.projectId,
        toolName,
        actionType: tier === "READ" ? "READ_ONLY" : "MUTATING",
        status: "success",
        targetFiles: args["path"] ? [String(args["path"])] : undefined,
        executionMs: Date.now() - startTime,
      });

      return {
        toolName,
        success: true,
        data,
        executionMs: Date.now() - startTime,
        requiresApproval,
        approvalId,
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);

      // Record Denied / Failed Audit Event
      AuditTrail.record({
        requestId: this.requestId,
        userId: this.context.userId,
        projectId: this.context.projectId,
        toolName,
        actionType: "READ_ONLY",
        status: err instanceof AuthorizationError ? "denied" : "failed",
        details: SecretRedactor.redact(errorMessage).redactedText,
        executionMs: Date.now() - startTime,
      });

      return {
        toolName,
        success: false,
        data: null,
        error: SecretRedactor.redact(errorMessage).redactedText,
        executionMs: Date.now() - startTime,
      };
    }
  }
}
