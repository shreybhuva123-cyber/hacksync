import { ShieldAlert, AlertCircle, Info, Wrench, Check, ShieldCheck } from "lucide-react";
import { CodeBlock } from "@/components/hacksync/primitives";
import type { SecurityVulnerability } from "@/lib/hacksync/ai-security";

interface SecurityFindingListProps {
  findings: SecurityVulnerability[];
  onApplyAutoPatch: (finding: SecurityVulnerability) => void;
  patchedIds: Set<string>;
}

export function SecurityFindingList({
  findings,
  onApplyAutoPatch,
  patchedIds,
}: SecurityFindingListProps) {
  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-success/30 bg-success/5 p-8 text-center space-y-2">
        <ShieldCheck className="size-10 text-success" />
        <h4 className="text-sm font-bold text-foreground">Zero Security Vulnerabilities Detected</h4>
        <p className="text-xs text-muted-foreground max-w-md">
          All API contracts require verified authentication, tables enforce primary keys, and no secret keys were detected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {findings.map((f) => {
        const isPatched = patchedIds.has(f.id);
        return (
          <div
            key={f.id}
            className={`rounded-xl border p-5 transition-all ${
              isPatched
                ? "border-success/40 bg-success/5 opacity-75"
                : f.severity === "critical"
                  ? "border-destructive/40 bg-destructive/5 shadow-sm"
                  : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                    f.severity === "critical"
                      ? "bg-destructive/20 text-destructive"
                      : "bg-amber-500/20 text-amber-500"
                  }`}
                >
                  <ShieldAlert className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-foreground">{f.title}</h4>
                    <span
                      className={`mono rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                        f.severity === "critical"
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {f.severity}
                    </span>
                    {f.owasp && <span className="mono text-[10px] text-muted-foreground">{f.owasp}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                </div>
              </div>

              <div>
                {f.autoFixable && (
                  <button
                    type="button"
                    disabled={isPatched}
                    onClick={() => onApplyAutoPatch(f)}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                      isPatched
                        ? "bg-success/20 text-success border border-success/40"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    }`}
                  >
                    {isPatched ? <Check className="size-3.5" /> : <Wrench className="size-3.5" />}
                    <span>{isPatched ? "Auto-Patched ✓" : "1-Click Auto Patch"}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface p-3.5 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-semibold text-foreground">Remediation Blueprint</span>
                <span className="mono text-[10px]">Target: {f.location.target}</span>
              </div>
              <p className="text-muted-foreground text-[11px]">{f.remediation}</p>
              {f.suggestedPatch?.replacement && (
                <CodeBlock code={f.suggestedPatch.replacement} language="typescript" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
