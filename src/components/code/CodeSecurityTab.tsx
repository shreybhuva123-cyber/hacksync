import { Shield, ShieldAlert, Check } from "lucide-react";
import { CodeBlock, StatusPill, Panel } from "@/components/hacksync/primitives";
import type { SecurityVulnerability } from "@/lib/hacksync/ai-security";

interface CodeSecurityTabProps {
  vulnerabilities: SecurityVulnerability[];
}

export function CodeSecurityTab({ vulnerabilities }: CodeSecurityTabProps) {
  return (
    <Panel className="p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            File Security & AST Vulnerability Scan
          </h3>
          <p className="text-xs text-muted-foreground">
            OWASP Top 10 vulnerabilities, unsafe SQL interpolations, secret exposure, and CORS violations.
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-destructive" />
                  <h4 className="text-xs font-semibold text-foreground">{vuln.title}</h4>
                </div>
                <StatusPill
                  tone={
                    vuln.severity === "critical"
                      ? "danger"
                      : vuln.severity === "high"
                      ? "danger"
                      : "neutral"
                  }
                >
                  {vuln.severity.toUpperCase()}
                </StatusPill>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {vuln.description}
              </p>

              {vuln.owasp_category && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">OWASP Category:</span>
                  <span className="mono rounded bg-muted px-1.5 py-0.5 font-bold text-foreground">
                    {vuln.owasp_category}
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
