import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- Panel ---------------- */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="text-primary">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-primary font-medium">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground leading-relaxed sm:text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------------- Status ---------------- */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const toneClass: Record<Tone, string> = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-info/10 text-info border-info/30",
  primary: "bg-primary/10 text-primary border-primary/30",
  neutral: "bg-surface-raised text-muted-foreground border-border",
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status?.toLowerCase()) {
    case "pass":
    case "passing":
    case "healthy":
    case "live":
    case "applied":
    case "done":
    case "clean":
    case "merged":
    case "verified":
    case "none":
      return "success";
    case "warn":
    case "warning":
    case "pending":
    case "in_progress":
    case "review":
    case "untested":
    case "planned":
    case "medium":
    case "low":
      return "warning";
    case "fail":
    case "failing":
    case "broken":
    case "blocked":
    case "conflict":
    case "drifted":
    case "critical":
    case "critical_regression":
    case "regression":
    case "high":
      return "danger";
    case "info":
    case "running":
      return "info";
    default:
      return "neutral";
  }
}

export const roleClass: Record<string, string> = {
  frontend: "text-frontend border-frontend/30 bg-frontend/10",
  backend: "text-backend border-backend/30 bg-backend/10",
  database: "text-database border-database/30 bg-database/10",
  lead: "text-lead border-lead/30 bg-lead/10",
  shared: "text-muted-foreground border-border bg-surface",
};

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-medium",
        roleClass[role] ?? roleClass["shared"],
        className,
      )}
    >
      {role}
    </span>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const tone: Tone =
    method === "GET"
      ? "info"
      : method === "POST"
        ? "success"
        : method === "DELETE"
          ? "danger"
          : "warning";
  return (
    <StatusPill tone={tone} dot={false} className="rounded-[4px] px-1.5 font-semibold">
      {method}
    </StatusPill>
  );
}

/* ---------------- Metric ---------------- */

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
        {icon ? (
          <span className={cn("opacity-80", toneClass[tone].split(" ")[1])}>{icon}</span>
        ) : null}
      </div>
      <p className="mono mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

/* ---------------- Copy / code ---------------- */

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({
  code,
  language,
  filename,
  className,
  maxHeight = "20rem",
}: {
  code: string;
  language?: string | null;
  filename?: string;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[8px] border border-border bg-background", className)}>
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <span className="mono truncate text-[11px] text-muted-foreground">
          {filename ?? language ?? "snippet"}
        </span>
        <CopyButton value={code} />
      </div>
      <pre
        className="mono overflow-auto p-3 text-[12px] leading-relaxed text-foreground/90"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ---------------- States ---------------- */

export function LoadingState({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-5 animate-spin text-primary" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-[8px] border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
      {icon ? <div className="text-muted-foreground mb-1">{icon}</div> : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const isMissingTable =
    message.toLowerCase().includes("schema cache") ||
    message.toLowerCase().includes("does not exist") ||
    message.toLowerCase().includes("public.projects");

  return (
    <div className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-destructive shrink-0" />
        <p className="text-sm font-semibold text-destructive">
          {isMissingTable ? "Database Schema Initialization Required" : "Operation Error"}
        </p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {isMissingTable
          ? "Your Supabase project is connected, but the database tables have not been created yet in PostgreSQL. Run the SQL setup script in your Supabase SQL Editor to create all tables and RPC functions in 1 click."
          : message}
      </p>

      <div className="mt-4 flex items-center gap-2.5 flex-wrap">
        {isMissingTable ? (
          <a
            href="https://supabase.com/dashboard/project/qqyecjwhyjyryqykhcxa/sql"
            target="_blank"
            rel="noreferrer"
            className="rounded-[6px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
          >
            Open Supabase SQL Editor ↗
          </a>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[6px] border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Score ring ---------------- */

export function ScoreRing({
  score,
  size = 140,
  label = "Integration Readiness",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone =
    score >= 90 ? "var(--color-success)" : score >= 70 ? "var(--color-warning)" : "var(--color-destructive)";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${label}: ${score}%`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * Math.min(100, Math.max(0, score))) / 100}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono text-3xl font-semibold tabular-nums text-foreground">{score}%</span>
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase font-medium">score</span>
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export function Bar({ value, tone = "primary" }: { value: number; tone?: Tone }) {
  const bg =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-destructive"
          : "bg-primary";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", bg)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
