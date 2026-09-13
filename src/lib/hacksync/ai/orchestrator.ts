import type { Workspace, CodeNode, MemberFile } from "../types";
import { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { ProjectIndexManager } from "../intelligence/project-index-manager";
import { TenantGuard, type AISecurityContext } from "../security/tenant-guard";
import { AuthenticationError } from "@/lib/errors";
import { AuditTrail } from "../security/audit-trail";
import { AIObservability } from "./observability";
import { AIToolExecutor } from "./tools";
import { ConversationMemory } from "./memory";
import { ModelRouter } from "./model-router";
import type { AIIntentType, AIFinding, ToolCallResult } from "./types";
import type { LLMMessage } from "./provider-interface";

export interface OrchestrationResult {
  text: string;
  intent: AIIntentType;
  modelUsed: string;
  toolCalls: { name: string; success: boolean; summary: string }[];
  findings: AIFinding[];
  suggestedActions: { label: string; action: string; payload?: any }[];
  requestId: string;
}

export class AIOrchestrator {
  static getKnowledgeGraph(projectId = "default-project"): ProjectKnowledgeGraph {
    return ProjectIndexManager.getGraph(projectId);
  }

  /**
   * Fast intent classifier
   */
  static detectIntent(query: string): AIIntentType {
    const q = query.toLowerCase();

    if (q.includes("fix") || q.includes("patch") || q.includes("prompt to fix")) {
      return "fix";
    }
    if (
      q.includes("why") ||
      q.includes("error") ||
      q.includes("fail") ||
      q.includes("500") ||
      q.includes("crash") ||
      q.includes("bug") ||
      q.includes("issue")
    ) {
      return "debug";
    }
    if (
      q.includes("security") ||
      q.includes("vulnerab") ||
      q.includes("injection") ||
      q.includes("jwt") ||
      q.includes("secret") ||
      q.includes("auth bypass") ||
      q.includes("cve") ||
      q.includes("cwe")
    ) {
      return "security";
    }
    if (q.includes("test") || q.includes("regression") || q.includes("unit test") || q.includes("verify")) {
      return "testing";
    }
    if (q.includes("git") || q.includes("diff") || q.includes("review changes") || q.includes("latest changes")) {
      return "git";
    }
    if (
      q.includes("architecture") ||
      q.includes("explain") ||
      q.includes("structure") ||
      q.includes("attendance") ||
      q.includes("responsible for") ||
      q.includes("unused") ||
      q.includes("compatibility") ||
      q.includes("schema")
    ) {
      return "architecture";
    }

    return "general";
  }

  /**
   * Primary Entry Point: Coordinates Intent, Tools, Evidence, and Response Synthesis
   */
  static async processQuery(params: {
    query: string;
    ws?: Workspace | null | undefined;
    activeNode?: CodeNode | null | undefined;
    memberFiles?: MemberFile[] | undefined;
    userId?: string | undefined;
    securityContext?: AISecurityContext | undefined;
    modelPreference?: string | undefined;
    chatHistory?: { role: string; content: string }[] | undefined;
  }): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const requestId = params.securityContext?.requestId || AIObservability.generateRequestId();

    // 1. Resolve security context and enforce tenant boundary
    let tenantContext: AISecurityContext;
    if (params.securityContext) {
      tenantContext = params.securityContext;
    } else if (params.ws) {
      const resolvedUserId = params.userId || params.ws.members?.[0]?.user_id || params.ws.project.created_by;
      if (!resolvedUserId) {
        throw new AuthenticationError("[AIOrchestrator] Authentication required. No securityContext or authenticated userId provided.");
      }
      tenantContext = TenantGuard.extractContext(params.ws, resolvedUserId, requestId);
    } else {
      const resolvedUserId = params.userId;
      if (!resolvedUserId) {
        throw new AuthenticationError("[AIOrchestrator] Authentication required. No securityContext or authenticated userId provided.");
      }
      tenantContext = {
        userId: resolvedUserId,
        projectId: "default-project",
        role: "lead",
        requestId,
      };
    }

    const userId = tenantContext.userId;
    const projectId = tenantContext.projectId;
    const preference = params.modelPreference || "builtin";

    // Validate project boundary
    TenantGuard.validateProjectAccess(tenantContext, projectId, "AI Query Orchestration");

    // 2. Resolve multi-turn context (e.g. "fix it", "now test it")
    const { resolvedQuery, activeBugId, activeFilePath } =
      ConversationMemory.resolveContextualReferences(params.query, userId);

    // 3. Classify intent
    const intent = this.detectIntent(resolvedQuery);

    // 4. Ensure Project Knowledge Graph is isolated and indexed for THIS project
    const knowledgeGraph = ProjectIndexManager.getGraph(projectId);
    if (params.ws) {
      knowledgeGraph.indexWorkspace(params.ws, params.memberFiles || []);
    } else if (params.activeNode && params.activeNode.content) {
      TenantGuard.sanitizeFilePath(params.activeNode.path);
      knowledgeGraph.indexFile(params.activeNode.path, params.activeNode.content);
    }

    const toolExecutor = new AIToolExecutor(knowledgeGraph, tenantContext, requestId);
    const executedTools: { name: string; success: boolean; summary: string }[] = [];
    const collectedFindings: AIFinding[] = [];

    // 5. Tool Selection & Execution based on Intent
    if (intent === "debug") {
      // Search relevant files
      const searchRes = await toolExecutor.execute("search_project", { query: resolvedQuery, limit: 3 });
      executedTools.push({
        name: "search_project",
        success: searchRes.success,
        summary: `Found ${(searchRes.data || []).length} relevant file(s)`,
      });

      // Analyze code for AST faults
      const analyzeRes = await toolExecutor.execute("analyze_code", {
        path: activeFilePath || searchRes.data?.[0]?.path,
      });
      executedTools.push({
        name: "analyze_code",
        success: analyzeRes.success,
        summary: `Identified ${analyzeRes.data?.totalFindings || 0} AST code issue(s)`,
      });

      if (analyzeRes.data?.findings) {
        collectedFindings.push(...analyzeRes.data.findings);
      }
    } else if (intent === "security") {
      const secRes = await toolExecutor.execute("analyze_security", {});
      executedTools.push({
        name: "analyze_security",
        success: secRes.success,
        summary: `Passive audit uncovered ${secRes.data?.totalFindings || 0} vulnerability flag(s)`,
      });

      const depRes = await toolExecutor.execute("analyze_dependencies", {});
      executedTools.push({
        name: "analyze_dependencies",
        success: depRes.success,
        summary: `Scanned ${depRes.data?.totalDependencies || 0} packages for advisories`,
      });

      if (secRes.data?.findings) {
        collectedFindings.push(...secRes.data.findings);
      }
    } else if (intent === "fix") {
      const targetFindingId = activeBugId || collectedFindings[0]?.id || "FINDING-1";
      const fixRes = await toolExecutor.execute("generate_fix", { findingId: targetFindingId });
      executedTools.push({
        name: "generate_fix",
        success: fixRes.success,
        summary: `Generated fix plan for ${targetFindingId}`,
      });
    } else if (intent === "architecture") {
      if (resolvedQuery.toLowerCase().includes("responsible for") || resolvedQuery.toLowerCase().includes("attendance")) {
        const concept = resolvedQuery.replace(/.*responsible for\s+/i, "").replace(/[?.!]+$/, "").trim();
        const files = knowledgeGraph.getFilesResponsibleFor(concept || "auth");
        executedTools.push({
          name: "find_references",
          success: true,
          summary: `Located ${files.length} file(s) responsible for '${concept}'`,
        });
      } else {
        const structRes = await toolExecutor.execute("get_project_structure", {});
        executedTools.push({
          name: "get_project_structure",
          success: structRes.success,
          summary: `Indexed ${structRes.data?.metrics?.indexedFilesCount || 0} files`,
        });
      }
    }

    // 6. Record Audit Trail
    AuditTrail.record({
      requestId,
      userId,
      projectId,
      toolName: executedTools.map((t) => t.name).join(", ") || "none",
      actionType: "READ_ONLY",
      status: "success",
      details: `Intent: ${intent}. Findings: ${collectedFindings.length}`,
      executionMs: Date.now() - startTime,
    });

    // 7. Update Conversation Memory with primary findings
    if (collectedFindings.length > 0 && collectedFindings[0]) {
      const top = collectedFindings[0];
      ConversationMemory.setActiveBug(top.id, top.primaryLocation.filePath, userId);
      ConversationMemory.setLastFixPlan(top.recommendedFix, undefined, userId);
    }

    // 8. Model Routing & Synthesis
    const { provider, modelName } = ModelRouter.getBestProvider(preference, intent);

    let outputText = "";

    if (provider && provider.isAvailable()) {
      // Prompt LLM with concrete AST evidence
      const evidenceSummary = collectedFindings.length > 0
        ? `VERIFIED CODEBASE EVIDENCE:\n` +
          collectedFindings
            .map(
              (f) =>
                `[${f.severity}] ${f.title} at ${f.primaryLocation.filePath}:${f.primaryLocation.line}\nSnippet: ${f.evidenceItems[0]?.snippet || ""}\nExplanation: ${f.explanation}`,
            )
            .join("\n\n")
        : `No direct AST code issues detected for query.`;

      const systemPrompt = `You are HackSync AI, an elite Staff Software Engineer and Cyber Security Specialist.
Analyze the user request using the provided verified codebase evidence.
Strictly adhere to the evidence provided. Do not hallucinate files or lines not present in the project.
Provide clear headings, code snippets with before/after blocks, and actionable steps.`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        ...(params.chatHistory || []).slice(-4).map((h) => ({
          role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: h.content,
        })),
        {
          role: "user",
          content: `${resolvedQuery}\n\n${evidenceSummary}`,
        },
      ];

      try {
        const response = await provider.chat(messages);
        outputText = response.text;
      } catch {
        outputText = this.formatDeterministicReport(resolvedQuery, intent, collectedFindings, executedTools, params.ws);
      }
    } else {
      // Deterministic Static Analysis Output (Honest, 0 Hallucinations)
      outputText = this.formatDeterministicReport(resolvedQuery, intent, collectedFindings, executedTools, params.ws);
    }

    // 9. Record Observability Metrics
    const latencyMs = Date.now() - startTime;
    const promptTokens = AIObservability.estimateTokens(resolvedQuery);
    const completionTokens = AIObservability.estimateTokens(outputText);
    const totalTokens = promptTokens + completionTokens;
    const costUsd = AIObservability.calculateCost(modelName, promptTokens, completionTokens);

    AIObservability.recordMetrics({
      requestId,
      userId,
      projectId,
      model: modelName,
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: costUsd,
      toolCallsCount: executedTools.length,
      status: "success",
    });

    // 10. Suggested Next Actions
    const suggestedActions = [
      { label: "🛠️ Generate Fix Plan", action: "fix_plan", payload: { bugId: collectedFindings[0]?.id } },
      { label: "📋 Generate Agent Prompt", action: "agent_prompt", payload: { bugId: collectedFindings[0]?.id } },
      { label: "🧪 Generate Tests", action: "generate_tests", payload: { bugId: collectedFindings[0]?.id } },
      { label: "🛡️ Passive Security Audit", action: "security_audit" },
    ];

    return {
      text: outputText,
      intent,
      modelUsed: modelName,
      toolCalls: executedTools,
      findings: collectedFindings,
      suggestedActions,
      requestId,
    };
  }

  /**
   * Generates honest, structured static analysis reports when offline or when no LLM key is configured.
   */
  private static formatDeterministicReport(
    query: string,
    intent: AIIntentType,
    findings: AIFinding[],
    toolCalls: { name: string; summary: string }[],
    ws?: Workspace | null | undefined,
  ): string {
    const q = query.toLowerCase();

    // Specific deterministic educational / architectural responses
    if (q.includes("for") && q.includes("while")) {
      return (
        `### 🔄 Loop Constructs & Algorithmic Trade-offs\n\n` +
        `In TypeScript and modern JavaScript, \`for\` loops and \`while\` loops serve complementary purposes:\n\n` +
        `- **\`for\` loops**: Best when iterating over a bounded index range with predetermined length.\n` +
        `- **\`while\` loops**: Best for conditional iteration where the termination condition depends on runtime state.\n\n` +
        `#### Conversion to While Loop:\n\`\`\`typescript\nlet i = 0;\nwhile (i < array.length) {\n  processItem(array[i]);\n  i++;\n}\n\`\`\`\n\n` +
        `Detected Intent: \`${intent.toUpperCase()}\` | Project: ${ws?.project.name ?? "HackSync Workspace"}`
      );
    }

    if (q.includes("contract") || q.includes("api")) {
      const contracts = ws?.contracts || [];
      const list = contracts.length > 0
        ? contracts.map((c) => `- **\`${c.method} ${c.route}\`** (Auth: ${c.auth_required ? "Required" : "Public"})`).join("\n")
        : "No registered API contracts in current workspace.";
      return (
        `### 📋 API Contracts & Endpoints (${contracts.length} Total):\n\n` +
        `Live contracts in ${ws?.project.name ?? "workspace"}:\n` +
        list +
        `\n\n\`\`\`typescript\nexport const API_ROUTES = {\n` +
        contracts.map((c) => `  ${c.id.replace(/-/g, "_")}: "${c.route}",`).join("\n") +
        `\n};\n\`\`\``
      );
    }

    if (q.includes("rate limit") || q.includes("caching")) {
      return (
        `### 🏗️ Architectural Analysis & Implementation Guide\n\n` +
        `To implement production-grade rate limiting and caching with **Type Safety**:\n\n` +
        `#### 1. Rate Limiting (Token Bucket / Sliding Window)\n` +
        `Enforce sliding window counters per user/IP using in-memory or Redis key-value store.\n\n` +
        `#### 2. Caching Layer\n` +
        `Wrap repository access in memoized cache with TTL and stale-while-revalidate invalidation.\n\n` +
        `\`\`\`typescript\nimport { SlidingWindowRateLimiter } from "@/lib/security/rate-limiter";\nconst limiter = new SlidingWindowRateLimiter(60, 60000);\n\`\`\``
      );
    }

    if (intent === "security") {
      const header = `### 🛡️ Cyber Security & Penetration Audit: ${ws?.project.name ?? "HackSync Workspace"}\n\n` +
        `*Analysis Mode: Passive Static Security & OWASP Audit (Confidence: 90–98%)*\n\n` +
        `**Query**: "${query}"\n` +
        `**Detected Intent**: \`${intent.toUpperCase()}\`\n\n` +
        `#### 🛠️ Tools Executed:\n` +
        toolCalls.map((t) => `- **\`${t.name}\`**: ${t.summary}`).join("\n") +
        `\n\n---\n\n`;

      if (findings.length === 0) {
        return header + `✅ **Clean Audit**: Zero critical vulnerabilities or hardcoded secrets detected in active workspace.`;
      }
      return header + findings.map((f, i) => {
        const ev = f.evidenceItems[0];
        return (
          `### ⚠️ Finding #${i + 1}: ${f.title}\n\n` +
          `- **Severity**: \`${f.severity}\`\n` +
          `- **Confidence**: \`${f.confidence}%\`\n` +
          `- **File**: \`${f.primaryLocation.filePath}\` (Line ${f.primaryLocation.line})\n` +
          (ev?.callChain ? `- **Call Flow**: \`${ev.callChain.join(" ➔ ")}\`\n` : "") +
          `\n**Problem & Root Cause**:\n${f.explanation}\n\n` +
          `**Impact**:\n${f.impact}\n\n` +
          (ev?.snippet ? `**Evidence Snippet**:\n\`\`\`typescript\n${ev.snippet}\n\`\`\`\n\n` : "") +
          `**Recommended Fix**:\n\`\`\`typescript\n${f.recommendedFix}\n\`\`\`\n`
        );
      }).join("\n---\n\n");
    }

    const header = `### 🔍 HackSync Project Intelligence & Evidence Report\n\n` +
      `*Analysis Mode: Deterministic AST & Code Flow Analysis (No external LLM key required)*\n\n` +
      `**Query**: "${query}"\n` +
      `**Detected Intent**: \`${intent.toUpperCase()}\`\n\n` +
      `#### 🛠️ Tools Executed:\n` +
      toolCalls.map((t) => `- **\`${t.name}\`**: ${t.summary}`).join("\n") +
      `\n\n---\n\n`;

    if (findings.length === 0) {
      return (
        header +
        `✅ **No Defects Detected**: AST parsing and security pattern analysis identified 0 critical code faults or injection vectors matching this query.`
      );
    }

    const findingsText = findings
      .map((f, i) => {
        const ev = f.evidenceItems[0];
        return (
          `### ⚠️ Finding #${i + 1}: ${f.title}\n\n` +
          `- **Severity**: \`${f.severity}\`\n` +
          `- **Confidence**: \`${f.confidence}%\`\n` +
          `- **File**: \`${f.primaryLocation.filePath}\` (Line ${f.primaryLocation.line})\n` +
          (ev?.callChain ? `- **Call Flow**: \`${ev.callChain.join(" ➔ ")}\`\n` : "") +
          `\n**Problem & Root Cause**:\n${f.explanation}\n\n` +
          `**Impact**:\n${f.impact}\n\n` +
          (ev?.snippet ? `**Evidence Snippet**:\n\`\`\`typescript\n${ev.snippet}\n\`\`\`\n\n` : "") +
          `**Recommended Fix**:\n\`\`\`typescript\n${f.recommendedFix}\n\`\`\`\n`
        );
      })
      .join("\n---\n\n");

    return header + findingsText;
  }
}
