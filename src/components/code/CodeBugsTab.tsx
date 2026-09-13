import { useState } from "react";
import { Bug, Check, Sparkles, Wrench } from "lucide-react";
import { CodeBlock, StatusPill, Panel } from "@/components/hacksync/primitives";
import type { CodeAnalysisResult, CodeBug } from "@/lib/hacksync/ai-assistant";

interface CodeBugsTabProps {
  analysis: CodeAnalysisResult | null;
}

export function CodeBugsTab({ analysis }: CodeBugsTabProps) {
  const bugs = analysis?.bugs ?? [];
  const [copiedBugId, setCopiedBugId] = useState<string | null>(null);

  const handleGeneratePrompt = (bug: CodeBug) => {
    const prompt = `ROLE:
You are a senior full-stack software engineer.

TASK:
Fix the following bug in the HackSync workspace code.

BUG DETAILS:
- Title: ${bug.title}
- Line: ${bug.line}
- Category: ${bug.category}
- Severity: ${bug.severity.toUpperCase()}
${bug.snippet ? `- Code Snippet:\n\`\`\`typescript\n${bug.snippet}\n\`\`\`` : ""}

DESCRIPTION:
${bug.description}

DEBUGGING GUIDE:
${bug.debuggingGuide}

SUGGESTED FIX:
\`\`\`typescript
${bug.suggestedFix}
\`\`\`

REQUIREMENTS:
1. Fix the bug while preserving existing functionality and API signatures.
2. Include defensive checks against undefined/null.
3. Provide a unified Git diff and unit test cases verifying the fix.`;

    void navigator.clipboard.writeText(prompt);
    setCopiedBugId(bug.id);
    setTimeout(() => setCopiedBugId(null), 2500);
  };

  return (
    <Panel className="p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Bug className="size-4 text-destructive" />
            Line-by-Line Fault Diagnostics
          </h3>
          <p className="text-xs text-muted-foreground">
            Automated static analysis detecting runtime traps, async faults, and memory leaks.
          </p>
        </div>
        <StatusPill tone={bugs.length > 0 ? "danger" : "success"}>
          {bugs.length} bugs detected
        </StatusPill>
      </div>

      {bugs.length === 0 ? (
        <div className="p-8 text-center">
          <Check className="mx-auto size-7 text-success" />
          <p className="mt-2 text-xs font-semibold text-foreground">
            Zero code faults found
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            No unhandled promises, state mutations, or infinite loop traps were identified in this file.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bugs.map((bug) => (
            <div
              key={bug.id}
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="mono rounded bg-destructive/20 px-1.5 py-0.5 text-xs font-bold text-destructive">
                    Line {bug.line}
                  </span>
                  <h4 className="text-xs font-semibold text-foreground">{bug.title}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGeneratePrompt(bug)}
                    className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                    title="Copy structured senior engineer prompt to clipboard"
                  >
                    {copiedBugId === bug.id ? (
                      <>
                        <Check className="size-3 text-success" />
                        <span className="text-success">Prompt Copied!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3" />
                        <span>Generate Agent Prompt</span>
                      </>
                    )}
                  </button>
                  <StatusPill tone="danger">{bug.category}</StatusPill>
                </div>
              </div>

              {bug.snippet ? (
                <div className="mono rounded bg-background p-2 text-xs text-destructive border border-border">
                  {bug.snippet}
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground leading-relaxed">
                {bug.description}
              </p>

              <div className="rounded-md border border-border bg-background p-3 text-xs space-y-1.5">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Wrench className="size-3 text-primary" /> Step-by-Step Debugging Guide:
                </span>
                <div className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed">
                  {bug.debuggingGuide}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-foreground mb-1 block">
                  Suggested Fix:
                </span>
                <CodeBlock
                  code={bug.suggestedFix}
                  language="typescript"
                  maxHeight="150px"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
