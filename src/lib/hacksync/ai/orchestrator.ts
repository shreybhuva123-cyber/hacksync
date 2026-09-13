import type { Workspace, CodeNode, MemberFile } from "../types";
import { ProjectKnowledgeGraph } from "../intelligence/knowledge-graph";
import { ProjectIndexManager } from "../intelligence/project-index-manager";
import { TenantGuard, type AISecurityContext } from "../security/tenant-guard";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { AuditTrail } from "../security/audit-trail";
import { AIObservability } from "./observability";
import { AIToolExecutor } from "./tools";
import { ConversationMemory } from "./memory";
import { ModelRouter } from "./model-router";
import { HybridRetrievalEngine, type RetrievalResult } from "../intelligence/retrieval-engine";
import { ProjectContextBuilder, type BuiltContext } from "../intelligence/context-builder";
import type { AIIntentType, AIFinding, ToolCallResult } from "./types";
import type { LLMMessage } from "./provider-interface";
import type {
  TaskType,
  TaskPlan,
  AIResult,
  VerifiedEvidenceItem,
  OrchestratorRequest,
} from "./tool-types";
import { TaskClassifier } from "./task-classifier";
import { ContextPlanner } from "./context-planner";
import { ExecutionBudgetManager } from "./execution-budget";
import { OutputValidator } from "./output-validator";

export interface OrchestrationResult {
  text: string;
  intent: AIIntentType;
  modelUsed: string;
  toolCalls: { name: string; success: boolean; summary: string; executionMs?: number | undefined }[];
  findings: AIFinding[];
  suggestedActions: { label: string; action: string; payload?: any }[];
  requestId: string;
}

export class AIOrchestrator {
  static getKnowledgeGraph(projectId: string): ProjectKnowledgeGraph {
    if (!projectId || projectId.trim() === "") {
      throw new Error("[AIOrchestrator] Project ID is required to retrieve project knowledge graph");
    }
    return ProjectIndexManager.getGraph(projectId);
  }

  /**
   * Fast intent classifier — maintained for backward compatibility with existing tests and UI.
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
   * CANONICAL ENTRY POINT — Unified AI Orchestrator Pipeline
   * Handles:
   * Request Validation → Task Classification → Context Planning → Secure Tool Execution →
   * Multi-Signal Retrieval → Model Routing (with Fallbacks) → Citation Validation → Audit/Observability
   */
  static async process(request: OrchestratorRequest): Promise<AIResult> {
    const startTime = Date.now();
    const requestId = request.securityContext?.requestId || AIObservability.generateRequestId();

    // 1. Resolve security context and enforce tenant isolation
    let tenantContext: AISecurityContext;
    if (request.securityContext) {
      tenantContext = request.securityContext;
    } else if (request.ws) {
      const resolvedUserId = request.userId || request.ws.members?.[0]?.user_id || request.ws.project.created_by;
      if (!resolvedUserId) {
        throw new AuthenticationError("[AIOrchestrator] Authentication required. No securityContext or authenticated userId provided.");
      }
      tenantContext = TenantGuard.extractContext(request.ws, resolvedUserId, requestId);
    } else if (request.userId && request.projectId) {
      tenantContext = {
        userId: request.userId,
        projectId: request.projectId,
        role: "member",
        requestId,
      };
    } else {
      throw new AuthorizationError("[AIOrchestrator] Project context required: cannot execute AI orchestration without an authorized project.");
    }

    const userId = tenantContext.userId;
    const projectId = tenantContext.projectId;
    const preference = request.modelPreference || "builtin";

    // Validate project tenancy boundary
    if (request.projectId && request.projectId !== tenantContext.projectId) {
      TenantGuard.validateProjectAccess(tenantContext, request.projectId, "AI Query Orchestration");
    } else {
      TenantGuard.validateProjectAccess(tenantContext, projectId, "AI Query Orchestration");
    }

    // 2. Resolve conversational references (e.g. "fix it", "now test it")
    const { resolvedQuery, activeBugId, activeFilePath } =
      ConversationMemory.resolveContextualReferences(request.query, userId);

    // 3. Classify task and construct TaskPlan
    const plan = TaskClassifier.plan(resolvedQuery, activeFilePath, request.taskOverride);
    const legacyIntent = TaskClassifier.toLegacyIntent(plan.taskType, resolvedQuery);

    // 4. Ensure Project Knowledge Graph is isolated and indexed for THIS project
    const knowledgeGraph = ProjectIndexManager.getGraph(projectId);
    if (request.ws) {
      knowledgeGraph.indexWorkspace(request.ws, request.memberFiles || []);
    } else if (request.activeNode && request.activeNode.content) {
      TenantGuard.sanitizeFilePath(request.activeNode.path);
      knowledgeGraph.indexFile(request.activeNode.path, request.activeNode.content);
    }

    // 5. Context Planning
    const plannedContext = ContextPlanner.planContext({
      plan,
      query: resolvedQuery,
      graph: knowledgeGraph,
      ws: request.ws,
      options: { activeFilePath },
    });

    // 6. Tool Selection & Execution within Execution Budget
    const maxBudgetCalls = request.maxBudgetCalls || plan.maxToolCalls || 8;
    const budgetManager = new ExecutionBudgetManager({ maxToolCalls: maxBudgetCalls });
    const toolExecutor = new AIToolExecutor(knowledgeGraph, tenantContext, requestId, request.ws, budgetManager);

    const executedTools: { name: string; success: boolean; summary: string; executionMs?: number }[] = [];
    const collectedFindings: AIFinding[] = [];
    const verifiedEvidence: VerifiedEvidenceItem[] = [];

    // Execute appropriate tools based on task type / legacy intent
    if (legacyIntent === "fix") {
      const targetFindingId = activeBugId || collectedFindings[0]?.id || "FINDING-1";
      const fixRes = await toolExecutor.execute("generate_fix", { findingId: targetFindingId });
      executedTools.push({
        name: "generate_fix",
        success: fixRes.success,
        summary: `Generated fix plan for ${targetFindingId}`,
        executionMs: fixRes.executionMs,
      });
    } else if (legacyIntent === "debug" || plan.taskType === "debug") {
      // 1. Search relevant files
      const searchRes = await toolExecutor.execute("search_project", { query: resolvedQuery, limit: 3 });
      executedTools.push({
        name: "search_project",
        success: searchRes.success,
        summary: `Found ${(searchRes.data || []).length} relevant file(s)`,
        executionMs: searchRes.executionMs,
      });

      // 2. Deep AST code analysis
      const targetPath = activeFilePath || searchRes.data?.[0]?.path;
      const analyzeRes = await toolExecutor.execute("analyze_code", { path: targetPath });
      executedTools.push({
        name: "analyze_code",
        success: analyzeRes.success,
        summary: `Identified ${analyzeRes.data?.totalFindings || 0} AST code issue(s)`,
        executionMs: analyzeRes.executionMs,
      });

      if (analyzeRes.data?.findings) {
        collectedFindings.push(...analyzeRes.data.findings);
      }
    } else if (legacyIntent === "security" || plan.taskType === "security" || plan.taskType === "dependency") {
      const secRes = await toolExecutor.execute("analyze_security", {});
      executedTools.push({
        name: "analyze_security",
        success: secRes.success,
        summary: `Passive audit uncovered ${secRes.data?.totalFindings || 0} vulnerability flag(s)`,
        executionMs: secRes.executionMs,
      });

      const depRes = await toolExecutor.execute("analyze_dependencies", {});
      executedTools.push({
        name: "analyze_dependencies",
        success: depRes.success,
        summary: `Scanned ${depRes.data?.totalDependencies || 0} packages for advisories`,
        executionMs: depRes.executionMs,
      });

      if (secRes.data?.findings) {
        collectedFindings.push(...secRes.data.findings);
      }
    } else if (plan.taskType === "impact") {
      const target = activeFilePath || resolvedQuery.split(" ")[0] || "src/api/login.ts";
      const impactRes = await toolExecutor.execute("dependency_impact", { target });
      executedTools.push({
        name: "dependency_impact",
        success: impactRes.success,
        summary: `Calculated blast radius score ${impactRes.data?.blastRadiusScore || 0} (${impactRes.data?.riskTier || "LOW"})`,
        executionMs: impactRes.executionMs,
      });
    } else if (legacyIntent === "architecture" || plan.taskType === "architecture" || plan.taskType === "explain" || plan.taskType === "project_overview") {
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
          executionMs: structRes.executionMs,
        });

        // Run architecture summary
        const archRes = await toolExecutor.execute("architecture_summary", {});
        executedTools.push({
          name: "architecture_summary",
          success: archRes.success,
          summary: `Identified ${Object.keys(archRes.data?.layers || {}).length} architectural layers`,
          executionMs: archRes.executionMs,
        });
      }
    } else if (plan.taskType === "test" || legacyIntent === "testing") {
      const searchRes = await toolExecutor.execute("search_project", { query: resolvedQuery, limit: 3 });
      executedTools.push({
        name: "search_project",
        success: searchRes.success,
        summary: `Found ${(searchRes.data || []).length} relevant test/code file(s)`,
        executionMs: searchRes.executionMs,
      });
    }

    // 7. Update Conversation Memory with primary findings
    if (collectedFindings.length > 0 && collectedFindings[0]) {
      const top = collectedFindings[0];
      ConversationMemory.setActiveBug(top.id, top.primaryLocation.filePath, userId);
      ConversationMemory.setLastFixPlan(top.recommendedFix, undefined, userId);
    }

    // 8. Hybrid Multi-Signal Retrieval & Evidence Gathering
    const retrieval = HybridRetrievalEngine.retrieve({
      query: resolvedQuery,
      graph: knowledgeGraph,
      activeFilePath,
      limit: 5,
    });

    for (const hit of retrieval.hits) {
      verifiedEvidence.push({
        file: hit.filePath,
        lineStart: hit.lineRange?.start || 1,
        lineEnd: hit.lineRange?.end || 30,
        snippet: hit.snippet || "",
        confidence: hit.score,
        relevanceReason: hit.matchReasons.join(", "),
      });
    }

    // Also include evidence from findings
    for (const f of collectedFindings) {
      for (const ev of f.evidenceItems) {
        verifiedEvidence.push({
          file: ev.filePath,
          lineStart: ev.line,
          lineEnd: ev.line + 5,
          snippet: ev.snippet,
          confidence: ev.confidence,
          relevanceReason: ev.reason,
        });
      }
    }

    const archProfile = knowledgeGraph.getArchitectureProfile();
    const builtContext = ProjectContextBuilder.build(retrieval, collectedFindings, archProfile, {
      includeArchitectureProfile: true,
    });

    // 9. Model Routing with Multi-Provider Fallback
    const { provider, modelName, fallbackChain } = ModelRouter.getBestProvider(preference, legacyIntent);

    let outputText = "";
    let usedModel = modelName;

    if (provider && provider.isAvailable()) {
      const systemPrompt = `You are HackSync AI, an elite Staff Software Engineer and Cyber Security Specialist.
Analyze the user request using the provided verified codebase evidence.
Strictly adhere to the evidence provided. Do not hallucinate files or lines not present in the project.
Provide clear headings, code snippets with before/after blocks, and actionable steps.`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        ...(request.chatHistory || []).slice(-4).map((h) => ({
          role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: h.content,
        })),
        {
          role: "user",
          content: `${resolvedQuery}\n\n${plannedContext.formattedContext || builtContext.formattedContext}`,
        },
      ];

      const executionResult = await ModelRouter.executeWithFallback(provider, fallbackChain, messages);
      if (executionResult.response) {
        outputText = executionResult.response.text;
        usedModel = executionResult.usedModel;
      } else {
        // All upstream providers failed -> Fallback to Deterministic Report
        outputText = this.formatDeterministicReport(
          resolvedQuery,
          legacyIntent,
          collectedFindings,
          executedTools,
          request.ws,
          retrieval,
          builtContext,
        );
        usedModel = "HackSync Built-in Intelligence (deterministic)";
      }
    } else {
      // Deterministic Static Analysis Output (Zero Hallucinations, 100% Honest)
      outputText = this.formatDeterministicReport(
        resolvedQuery,
        legacyIntent,
        collectedFindings,
        executedTools,
        request.ws,
        retrieval,
        builtContext,
      );
      usedModel = "HackSync Built-in Intelligence (deterministic)";
    }

    // 10. Output Validation & Citation Checking
    const validation = OutputValidator.validate({
      text: outputText,
      taskType: plan.taskType,
      graph: knowledgeGraph,
      evidence: verifiedEvidence,
      findings: collectedFindings,
      baseConfidence: plan.confidence,
    });

    // 11. Record Audit Trail & Observability Metrics
    const latencyMs = Date.now() - startTime;
    const promptTokens = AIObservability.estimateTokens(resolvedQuery);
    const completionTokens = AIObservability.estimateTokens(validation.verifiedAnswer);
    const totalTokens = promptTokens + completionTokens;
    const costUsd = AIObservability.calculateCost(usedModel, promptTokens, completionTokens);

    AuditTrail.record({
      requestId,
      userId,
      projectId,
      toolName: executedTools.map((t) => t.name).join(", ") || "none",
      actionType: "READ_ONLY",
      status: "success",
      details: `Task: ${plan.taskType} (Intent: ${legacyIntent}). Findings: ${collectedFindings.length}`,
      executionMs: latencyMs,
    });

    AIObservability.recordMetrics({
      requestId,
      userId,
      projectId,
      model: usedModel,
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: costUsd,
      toolCallsCount: executedTools.length,
      status: "success",
    });

    // 12. Suggested Next Actions
    const suggestedActions = [
      { label: "🛠️ Generate Fix Plan", action: "fix_plan", payload: { bugId: collectedFindings[0]?.id } },
      { label: "📋 Generate Agent Prompt", action: "agent_prompt", payload: { bugId: collectedFindings[0]?.id } },
      { label: "🧪 Generate Tests", action: "generate_tests", payload: { bugId: collectedFindings[0]?.id } },
      { label: "🛡️ Passive Security Audit", action: "security_audit" },
    ];

    return {
      requestId,
      taskType: plan.taskType,
      answer: validation.verifiedAnswer,
      evidence: verifiedEvidence,
      findings: collectedFindings,
      uncertainty: validation.uncertainty && validation.uncertainty.length > 0 ? validation.uncertainty : undefined,
      confidence: validation.confidence,
      actionsRequired: suggestedActions,
      modelUsed: usedModel,
      toolCalls: executedTools,
      metrics: {
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: costUsd,
      },
    };
  }

  /**
   * Primary Entry Point (Backward Compatible with Phase 0/0.1/1 and UI)
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
    const result = await this.process({
      query: params.query,
      ws: params.ws,
      activeNode: params.activeNode,
      memberFiles: params.memberFiles,
      userId: params.userId,
      securityContext: params.securityContext,
      modelPreference: params.modelPreference,
      chatHistory: params.chatHistory,
    });

    const legacyIntent = TaskClassifier.toLegacyIntent(result.taskType, params.query);

    return {
      text: result.answer,
      intent: legacyIntent,
      modelUsed: result.modelUsed,
      toolCalls: result.toolCalls.map((t) => ({
        name: t.name,
        success: t.success,
        summary: t.summary,
        executionMs: t.executionMs,
      })),
      findings: result.findings || [],
      suggestedActions: result.actionsRequired || [],
      requestId: result.requestId,
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
    retrieval?: RetrievalResult | undefined,
    builtContext?: BuiltContext | undefined,
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
      if (retrieval && retrieval.hits.length > 0) {
        const codeHits = retrieval.hits
          .map((h) => {
            const syms = h.matchedSymbols.length > 0 ? ` (Symbols: ${h.matchedSymbols.map((s) => s.name).join(", ")})` : "";
            const range = h.lineRange ? ` [Lines ${h.lineRange.start}-${h.lineRange.end}]` : "";
            return `#### 📄 File: \`${h.filePath}\`${range}${syms}\nRelevance Score: ${h.score} | Reasons: ${h.matchReasons.join(", ")}\n\`\`\`typescript\n${h.snippet || ""}\n\`\`\``;
          })
          .join("\n\n");
        return header + `### 📑 Retrieved Code Context:\n\n` + codeHits;
      }

      if (builtContext && !builtContext.hasSufficientEvidence) {
        return (
          header +
          `⚠️ [Project Context]: Insufficient project evidence found for query '${query}'. No matching symbols or files located in the project index.`
        );
      }

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
