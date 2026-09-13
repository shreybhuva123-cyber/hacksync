import { useState, useRef, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  GitBranch,
  KeyRound,
  Loader2,
  RotateCcw,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";
import { askWorkspaceCopilot, type CopilotMessage } from "@/lib/hacksync/ai-assistant";
import {
  DEFAULT_AI_SETTINGS,
  type AISettings,
  type LLMProviderType,
} from "@/lib/hacksync/llm-provider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ProjectHealthCalculator } from "@/lib/hacksync/security/health-score";
import { AIEvaluator } from "@/lib/hacksync/evaluation/evaluator";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";

const PRESET_PROMPTS = [
  {
    icon: Shield,
    label: "Auth & SQLi Audit",
    prompt: "Find authentication vulnerabilities and SQL injection risks in our workspace.",
  },
  {
    icon: Zap,
    label: "Debug Login 500",
    prompt: "Why does my login API return 500 or fail unexpectedly?",
  },
  {
    icon: GitBranch,
    label: "Review Recent Changes",
    prompt: "Review my recent workspace changes for regressions and vulnerabilities.",
  },
  {
    icon: Activity,
    label: "Calculate Health Score",
    prompt: "Calculate our project health score with 5-factor quality breakdown.",
  },
  {
    icon: Sparkles,
    label: "Run AI Benchmark",
    prompt: "Run AI quality evaluation benchmark (BM-1 to BM-7) on our engineering agent.",
  },
  {
    icon: Terminal,
    label: "API Contracts & SDK",
    prompt: "Show me all API contracts and generate a type-safe TypeScript client snippet.",
  },
];

export function AiCopilotModal({
  isOpen,
  onClose,
  workspace,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspace?: Workspace | null | undefined;
}) {
  const { data: hookWs } = useWorkspace();
  const ws = workspace ?? hookWs;
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [tempProvider, setTempProvider] = useState<LLMProviderType>("builtin");
  const [tempModel, setTempModel] = useState<string>("gemini-2.0-flash");

  // Proactively purge legacy keys from browser storage to ensure security compliance
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("hacksync_gemini_key");
      localStorage.removeItem("hacksync_openai_key");
    }
  }, []);

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `**HackSync Engineering Intelligence Copilot**

Direct index of repository AST symbols, API contracts, PostgreSQL schemas, and security rules.
- **Audit**: Detect vulnerabilities, hardcoded secrets, and SQL injection paths
- **Analyze**: Explain call hierarchies, AST dependencies, and cross-file callers
- **Remediate**: Generate scoped fix proposals with minimal unified diffs
- **Verify**: Formulate targeted unit and integration test plans with 0 regressions`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [copiedPromptBanner, setCopiedPromptBanner] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 100);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleResolveApproval = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!ws?.project?.id) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: `auth-err-${Date.now()}`,
            role: "assistant",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            content: "🔒 **Authentication Required**: Please sign in to resolve AI approval requests.",
            intent: "fix",
          },
        ]);
        return;
      }

      const response = await fetch("/api/ai/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId,
          decision,
          projectId: ws.project.id,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            content: `⚠️ **Approval Failed**: ${errData?.error?.message || "Server rejected approval resolution."}`,
            intent: "fix",
          },
        ]);
        return;
      }

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.pendingApproval?.id === approvalId) {
            return {
              ...msg,
              pendingApproval: {
                ...msg.pendingApproval,
                status: decision,
              },
            };
          }
          return msg;
        }),
      );

      const confirmationText =
        decision === "approved"
          ? `✅ **Approval Confirmed**: User explicitly authorized mutating tool execution. Modifications applied.`
          : `🛑 **Approval Denied**: Mutating tool execution was rejected by user. Workspace files remain untouched.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `resolution-${Date.now()}`,
          role: "assistant",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          content: confirmationText,
          intent: "fix",
        },
      ]);
    } catch (err: unknown) {
      console.error("Failed to resolve approval", err);
    }
  };

  const handleActionClick = (action: string, payload?: unknown) => {
    if (action === "fix_plan") {
      void handleSend("Generate a step-by-step fix plan with unified diff for the identified issue.");
    } else if (action === "generate_tests") {
      void handleSend("Generate automated unit tests verifying the fix and checking edge cases.");
    } else if (action === "security_audit") {
      void handleSend("Perform a comprehensive passive cyber security audit on all workspace files.");
    } else if (action === "health_score") {
      void handleSend("Calculate our project health score with 5-factor quality breakdown.");
    } else if (action === "agent_prompt") {
      const bugId = (payload as { bugId?: string } | undefined)?.bugId;
      const prompt = `ROLE:
You are a senior full-stack software engineer.

TASK:
Fix the identified code defect in HackSync Workspace (${ws?.project.name ?? "Project"})${bugId ? ` (Finding ID: ${bugId})` : ""}.

REQUIREMENTS:
1. Handle null/undefined checks defensively before accessing properties.
2. Return safe HTTP status codes without leaking stack traces.
3. Preserve existing API response contracts and database behaviors.
4. Provide a unified Git diff and unit test cases verifying the fix.`;

      void navigator.clipboard.writeText(prompt);
      setCopiedPromptBanner("Senior Engineer prompt copied to clipboard! Paste directly into your coding AI.");
      setTimeout(() => setCopiedPromptBanner(null), 3500);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input.trim();
    if (!text || isThinking) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: text,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setIsThinking(true);

    try {
      if (text.toLowerCase().includes("benchmark") || text.toLowerCase().includes("evaluation")) {
        const report = await AIEvaluator.runBenchmark(ws ?? null);
        setMessages((prev) => [
          ...prev,
          {
            id: `eval-${Date.now()}`,
            role: "assistant",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            content: report.summaryMarkdown,
            intent: "testing",
            modelUsed: "builtin",
            toolCalls: [
              {
                name: "benchmark_runner",
                success: true,
                summary: `Evaluated ${report.results.length} cases • Score: ${report.metrics.overallScore}% • Intent Acc: ${report.metrics.intentAccuracy}%`,
              },
            ],
            suggestedActions: [
              { label: "🛡️ Passive Security Audit", action: "security_audit" },
              { label: "📊 Recalculate Health Score", action: "health_score" },
            ],
          },
        ]);
        return;
      }

      if (text.toLowerCase().includes("health score")) {
        const health = ProjectHealthCalculator.calculate(new ProjectKnowledgeGraph(), ws ?? null);
        const healthMarkdown = `### 🏥 HackSync Project Health Score: ${health.overallScore}/100 (Grade: ${health.letterGrade})

| Factor | Weight | Score | Evaluation Target |
| :--- | :--- | :--- | :--- |
| **Cyber Security** | 30% | **${health.securityScore}%** | Static AST vulnerabilities & secret exposure |
| **Code Quality** | 20% | **${health.codeQualityScore}%** | Null-safety, syntax traps, logic faults |
| **Testing Coverage** | 20% | **${health.testingScore}%** | Contract & unit test verification status |
| **Performance** | 15% | **${health.performanceScore}%** | Unhandled promises & loop efficiency |
| **Dependencies** | 15% | **${health.dependenciesScore}%** | Unpinned versions & GHSA advisories |

> ⚠️ **Disclaimer**: *${health.disclaimer}*`;

        setMessages((prev) => [
          ...prev,
          {
            id: `health-${Date.now()}`,
            role: "assistant",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            content: healthMarkdown,
            intent: "architecture",
            modelUsed: "builtin",
            toolCalls: [
              {
                name: "project_health_calculator",
                success: true,
                summary: `Grade: ${health.letterGrade} (${health.overallScore}%) based on 5 weighted pillars`,
              },
            ],
            suggestedActions: [
              { label: "🛡️ Security Audit", action: "security_audit" },
              { label: "🧪 Generate Tests", action: "generate_tests" },
            ],
          },
        ]);
        return;
      }

      const response = await askWorkspaceCopilot(
        text,
        ws ?? null,
        null,
        newHistory,
        undefined,
        settings.provider,
      );
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          content:
            "❌ Sorry, I encountered an issue analyzing your request. Please check your network connection or try the built-in Deep Reasoning Engine.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSaveSettings = () => {
    setSettings({
      provider: tempProvider,
      model: tempModel,
      temperature: 0.7,
    });
    setShowSettings(false);
  };

  const clearChat = () => {
    setMessages([
      {
        id: `reset-${Date.now()}`,
        role: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: "🧹 Conversation cleared. Ask me any question about your code or architecture!",
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 sm:p-4 backdrop-blur-sm">
      <div
        className="relative flex h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:px-5 bg-surface">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">HackSync AI Copilot</h3>
                <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                  {settings.provider === "gemini"
                    ? "GEMINI 2.0"
                    : settings.provider === "openai"
                      ? "OPENAI"
                      : "DEEP REASONING"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Connected to {ws?.project.name ?? "Workspace"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="model-selector-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTempProvider(settings.provider);
                setTempModel(settings.model ?? "gemini-2.0-flash");
                setShowSettings((prev) => !prev);
              }}
              title="Select AI Model"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors shadow-sm cursor-pointer",
                showSettings
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-accent hover:text-primary",
              )}
            >
              <Settings2 className="size-3.5" />
              <span>Model</span>
            </button>

            <button
              type="button"
              onClick={clearChat}
              title="Clear chat history"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* AI Provider Settings Popover Drawer */}
        {showSettings ? (
          <div className="border-b border-border bg-muted/95 p-4 text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-primary" /> AI Model Selection & Engine
              </span>
              <span className="text-[11px] text-muted-foreground">
                Select provider or enter API key
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setTempProvider("builtin")}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-all text-left flex flex-col justify-between",
                  tempProvider === "builtin"
                    ? "border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                  ⚡ Built-in Expert
                </div>
                <p className="text-[10px] opacity-80 mt-1">
                  100% Offline & Private Deep Reasoning Engine
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTempProvider("gemini");
                  setTempModel("gemini-2.0-flash");
                }}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-all text-left flex flex-col justify-between",
                  tempProvider === "gemini"
                    ? "border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                  ✨ Google Gemini
                </div>
                <p className="text-[10px] opacity-80 mt-1">Gemini 2.0 Flash (Fast Reasoning)</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTempProvider("openai");
                  setTempModel("gpt-4o-mini");
                }}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-all text-left flex flex-col justify-between",
                  tempProvider === "openai"
                    ? "border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                  🤖 OpenAI GPT-4o
                </div>
                <p className="text-[10px] opacity-80 mt-1">GPT-4o Mini (Advanced Coding)</p>
              </button>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1 text-xs text-muted-foreground animate-in fade-in">
              <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <span className="text-primary">🛡️</span> Server-Managed AI Gateway
              </div>
              <p className="text-[11px] leading-relaxed">
                Model credentials and API keys are securely managed on the backend server. No API keys are accepted or stored in browser storage.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Apply Model
              </button>
            </div>
          </div>
        ) : null}

        {/* Quick Preset Buttons */}
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-surface px-4 py-2 shrink-0">
          {PRESET_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(p.prompt)}
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-foreground"
            >
              <p.icon className="size-3 text-primary" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role !== "user" ? (
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[6px] bg-surface-raised border border-border text-primary">
                  <Bot className="size-4" />
                </span>
              ) : null}
              <div
                className={cn(
                  "max-w-[88%] sm:max-w-[82%] rounded-[8px] p-4 leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "border border-border bg-surface text-foreground shadow-sm",
                )}
              >
                {/* Assistant Capability Tag */}
                {m.role !== "user" && m.intent && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-surface-raised px-2 py-0.5 text-[10px] font-mono font-medium uppercase text-primary border border-border">
                      Capability: {m.intent}
                    </span>
                  </div>
                )}

                {/* Tool Execution Trace */}
                {m.role !== "user" && m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap items-center gap-1.5 rounded-[6px] bg-surface-raised p-2 text-[10px] border border-border">
                    <span className="font-semibold text-foreground flex items-center gap-1 shrink-0">
                      <Wrench className="size-3 text-primary" /> Tools:
                    </span>
                    {m.toolCalls.map((t, tidx) => (
                      <span
                        key={tidx}
                        className="rounded-[4px] bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border"
                        title={t.summary}
                      >
                        <span className="font-semibold text-foreground">{t.name}</span> ({t.summary})
                      </span>
                    ))}
                  </div>
                )}

                <MarkdownContent content={m.content} />

                {/* Suggested Action Buttons */}
                {m.role !== "user" && m.suggestedActions && m.suggestedActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
                    {m.suggestedActions.map((sa, sidx) => (
                      <button
                        key={sidx}
                        type="button"
                        onClick={() => handleActionClick(sa.action, sa.payload)}
                        className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        {sa.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Human-in-the-loop Approval Gate */}
                {m.role !== "user" && m.pendingApproval && (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="size-4" /> Mutating Action Approval Required
                      </span>
                      <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-amber-800 dark:text-amber-300">
                        {m.pendingApproval.status}
                      </span>
                    </div>
                    <p className="text-foreground text-[11px]">
                      The orchestrator requests permission to run{" "}
                      <code className="text-primary font-bold">{m.pendingApproval.toolName}</code>:
                    </p>
                    <div className="rounded bg-background/80 p-2 text-[11px] text-muted-foreground border border-border">
                      <p className="font-medium text-foreground">{m.pendingApproval.summary}</p>
                      <p className="mt-0.5 text-[10px]">
                        Files: {m.pendingApproval.filesAffected.join(", ")}
                      </p>
                    </div>
                    {m.pendingApproval.diffPreview && (
                      <details className="text-[10px] text-muted-foreground cursor-pointer">
                        <summary className="font-semibold text-foreground hover:underline">
                          View Diff Preview
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-2 font-mono text-[10px]">
                          {m.pendingApproval.diffPreview}
                        </pre>
                      </details>
                    )}
                    {m.pendingApproval.status === "pending" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleResolveApproval(m.pendingApproval!.id, "approved")}
                          className="flex items-center gap-1 rounded bg-success px-3 py-1 text-xs font-semibold text-success-foreground hover:opacity-90 cursor-pointer"
                        >
                          <Check className="size-3" /> Approve Action
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveApproval(m.pendingApproval!.id, "rejected")}
                          className="flex items-center gap-1 rounded bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground hover:opacity-90 cursor-pointer"
                        >
                          <X className="size-3" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <span
                  className={cn(
                    "mt-2 block text-[10px]",
                    m.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {m.timestamp}
                </span>
              </div>
            </div>
          ))}

          {isThinking ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>
                {settings.provider !== "builtin"
                  ? `Querying ${settings.provider === "gemini" ? "Google Gemini" : "OpenAI"} via Server AI Gateway...`
                  : "Analyzing full repository AST, database tables, and API contracts..."}
              </span>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        {/* Copied Banner Toast */}
        {copiedPromptBanner && (
          <div className="border-t border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-success" />
              {copiedPromptBanner}
            </span>
            <button
              type="button"
              onClick={() => setCopiedPromptBanner(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <footer className="border-t border-border bg-surface p-3 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your code, AST symbols, security vulnerabilities, or test plans..."
              className="flex-1 rounded-[6px] border border-border bg-background px-3.5 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border-strong"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="flex items-center gap-1.5 rounded-[6px] bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="size-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich Markdown & Code Block Viewer with 1-Click Copy
// ─────────────────────────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  // Parse code blocks with ```lang ... ```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5">
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const match = part.match(/^```([a-zA-Z0-9_-]*)\n([\s\S]*?)```$/);
          const lang = match?.[1] || "code";
          const code = match?.[2]?.trim() || part.slice(3, -3).trim();

          return <CodeSnippet key={idx} lang={lang} code={code} />;
        }

        return <MarkdownParagraph key={idx} text={part} />;
      })}
    </div>
  );
}

/** Renders a non-code-block markdown chunk as proper HTML elements */
function MarkdownParagraph({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // Horizontal rule
        if (/^---+$/.test(trimmed)) {
          return <hr key={i} className="border-border my-2" />;
        }

        // Headings
        if (trimmed.startsWith("#### ")) {
          return (
            <h4 key={i} className="font-semibold text-xs mt-2 mb-0.5">
              {renderInline(trimmed.slice(5))}
            </h4>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="font-bold text-sm mt-3 mb-1">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="font-bold text-base mt-3 mb-1">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }

        // Table rows
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          // Skip separator rows like |---|---|
          if (/^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(trimmed)) {
            return null;
          }
          const cells = trimmed
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          return (
            <div
              key={i}
              className="grid gap-2 text-[11px] border-b border-border/50 py-1 font-mono"
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
            >
              {cells.map((cell, ci) => (
                <span key={ci} className="truncate">
                  {renderInline(cell)}
                </span>
              ))}
            </div>
          );
        }

        // Blockquote / alerts
        if (trimmed.startsWith("> ")) {
          return (
            <div key={i} className="border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
              {renderInline(trimmed.slice(2))}
            </div>
          );
        }

        // Unordered list items
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered list items
        const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="text-primary font-semibold shrink-0">{olMatch[1]}.</span>
              <span>{renderInline(olMatch[2])}</span>
            </div>
          );
        }

        // Normal paragraph
        return (
          <p key={i}>
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/** Renders inline markdown: bold, inline code, links, italic */
function renderInline(text?: string | null): React.ReactNode {
  if (!text) return null;

  // Split on inline patterns: **bold**, `code`, [text](url), *italic*
  const parts: React.ReactNode[] = [];
  // Process segments iteratively to handle multiple inline formats
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|\$[^$]+\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      // Bold
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      // Inline code
      parts.push(
        <code
          key={`c-${match.index}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-primary border border-border/50"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      // Link [text](url)
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`l-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline hover:opacity-80"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("*") && token.endsWith("*")) {
      // Italic
      parts.push(
        <em key={`i-${match.index}`}>{token.slice(1, -1)}</em>,
      );
    } else if (token.startsWith("$") && token.endsWith("$")) {
      // Math — render as inline code for simplicity
      parts.push(
        <code key={`m-${match.index}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function CodeSnippet({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-background/90 text-left shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
        <span className="uppercase text-[10px] font-bold text-primary">{lang}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-background hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3 text-success" />
              <span className="text-success font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] font-mono text-foreground leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
