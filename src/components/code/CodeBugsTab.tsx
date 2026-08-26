import { Bug, Check, Wrench } from "lucide-react";
import { CodeBlock, StatusPill, Panel } from "@/components/hacksync/primitives";
import type { CodeAnalysisResult } from "@/lib/hacksync/ai-assistant";

interface CodeBugsTabProps {
  analysis: CodeAnalysisResult | null;
}

export function CodeBugsTab({ analysis }: CodeBugsTabProps) {
  const bugs = analysis?.bugs ?? [];

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="mono rounded bg-destructive/20 px-1.5 py-0.5 text-xs font-bold text-destructive">
                    Line {bug.line}
                  </span>
                  <h4 className="text-xs font-semibold text-foreground">{bug.title}</h4>
                </div>
                <StatusPill tone="danger">{bug.category}</StatusPill>
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
