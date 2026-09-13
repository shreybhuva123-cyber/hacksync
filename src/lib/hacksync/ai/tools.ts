import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { TenantGuard, type AISecurityContext } from "../security/tenant-guard";
import { SecretRedactor } from "../security/secret-redactor";
import { DependencyScanner } from "../intelligence/dependency-scanner";
import { EvidenceEngine } from "./evidence-engine";
import { ApprovalGate } from "./approval-gate";
import { AuditTrail } from "../security/audit-trail";
import type { ToolCallResult, AIFinding } from "./types";
import { AuthorizationError } from "@/lib/errors";

// ─── TOOL PERMISSION TIERS ───────────────────────────────────────────────────

export type ToolPermissionTier = "READ" | "WRITE" | "EXECUTE";

export const TOOL_PERMISSIONS: Record<string, ToolPermissionTier> = {
  // READ tools (allowed for authorized project members)
  search_project: "READ",
  read_file: "READ",
  get_file: "READ",
  search_symbols: "READ",
  find_references: "READ",
  analyze_code: "READ",
  analyze_security: "READ",
  analyze_dependencies: "READ",
  get_project_structure: "READ",
  git_status: "READ",
  git_diff: "READ",
  generate_fix_prompt: "READ",

  // WRITE tools (require explicit user approval)
  modify_file: "WRITE",
  apply_patch: "WRITE",
  create_file: "WRITE",
  delete_file: "WRITE",
  generate_fix: "WRITE",

  // EXECUTE tools (require approval + sandbox; safely disabled on host in Phase 0)
  execute_command: "EXECUTE",
  run_tests: "EXECUTE",
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
  constructor(
    private graph: ProjectKnowledgeGraph,
    private context: AISecurityContext,
    private requestId: string,
  ) {}

  async execute(toolName: string, rawArgs: Record<string, any>): Promise<ToolCallResult> {
    const startTime = Date.now();

    try {
      // 1. Centralized Authorization Boundary
      const { tier, sanitizedArgs: args } = authorizeToolExecution({
        securityContext: this.context,
        toolName,
        arguments: rawArgs,
      });

      let data: any = null;
      let requiresApproval = tier === "WRITE" || tier === "EXECUTE";
      let approvalId: string | undefined;

      switch (toolName) {
        case "search_project": {
          const query = String(args["query"] || "");
          const limit = Math.min(20, Math.max(1, Number(args["limit"] || 5)));
          data = this.graph.search(query, limit);
          break;
        }

        case "get_file":
        case "read_file": {
          const safePath = String(args["path"] || args["filePath"] || "");
          const rawContent = this.graph.getFileContent(safePath);

          if (rawContent === undefined) {
            throw new Error(`File '${safePath}' not found in project index.`);
          }

          // Secret Redaction prior to returning data to context
          const { redactedText } = SecretRedactor.redact(rawContent);
          const lines = redactedText.split("\n");

          const startLine = Math.max(1, Number(args["startLine"] || 1));
          const endLine = Math.min(lines.length, Number(args["endLine"] || lines.length));

          data = {
            path: safePath,
            totalLines: lines.length,
            startLine,
            endLine,
            content: lines.slice(startLine - 1, endLine).join("\n"),
          };
          break;
        }

        case "search_symbols": {
          const name = String(args["name"] || "");
          data = this.graph.findSymbol(name);
          break;
        }

        case "find_references": {
          const symbolOrPath = String(args["target"] || "");
          const dependents = this.graph.findDependents(symbolOrPath);
          data = {
            target: symbolOrPath,
            dependents,
            message: `Found ${dependents.length} file(s) that depend on '${symbolOrPath}'`,
          };
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

        case "get_project_structure": {
          data = {
            metrics: this.graph.getMetrics(),
            structure: this.graph.getStructureTree(),
          };
          break;
        }

        case "generate_fix": {
          const findingId = String(args["findingId"] || "");
          const findings = EvidenceEngine.collectFindings(this.graph);
          const targetFinding = findings.find((f) => f.id === findingId) || findings[0];

          if (!targetFinding) {
            throw new Error(`No finding available to generate fix for.`);
          }

          data = {
            findingId: targetFinding.id,
            file: targetFinding.primaryLocation.filePath,
            line: targetFinding.primaryLocation.line,
            rootCause: targetFinding.explanation,
            impact: targetFinding.impact,
            fixStrategy: [
              "1. Validate existence of target entity before accessing nested properties.",
              "2. Return standard HTTP 401 Unauthorized or 404 Not Found without leaking internal error details.",
              "3. Maintain existing database query parameters and authentication contracts.",
            ],
            suggestedPatch: targetFinding.recommendedFix,
          };
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

        case "modify_file":
        case "apply_patch": {
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
