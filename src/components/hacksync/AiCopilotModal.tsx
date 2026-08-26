import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RotateCcw,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/lib/hacksync/workspace";
import { askWorkspaceCopilot, type CopilotMessage } from "@/lib/hacksync/ai-assistant";
import {
  DEFAULT_AI_SETTINGS,
  type AISettings,
  type LLMProviderType,
} from "@/lib/hacksync/llm-provider";
import { cn } from "@/lib/utils";

const PRESET_PROMPTS = [
  {
    icon: Shield,
    label: "Cyber Security Audit",
    prompt: "Perform a full cyber security audit on our workspace contracts and database schema.",
  },
  {
    icon: Sparkles,
    label: "For vs While Loops",
    prompt:
      "Why did we use a for loop instead of a while loop in our code, and how do I convert it to a while loop?",
  },
  {
    icon: Terminal,
    label: "API Contracts & SDK",
    prompt: "Show me all API contracts and generate a type-safe TypeScript client snippet.",
  },
  {
    icon: Zap,
    label: "Async Bugs & Performance",
    prompt: "Analyze our workspace for floating unhandled promises and suggest optimizations.",
  },
];

export function AiCopilotModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: ws } = useWorkspace();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [tempProvider, setTempProvider] = useState<LLMProviderType>("builtin");
  const [tempModel, setTempModel] = useState("gemini-2.0-flash");

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `👋 **Hi! I am your HackSync AI Code Intelligence & Cyber Security Copilot.**

I have direct access to your repository structure, database schema, and live integration state. Ask me to:
- 🛡️ Run cyber security audits & find vulnerabilities
- 🐛 Detect bugs in specific files with debugging steps
- 🔄 Explain code constructs (e.g. why \`for\` vs \`while\` loop) & transform syntax
- ⚡ Suggest code optimizations & performance improvements
- 💬 Answer any custom programming, architecture, or algorithmic question!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  if (!isOpen) return null;

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
      const response = await askWorkspaceCopilot(text, ws ?? null, null, newHistory);
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
              onClick={() => {
                setTempProvider(settings.provider);
                setTempModel(settings.model ?? "gemini-2.0-flash");
                setShowSettings(!showSettings);
              }}
              title="Select AI Model"
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                showSettings
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">Model</span>
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
          <div className="border-b border-border bg-muted/90 p-4 text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-primary" /> AI Model Selection (Server-Secured)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Rate-limited server gateway
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-2.5 transition-all text-left",
                  tempProvider === "builtin"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  className="sr-only"
                  checked={tempProvider === "builtin"}
                  onChange={() => setTempProvider("builtin")}
                />
                <div className="font-semibold">⚡ Built-in Expert</div>
                <p className="text-[10px] opacity-80 mt-0.5">
                  100% Offline & Private Deep Reasoning Engine
                </p>
              </label>

              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-2.5 transition-all text-left",
                  tempProvider === "gemini"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  className="sr-only"
                  checked={tempProvider === "gemini"}
                  onChange={() => {
                    setTempProvider("gemini");
                    setTempModel("gemini-2.0-flash");
                  }}
                />
                <div className="font-semibold">✨ Google Gemini</div>
                <p className="text-[10px] opacity-80 mt-0.5">Server Gateway (Gemini 2.0 Flash)</p>
              </label>

              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-2.5 transition-all text-left",
                  tempProvider === "openai"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  className="sr-only"
                  checked={tempProvider === "openai"}
                  onChange={() => {
                    setTempProvider("openai");
                    setTempModel("gpt-4o-mini");
                  }}
                />
                <div className="font-semibold">🤖 OpenAI GPT-4o</div>
                <p className="text-[10px] opacity-80 mt-0.5">Server Gateway (GPT-4o Mini)</p>
              </label>
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
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/40 px-4 py-2 shrink-0">
          {PRESET_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(p.prompt)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Bot className="size-4" />
                </span>
              ) : null}
              <div
                className={cn(
                  "max-w-[88%] sm:max-w-[82%] rounded-xl p-4 leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "border border-border bg-surface text-foreground shadow-sm",
                )}
              >
                <MarkdownContent content={m.content} />
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
              placeholder="Ask anything about your code, bugs, loops, cyber security, architecture, or any programming topic..."
              className="flex-1 rounded-lg border border-input bg-background px-3.5 py-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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

        return (
          <div
            key={idx}
            className="whitespace-pre-wrap leading-relaxed [&_h3]:font-bold [&_h3]:text-sm [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:font-semibold [&_h4]:text-xs [&_h4]:mt-1.5 [&_h4]:mb-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
          >
            {part}
          </div>
        );
      })}
    </div>
  );
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
