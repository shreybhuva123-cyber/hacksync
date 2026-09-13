import type { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { TenantGuard, type TenantContext } from "../security/tenant-guard";
import { SecretRedactor } from "../security/secret-redactor";
import { DependencyScanner } from "../intelligence/dependency-scanner";
import { EvidenceEngine } from "./evidence-engine";
import { ApprovalGate } from "./approval-gate";
import type { ToolCallResult, AIFinding } from "./types";

export class AIToolExecutor {
  constructor(
    private graph: ProjectKnowledgeGraph,
    private context: TenantContext,
    private requestId: string,
  ) {}

  async execute(toolName: string, args: Record<string, any>): Promise<ToolCallResult> {
    const startTime = Date.now();

    // Check Multi-tenant authorization
    TenantGuard.validateProjectAccess(this.context, this.context.projectId, toolName);

    try {
      let data: any = null;
      let requiresApproval = false;
      let approvalId: string | undefined;

      switch (toolName) {
        case "search_project": {
          const query = String(args["query"] || "");
          const limit = Number(args["limit"] || 5);
          data = this.graph.search(query, limit);
          break;
        }

        case "read_file": {
          const rawPath = String(args["path"] || "");
          const safePath = TenantGuard.sanitizeFilePath(rawPath);
          const rawContent = this.graph.getFileContent(safePath);

          if (rawContent === undefined) {
            throw new Error(`File '${safePath}' not found in project index.`);
          }

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
            message: `Found ${dependents.length} file(s) that import or depend on '${symbolOrPath}'`,
          };
          break;
        }

        case "analyze_code": {
          const path = args["path"] ? TenantGuard.sanitizeFilePath(String(args["path"])) : undefined;
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
              f.severity === "CRITICAL",
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

ACCEPTANCE TESTS:
- Valid request succeeds with expected payload.
- Null or invalid entity returns 401/404 safely without throwing 500.
- Existing regression tests continue passing.

OUTPUT:
Return:
1. Explanation of fix
2. Unified Git patch
3. Unit test case
4. Remaining risks`;

          data = { prompt };
          break;
        }

        case "apply_patch": {
          // Mutating tool! Requires Approval Gate
          requiresApproval = true;
          const patchSummary = String(args["summary"] || "Apply code patch");
          const targetFile = String(args["targetFile"] || "unknown");
          const patchDiff = String(args["patch"] || "");

          const approvalReq = ApprovalGate.createApprovalRequest({
            requestId: this.requestId,
            projectId: this.context.projectId,
            userId: this.context.userId,
            toolName: "apply_patch",
            summary: patchSummary,
            rationale: "Fix identified code defect via verified patch.",
            filesAffected: [targetFile],
            diffPreview: patchDiff,
          });

          approvalId = approvalReq.id;
          data = {
            status: "PENDING_APPROVAL",
            approvalId,
            message: "This is a mutating action requiring explicit user approval.",
            approvalRequest: approvalReq,
          };
          break;
        }

        default:
          throw new Error(`Unknown AI tool: '${toolName}'`);
      }

      return {
        toolName,
        success: true,
        data,
        executionMs: Date.now() - startTime,
        requiresApproval,
        approvalId,
      };
    } catch (err) {
      return {
        toolName,
        success: false,
        data: null,
        error: (err as Error).message,
        executionMs: Date.now() - startTime,
      };
    }
  }
}
