import { Zap, Repeat } from "lucide-react";
import { CodeBlock, StatusPill, Panel } from "@/components/hacksync/primitives";
import type { CodeAnalysisResult } from "@/lib/hacksync/ai-assistant";

interface CodeOptimizeTabProps {
  analysis: CodeAnalysisResult | null;
}

export function CodeOptimizeTab({ analysis }: CodeOptimizeTabProps) {
  const optimizations = analysis?.optimizations ?? [];

  return (
    <Panel className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          Code Optimizations & Loop Refactors
        </h3>
        <p className="text-xs text-muted-foreground">
          Algorithmic performance enhancements, loop optimizations, and React memoization strategies.
        </p>
      </div>

      {/* Loop transformation box */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Repeat className="size-3.5" /> For Loop ↔ While Loop Conversion Guide
          </span>
          <StatusPill tone="primary">Loop Tutor</StatusPill>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Need to rewrite a <code>for</code> loop to a <code>while</code> loop or vice versa? Here is the exact structural conversion recipe:
        </p>
        <CodeBlock
          code={`// 1. FOR LOOP (Standard counter)
for (let i = 0; i < list.length; i++) {
  doWork(list[i]);
}

// 2. TRANSFORMED TO WHILE LOOP (With invariant safety)
let i = 0;
while (i < list.length) {
  doWork(list[i]);
  i++;
}`}
          language="typescript"
          maxHeight="160px"
        />
      </div>

      {optimizations.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-center">
          <p className="text-xs font-medium text-foreground">Code is cleanly structured</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            No redundant computations or unnecessary re-renders detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {optimizations.map((opt) => (
            <div
              key={opt.id}
              className="rounded-lg border border-border bg-surface p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">{opt.title}</h4>
                <StatusPill tone="neutral">Optimization</StatusPill>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{opt.benefit}</p>
              <div className="rounded-md border border-border bg-background p-2.5 text-xs text-muted-foreground">
                <strong>Refactoring advice:</strong> {opt.promptToRefactor}
              </div>
              {opt.afterSnippet && (
                <div>
                  <span className="text-[11px] font-semibold text-foreground mb-1 block">
                    Optimized Implementation:
                  </span>
                  <CodeBlock
                    code={opt.afterSnippet}
                    language="typescript"
                    maxHeight="140px"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
