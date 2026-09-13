import type { CodeNode, Workspace } from "./types";

export interface CodeBug {
  id: string;
  line: number;
  snippet?: string;
  title: string;
  category: "logic" | "async" | "type" | "security" | "performance";
  severity: "critical" | "warning" | "info";
  description: string;
  debuggingGuide: string;
  suggestedFix: string;
}

export interface CodeOptimization {
  id: string;
  title: string;
  benefit: string;
  promptToRefactor: string;
  beforeSnippet?: string;
  afterSnippet?: string;
}

export interface CodeExplanation {
  overview: string;
  architectureRole: string;
  keyFunctions: { name: string; purpose: string; lineRange?: string }[];
  constructInsights: {
    construct: string;
    whyUsed: string;
    alternatives: string;
    transformationGuide?: {
      targetConstruct: string;
      explanation: string;
      convertedSnippet: string;
    };
  }[];
}

export interface CodeAnalysisResult {
  nodeId: string;
  path: string;
  bugs: CodeBug[];
  optimizations: CodeOptimization[];
  explanation: CodeExplanation;
  analyzedAt: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  suggestedActions?: { label: string; action: string; payload?: unknown }[] | undefined;
  intent?: string | undefined;
  toolCalls?: { name: string; success: boolean; summary: string }[] | undefined;
  findings?: import("./ai/types").AIFinding[] | undefined;
  requestId?: string | undefined;
  modelUsed?: string | undefined;
  pendingApproval?: import("./ai/approval-gate").PendingApprovalRequest | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Analysis Engine
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeCodeFile(node: CodeNode, ws: Workspace): CodeAnalysisResult {
  const content = node.content || "";
  const lines = content.split("\n");
  const bugs: CodeBug[] = [];
  const optimizations: CodeOptimization[] = [];
  const constructInsights: CodeExplanation["constructInsights"] = [];

  // 1. Bug Detection Heuristics
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Check for unhandled async promises without await or .catch
    if (
      /\b(?:fetch|supabase\..*|axios\..*)\(/.test(line) &&
      !/\bawait\b/.test(line) &&
      !/\.then|\.catch/.test(line) &&
      !line.trim().startsWith("//")
    ) {
      bugs.push({
        id: `bug-unhandled-promise-${idx}`,
        line: lineNum,
        snippet: line.trim(),
        title: "Floating Unhandled Promise (Async Fault)",
        category: "async",
        severity: "critical",
        description: `An asynchronous network/database call is initiated on line ${lineNum} without 'await' or a '.catch()' rejection handler. If this fails, the error will be unhandled and cause silent data desynchronization or crashed request flows.`,
        debuggingGuide:
          "1. Mark the enclosing function with `async`.\n2. Prepend `await` to the expression or chain `.catch((err) => handle(err))`.\n3. Wrap in a `try/catch` block to handle network timeouts.",
        suggestedFix: `try {\n  const res = await ${line.trim().replace(/^const\s+[a-zA-Z0-9_]+\s*=\s*/, "")}\n} catch (error) {\n  console.error('Operation failed:', error);\n}`,
      });
    }

    // Check for potential infinite loop or unbounded while(true)
    if (/\bwhile\s*\(\s*true\s*\)/.test(line) && !content.includes("break")) {
      bugs.push({
        id: `bug-infinite-loop-${idx}`,
        line: lineNum,
        snippet: line.trim(),
        title: "Potential Infinite Loop Trap",
        category: "logic",
        severity: "critical",
        description: `A 'while (true)' loop was identified without an explicit break condition in its block. This will hang the event loop and freeze user browsers or server worker threads.`,
        debuggingGuide:
          "1. Add an iteration safeguard counter: `let iterations = 0; if (++iterations > MAX) break;`.\n2. Introduce an explicit boolean termination predicate.",
        suggestedFix: `let attempts = 0;\nconst MAX_ATTEMPTS = 100;\nwhile (condition && attempts++ < MAX_ATTEMPTS) {\n  // your loop body\n}`,
      });
    }

    // Check for equality comparison with NaN
    if (/===\s*NaN\b|!==\s*NaN\b/.test(line)) {
      bugs.push({
        id: `bug-nan-check-${idx}`,
        line: lineNum,
        snippet: line.trim(),
        title: "Incorrect NaN Comparison",
        category: "logic",
        severity: "warning",
        description: `Comparing values directly with '=== NaN' always evaluates to false in JavaScript/TypeScript because NaN is not equal to itself.`,
        debuggingGuide:
          "Replace `x === NaN` with `Number.isNaN(x)`. Use `Number.isFinite(x)` if testing for valid numerical bounds.",
        suggestedFix: line.replace(/([a-zA-Z0-9_]+)\s*===\s*NaN/g, "Number.isNaN($1)"),
      });
    }

    // Check for direct mutation of arrays or state
    if (/\.push\(|\.splice\(|\.reverse\(/.test(line) && /state|props|items/i.test(line)) {
      bugs.push({
        id: `bug-state-mutation-${idx}`,
        line: lineNum,
        snippet: line.trim(),
        title: "Direct Mutation of State / Array",
        category: "logic",
        severity: "warning",
        description: `Direct in-place array mutation (e.g. .push() / .splice()) detected. In React and reactive architectures, mutating state objects directly prevents change-detection triggers and causes render bugs.`,
        debuggingGuide:
          "Use immutable updates like `[...items, newItem]` or `.slice()` / `.filter()` instead of mutating in place.",
        suggestedFix: `setItems((prev) => [...prev, newItem]);`,
      });
    }

    // Check for property access on potentially null/undefined user or entity before existence validation
    if (/(?:user|account|member|record|profile)\.password\b/i.test(line)) {
      const priorContext = lines.slice(Math.max(0, idx - 15), idx).join("\n");
      const hasCheck = /if\s*\(\s*!(?:user|account|member|record|profile)\b|\bif\s*\(\s*(?:user|account|member|record|profile)\s*===?\s*null\b|\bif\s*\(\s*(?:user|account|member|record|profile)\s*===?\s*undefined\b/i.test(priorContext);

      if (!hasCheck) {
        bugs.push({
          id: `bug-null-access-${idx}`,
          line: lineNum,
          snippet: line.trim(),
          title: "Unchecked Property Access on Nullable Entity",
          category: "logic",
          severity: "critical",
          description: `Entity property is accessed on line ${lineNum} before validating whether the preceding database query or function returned a non-null object. If the entity does not exist, this throws a TypeError and triggers an HTTP 500 Internal Server Error.`,
          debuggingGuide:
            "1. Check if entity is null/undefined before accessing its properties.\n2. Return a 401 Unauthorized or 404 Not Found error early.\n3. Wrap in a try/catch block.",
          suggestedFix: `if (!user) {\n  return res.status(401).json({ error: "Invalid credentials" });\n}`,
        });
      }
    }
  });

  // 2. Loop & Construct Educational Insights (e.g., Why for vs while?)
  const hasForLoop = /\bfor\s*\(/.test(content);
  const hasWhileLoop = /\bwhile\s*\(/.test(content);
  const hasArrayMap = /\.map\s*\(/.test(content);
  const hasAsyncAwait = /\basync\b|\bawait\b/.test(content);

  if (hasForLoop) {
    constructInsights.push({
      construct: "Standard 'for' Loop (Counter-Based Iteration)",
      whyUsed:
        "A counter-based `for (let i = 0; i < len; i++)` loop is used when the number of iterations is strictly known beforehand or when indexing into multiple parallel arrays. It encapsulates initialization, condition, and increment in a single compact header to prevent accidental infinite loops.",
      alternatives:
        "`while` loop (preferred when termination depends on dynamic runtime conditions or external signals), `for...of` (cleaner object/array element iteration), or `.map()` / `.forEach()` (declarative functional pipelines).",
      transformationGuide: {
        targetConstruct: "While Loop Alternative",
        explanation:
          "To transform a `for` loop into a `while` loop, move the counter initialization before the loop, keep only the condition in the `while (...)` header, and place the increment as the final operation inside the block body.",
        convertedSnippet: `// BEFORE (for loop):\nfor (let i = 0; i < items.length; i++) {\n  processItem(items[i]);\n}\n\n// AFTER (while loop equivalent):\nlet i = 0;\nwhile (i < items.length) {\n  processItem(items[i]);\n  i++; // Increment moved inside loop body\n}`,
      },
    });
  }

  if (hasWhileLoop) {
    constructInsights.push({
      construct: "Dynamic 'while' Loop",
      whyUsed:
        "A `while` loop is used when iteration count is non-deterministic (e.g. reading chunks from a stream, retrying network requests with exponential backoff, or walking hierarchical graph/tree nodes until a sentinel is found).",
      alternatives:
        "`for` loop (if iterating over bounded arrays), recursion (for deep hierarchical structures).",
      transformationGuide: {
        targetConstruct: "Bounded For Loop with Timeout Guard",
        explanation:
          "To transform a `while` loop into a bounded `for` loop with a maximum safety cap to prevent accidental lockups:",
        convertedSnippet: `// Bounded loop with retry limit:\nfor (let attempt = 0; attempt < MAX_RETRIES && !isDone; attempt++) {\n  isDone = await performTask();\n}`,
      },
    });
  }

  if (hasArrayMap) {
    constructInsights.push({
      construct: "Declarative Array.map() Transformation",
      whyUsed:
        "`.map()` expresses a pure mathematical transformation of every item in an array into a new array without side-effects. It ensures immutability, avoids manual index tracking, and fits cleanly with React JSX rendering pipelines.",
      alternatives:
        "`for...of` (if you need early `break` or asynchronous steps), `.reduce()` (if aggregating into a different shape).",
      transformationGuide: {
        targetConstruct: "Imperative for...of Loop",
        explanation:
          "If you need to perform early exits or async operations that `.map()` does not support gracefully:",
        convertedSnippet: `// Transformed to imperative for...of:\nconst results = [];\nfor (const item of items) {\n  if (item.skip) continue; // Early skip\n  results.push(transform(item));\n}`,
      },
    });
  }

  if (hasAsyncAwait) {
    constructInsights.push({
      construct: "Async / Await Concurrency",
      whyUsed:
        "`async/await` allows writing asynchronous non-blocking code using synchronous syntax flow, drastically reducing 'callback hell' and making error handling consistent with standard `try/catch` blocks.",
      alternatives: "`Promise.all()` for parallel execution, RxJS observables for event streams.",
    });
  }

  // 3. Optimization & Improvement Recommendations
  if (hasForLoop && content.includes(".length")) {
    optimizations.push({
      id: "opt-loop-cache",
      title: "Cache Array Length in Loops",
      benefit:
        "Avoids re-evaluating `.length` property lookup on every iteration in performance-critical hot paths.",
      promptToRefactor:
        "Refactor standard for loops to cache length: `for (let i = 0, len = arr.length; i < len; i++)` or use `for...of`.",
      beforeSnippet: `for (let i = 0; i < array.length; i++)`,
      afterSnippet: `for (let i = 0, len = array.length; i < len; i++)`,
    });
  }

  if (content.includes("useQuery") || content.includes("useState")) {
    optimizations.push({
      id: "opt-memo-helpers",
      title: "Memoize Derived Selectors with useMemo",
      benefit: "Prevents recalculating complex filters or sorting on every parent re-render.",
      promptToRefactor:
        "Wrap expensive filtering/transformation passes inside `useMemo(() => compute(), [deps])`.",
      beforeSnippet: `const filtered = items.filter(heavyFilter);`,
      afterSnippet: `const filtered = useMemo(() => items.filter(heavyFilter), [items]);`,
    });
  }

  optimizations.push({
    id: "opt-error-boundaries",
    title: "Add Granular Fault Isolation & Fallback UI",
    benefit:
      "Prevents an unexpected crash in a single component from taking down the entire hackathon workspace.",
    promptToRefactor:
      "Wrap critical components in React Error Boundaries with automatic retry capabilities.",
  });

  return {
    nodeId: node.id,
    path: node.path,
    bugs,
    optimizations,
    explanation: {
      overview: `The file '${node.path}' forms part of the ${node.area} layer (managed by ${node.owner_role ?? "team"}). It currently has status '${node.status}'.`,
      architectureRole: `In the HackSync workspace architecture, this node provides ${node.language ? node.language.toUpperCase() : "source"} functionality tied to workspace state.`,
      keyFunctions: [
        {
          name: "Main Export",
          purpose: "Primary component or service logic",
          lineRange: `Lines 1-${lines.length}`,
        },
      ],
      constructInsights,
    },
    analyzedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Q&A / Workspace Copilot Engine (Powered by AIOrchestrator)
// ─────────────────────────────────────────────────────────────────────────────

import { aiAssistantLimiter } from "@/lib/security/rate-limiter";
import { metrics } from "@/lib/observability/metrics";
import { supabase } from "@/integrations/supabase/client";
import { ApprovalGate } from "./ai/approval-gate";

export async function askWorkspaceCopilot(
  userQuery: string,
  ws?: Workspace | null,
  activeNode?: CodeNode | null,
  chatHistory: CopilotMessage[] = [],
  userId?: string | undefined,
  modelPreference = "builtin",
  overrideAuthToken?: string,
): Promise<CopilotMessage> {
  let authToken: string | undefined = overrideAuthToken;
  let authenticatedUserId = userId && userId !== "client-user" ? userId : undefined;

  // Retrieve current authenticated session token from Supabase
  if (!authToken) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        authToken = data.session.access_token;
        if (data.session.user?.id) {
          authenticatedUserId = data.session.user.id;
        }
      }
    } catch {
      // Offline or test environment
    }
  }

  const effectiveUserId =
    authenticatedUserId ||
    ws?.members?.[0]?.user_id ||
    ws?.project?.created_by ||
    "usr-authenticated";

  // Enforce distributed rate limit
  const rateCheck = await aiAssistantLimiter.check(effectiveUserId);
  if (!rateCheck.allowed) {
    metrics.incrementCounter("rate_limit_exceeded");
    return {
      id: `copilot-ratelimit-${Date.now()}`,
      role: "assistant",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `⚠️ **Rate Limit Exceeded**: You have reached the maximum allowed AI queries (${rateCheck.limit}/min). Please wait **${rateCheck.retryAfterSeconds ?? 30} seconds** before submitting another request.`,
    };
  }

  // If in browser, strictly route all requests to the backend AI gateway
  if (typeof window !== "undefined") {
    // 1. Require authentic session token — never send raw user IDs
    if (!authToken) {
      return {
        id: `copilot-auth-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: "🔒 **Authentication Required**: Please sign in to use HackSync AI Copilot. A valid session token is required to communicate with the secure AI Gateway.",
      };
    }

    // 2. Require active project
    if (!ws?.project?.id) {
      return {
        id: `copilot-err-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: "⚠️ **No Active Workspace**: Please select or create a project workspace before querying the AI Copilot.",
      };
    }

    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          query: userQuery,
          projectId: ws.project.id,
          workspace: ws,
          activeNode,
          modelPreference,
          chatHistory: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const pendingApprovals = ApprovalGate.getPendingForProject(ws.project.id);
        const latestPending = pendingApprovals.length > 0 ? pendingApprovals[pendingApprovals.length - 1] : undefined;

        return {
          id: `copilot-${Date.now()}`,
          role: "assistant",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          content: data.text,
          suggestedActions: data.suggestedActions,
          intent: data.intent,
          toolCalls: data.toolCalls,
          findings: data.findings,
          requestId: data.requestId,
          modelUsed: data.modelUsed,
          pendingApproval: latestPending,
        };
      }

      const errData = await response.json().catch(() => ({}));
      return {
        id: `copilot-err-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: `⚠️ **${errData?.error?.code || "AI Gateway Error"}**: ${errData?.error?.message || "Request rejected by server AI Gateway."}`,
      };
    } catch {
      // Never fall back to executing local orchestrator in browser
      return {
        id: `copilot-err-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: "⚠️ **AI Service Unavailable**: Unable to reach the HackSync AI Gateway. Please check your network connection or try again shortly.",
      };
    }
  }

  // Server / Test runner execution path only (offline unit tests)
  const serverUserId =
    authenticatedUserId ||
    ws?.members?.[0]?.user_id ||
    ws?.project?.created_by ||
    "test-runner-user";

  const historyTuples = chatHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const { AIOrchestrator } = await import("./ai/orchestrator");
  const result = await AIOrchestrator.processQuery({
    query: userQuery,
    ws,
    activeNode,
    userId: serverUserId,
    modelPreference,
    chatHistory: historyTuples,
  });

  const pendingApprovals = ws ? ApprovalGate.getPendingForProject(ws.project.id) : [];
  const latestPending = pendingApprovals.length > 0 ? pendingApprovals[pendingApprovals.length - 1] : undefined;

  return {
    id: `copilot-${Date.now()}`,
    role: "assistant",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    content: result.text,
    suggestedActions: result.suggestedActions,
    intent: result.intent,
    toolCalls: result.toolCalls,
    findings: result.findings,
    requestId: result.requestId,
    modelUsed: result.modelUsed,
    pendingApproval: latestPending,
  };
}
