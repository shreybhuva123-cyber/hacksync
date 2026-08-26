import { useState } from "react";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";
import { Panel } from "@/components/hacksync/primitives";
import type { CodeNode } from "@/lib/hacksync/types";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  time: string;
}

interface CodeChatTabProps {
  selectedNode: CodeNode | undefined;
  chatHistory: ChatMessage[];
  isAiLoading: boolean;
  onSendChat: (prompt: string) => void;
}

export function CodeChatTab({
  selectedNode,
  chatHistory,
  isAiLoading,
  onSendChat,
}: CodeChatTabProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isAiLoading) return;
    const text = prompt.trim();
    setPrompt("");
    onSendChat(text);
  };

  const handleQuickPrompt = (q: string) => {
    if (isAiLoading) return;
    onSendChat(q);
  };

  return (
    <Panel className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          Interactive Code Intelligence Assistant
        </h3>
        <p className="text-xs text-muted-foreground">
          Ask questions about {selectedNode?.path ?? "this file"}, convert loops, or request debugging advice.
        </p>
      </div>

      {/* Preset prompt pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleQuickPrompt("Why was this loop construct used and how do I convert it?")}
          disabled={isAiLoading}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          🔄 Loop Construct Rationale
        </button>
        <button
          type="button"
          onClick={() => handleQuickPrompt("Explain the architectural purpose of this file.")}
          disabled={isAiLoading}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          🏛️ Architectural Purpose
        </button>
        <button
          type="button"
          onClick={() => handleQuickPrompt("Are there any cyber security risks in this file?")}
          disabled={isAiLoading}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          🛡️ Security Scan
        </button>
      </div>

      {/* Chat messages log */}
      <div className="max-h-[350px] min-h-[160px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-3">
        {chatHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Sparkles className="mx-auto size-5 text-primary/60 mb-1" />
            <span>Ask anything about this file to start the conversation.</span>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-surface border border-border text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
              <span className="text-[10px] text-muted-foreground px-1 mt-0.5">{msg.time}</span>
            </div>
          ))
        )}

        {isAiLoading && (
          <div className="flex items-center gap-2 text-xs text-primary font-medium p-2">
            <Loader2 className="size-3.5 animate-spin" />
            <span>AI Copilot is reasoning...</span>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Ask AI about ${selectedNode?.path ?? "this file"}...`}
          disabled={isAiLoading}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || isAiLoading}
          className="flex items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
        >
          {isAiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          <span>Ask</span>
        </button>
      </form>
    </Panel>
  );
}
