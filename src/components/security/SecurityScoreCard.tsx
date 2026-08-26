import { Shield, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import type { SecurityAuditResult } from "@/lib/hacksync/ai-security";

interface SecurityScoreCardProps {
  audit: SecurityAuditResult;
}

export function SecurityScoreCard({ audit }: SecurityScoreCardProps) {
  const isPassing = audit.grade === "A+" || audit.grade === "A" || audit.grade === "B";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold">Security Grade</p>
          <p
            className={`text-3xl font-black mt-1 ${
              audit.grade === "A+" || audit.grade === "A"
                ? "text-success"
                : audit.grade === "B"
                  ? "text-primary"
                  : "text-destructive"
            }`}
          >
            Grade {audit.grade}
          </p>
        </div>
        <div
          className={`grid size-12 place-items-center rounded-xl ${
            isPassing ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}
        >
          {isPassing ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold">Hardening Score</p>
          <p className="text-3xl font-black mt-1 text-foreground">{audit.score}/100</p>
        </div>
        <Shield className="size-8 text-primary opacity-60" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold">Critical Vulnerabilities</p>
          <p
            className={`text-3xl font-black mt-1 ${
              audit.summary.critical > 0 ? "text-destructive" : "text-success"
            }`}
          >
            {audit.summary.critical}
          </p>
        </div>
        <AlertTriangle
          className={`size-8 ${audit.summary.critical > 0 ? "text-destructive" : "text-success"}`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold">Total Vulnerabilities</p>
          <p className="text-3xl font-black mt-1 text-foreground">{audit.vulnerabilities.length}</p>
        </div>
        <Shield className="size-8 text-muted-foreground opacity-40" />
      </div>
    </div>
  );
}
