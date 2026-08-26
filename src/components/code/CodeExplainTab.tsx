import { Info, Sparkles, Repeat } from "lucide-react";
import { CodeBlock, StatusPill, Panel } from "@/components/hacksync/primitives";
import type { CodeAnalysisResult } from "@/lib/hacksync/ai-assistant";
import type { CodeNode } from "@/lib/hacksync/types";

interface CodeExplainTabProps {
  selectedNode: CodeNode | undefined;
  analysis: CodeAnalysisResult | null;
}

export function CodeExplainTab({ selectedNode, analysis }: CodeExplainTabProps) {
  return (
    <Panel className="p-5 space-y-4">
      <div>
        <span className="mono text-[10px] uppercase tracking-wider text-primary font-semibold">
          AI Code Analysis
        </span>
        <h3 className="text-base font-semibold tracking-tight">{selectedNode?.path}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {analysis?.explanation.overview ?? "Analyzing file architecture and logic patterns..."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3.5">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Info className="size-3.5 text-primary" /> Architectural Role
        </h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {analysis?.explanation.architectureRole ?? "Module contributes to shared application state and domain execution."}
        </p>
      </div>

      {/* Construct Insights & Why Loops Were Used */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" /> Syntax & Construct Rationale
        </h4>

        {analysis?.explanation.constructInsights &&
        analysis.explanation.constructInsights.length > 0 ? (
          analysis.explanation.constructInsights.map((ci, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border bg-surface p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">{ci.construct}</span>
                <StatusPill tone="primary">Construct Analysis</StatusPill>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Why used:</strong> {ci.whyUsed}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Alternative options:</strong> {ci.alternatives}
              </p>

              {ci.transformationGuide ? (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                    <Repeat className="size-3" />
                    Transform to: {ci.transformationGuide.targetConstruct}
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    {ci.transformationGuide.explanation}
                  </p>
                  <CodeBlock
                    code={ci.transformationGuide.convertedSnippet}
                    language="typescript"
                    maxHeight="160px"
                  />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            This file uses standard declarative module exports without complex loop branching.
          </p>
        )}
      </div>
    </Panel>
  );
}
