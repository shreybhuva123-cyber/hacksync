import { useState } from "react";
import { Shield, ShieldAlert, Check, Sparkles } from "lucide-react";
import { StatusPill, Panel } from "@/components/hacksync/primitives";
import type { SecurityVulnerability } from "@/lib/hacksync/ai-security";

interface CodeSecurityTabProps {
  vulnerabilities: SecurityVulnerability[];
}

export function CodeSecurityTab({ vulnerabilities }: CodeSecurityTabProps) {
  const [copiedVulnId, setCopiedVulnId] = useState<string | null>(null);

  const handleGeneratePrompt = (vuln: SecurityVulnerability) => {
    const prompt = `ROLE:
You are a Staff Security Engineer and Full-Stack Developer.

TASK:
Remediate the following security vulnerability in the HackSync workspace code.

SECURITY ISSUE:
- Title: ${vuln.title}
- Severity: ${vuln.severity.toUpperCase()}
- Confidence: ${vuln.confidence ?? 90}%
- Target: ${vuln.location.target}${vuln.location.line ? ` (Line ${vuln.location.line})` : ""}
${vuln.owasp ? `- OWASP: ${vuln.owasp}` : ""}
${vuln.cwe ? `- CWE: ${vuln.cwe}` : ""}

DESCRIPTION:
${vuln.description}

IMPACT:
${vuln.impact}

REMEDIATION:
${vuln.remediation}
${vuln.suggestedPatch ? `\nSUGGESTED PATCH:\n\`\`\`\n${vuln.suggestedPatch.replacement}\n\`\`\`` : ""}

REQUIREMENTS:
1. Apply the remediation without introducing regressions.
2. Defensively sanitize inputs and isolate sensitive data.
3. Provide unified diff and automated test cases.`;

    void navigator.clipboard.writeText(prompt);
    setCopiedVulnId(vuln.id);
    setTimeout(() => setCopiedVulnId(null), 2500);
  };

  return (
    <Panel className="p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            File Security & AST Vulnerability Scan
          </h3>
          <p className="text-xs text-muted-foreground">
            Dual-dimension audit separating Severity (impact) from Confidence (certainty).
          </p>
        </div>
        <StatusPill tone={vulnerabilities.length > 0 ? "danger" : "success"}>
          {vulnerabilities.length} security flags
        </StatusPill>
      </div>

      {vulnerabilities.length === 0 ? (
        <div className="p-8 text-center">
          <Check className="mx-auto size-7 text-success" />
          <p className="mt-2 text-xs font-semibold text-foreground">
            No Security Vulnerabilities Detected
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This module complies with HackSync cyber security baseline rules.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {vulnerabilities.map((vuln) => (
            <div
              key={vuln.id}
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-destructive" />
                  <h4 className="text-xs font-semibold text-foreground">{vuln.title}</h4>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleGeneratePrompt(vuln)}
                    className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                    title="Copy senior security engineer prompt to clipboard"
                  >
                    {copiedVulnId === vuln.id ? (
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
                  <StatusPill
                    tone={
                      vuln.severity === "critical" || vuln.severity === "high"
                        ? "danger"
                        : "neutral"
                    }
                  >
                    {vuln.severity.toUpperCase()}
                  </StatusPill>
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                    {vuln.confidence ?? 90}% CONFIDENCE
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {vuln.description}
              </p>

              {vuln.owasp && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">OWASP Category:</span>
                  <span className="mono rounded bg-muted px-1.5 py-0.5 font-bold text-foreground">
                    {vuln.owasp}
                  </span>
                </div>
              )}

              {vuln.remediation && (
                <div className="rounded-md border border-border bg-background p-3 text-xs space-y-1">
                  <span className="font-semibold text-foreground">Remediation Guide:</span>
                  <p className="text-[11px] text-muted-foreground">{vuln.remediation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
