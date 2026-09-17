import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  FileCode2,
  Gauge,
  GitBranch,
  ListChecks,
  Network,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { InvitationRequestsModal } from "@/components/projects/InvitationRequestsModal";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  Bar,
  Metric,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  ScoreRing,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { computeReadiness, computeWarnings } from "@/lib/hacksync/analysis";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import { detectWorkspaceConflicts } from "@/lib/hacksync/conflict-radar";
import { logActivity } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Project Overview — HackSync" },
      {
        name: "description",
        content:
          "Repository health score, security threats, test suite status, and AST code intelligence.",
      },
      { property: "og:title", content: "Project Overview — HackSync" },
      {
        property: "og:description",
        content: "Engineering dashboard with live readiness, security audits, and git intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return <WorkspaceView>{(ws) => <DashboardBody ws={ws} />}</WorkspaceView>;
}

function DashboardBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);

  const readiness = computeReadiness(ws);
  const warnings = computeWarnings(ws);
  const critical = warnings.filter((w) => w.severity === "critical");
  const openTasks = ws.tasks.filter((t) => t.status !== "done");
  const failing = ws.checks.filter((c) => c.status !== "pass");
  const conflictReport = detectWorkspaceConflicts(ws);
  const cyberAudit = useMemo(() => auditWorkspaceSecurity(ws), [ws]);
  const cyberThreatsCount = cyberAudit.summary.critical + cyberAudit.summary.high;

  // Derive current user's display name and member record
  const callerMember = ws.members.find((m) => m.user_id === user?.id);
  const isOwner = ws.project.created_by === user?.id;
  const userRole = callerMember?.role ?? (isOwner ? "owner" : "member");
  const userDisplayName: string =
    (user?.user_metadata?.["display_name"] as string | undefined) ||
    (user?.user_metadata?.["full_name"] as string | undefined) ||
    callerMember?.display_name ||
    user?.email?.split("@")[0] ||
    "Developer";

  // Pending join requests
  const pendingRequests = (ws.joinRequests || []).filter((r) => r.status === "pending");
  const canReview = userRole === "owner" || userRole === "lead" || isOwner;

  return (
    <>
      {/* User Welcome & Workspace Identity Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
            {userDisplayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground sm:text-base">
                Welcome back, {userDisplayName}!
              </h2>
              <RoleBadge role={userRole} />
            </div>
            <p className="text-xs text-muted-foreground">
              {user?.email || "Authenticated HackSync Developer"} • Workspace: {ws.project.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Invitation Requests Button */}
          <button
            type="button"
            onClick={() => setRequestsModalOpen(true)}
            className="relative flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-accent"
            title="View incoming team join requests and manage invitations"
          >
            <Clock className="size-3.5 text-primary" />
            <span>Invitation Requests</span>
            {pendingRequests.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Leader Review Alert Banner if pending requests exist */}
      {canReview && pendingRequests.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-foreground animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Users className="size-4" />
            </span>
            <div>
              <span className="font-semibold text-foreground">
                {pendingRequests.length} pending team join request{pendingRequests.length > 1 ? "s" : ""}
              </span>
              <p className="text-[11px] text-muted-foreground">
                Teammates are requesting to join this workspace. Review applicants and assign their official roles.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRequestsModalOpen(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Review Requests
          </button>
        </div>
      )}

      <PageHeader
        eyebrow="Repository Intelligence"
        title={ws.project.name}
        description={ws.project.description ?? "Engineering control center integrating AST intelligence, security audits, and verification."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRequestsModalOpen(true)}
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              <Clock className="size-3.5 text-primary" />
              <span>Invitations</span>
              {pendingRequests.length > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <Link
              to="/security"
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              <ShieldAlert className="size-3.5 text-destructive" />
              <span>Security Audit</span>
            </Link>
            <Link
              to={"/testing" as any}
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              <TestTube2 className="size-3.5 text-success" />
              <span>Targeted Tests</span>
            </Link>
            <Link
              to={"/evaluation" as any}
              className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
            >
              <Gauge className="size-3.5 text-warning" />
              <span>Model Benchmark</span>
            </Link>
            <Link
              to="/code"
              className="flex items-center gap-1.5 rounded-[6px] bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <FileCode2 className="size-3.5" />
              <span>Open Code Workspace</span>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left Column: Health Score & Repo Stats */}
        <div className="space-y-6">
          <Panel className="flex flex-col items-center gap-4 p-5">
            <ScoreRing score={readiness.score} label="Project Health Score" />
            <div className="w-full space-y-2.5">
              {readiness.factors.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">{f.label}</span>
                    <span className="mono tabular-nums text-foreground">{Math.round(f.value * 100)}%</span>
                  </div>
                  <div className="mt-1">
                    <Bar
                      value={f.value * 100}
                      tone={f.value >= 0.9 ? "success" : f.value >= 0.7 ? "warning" : "danger"}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
            <div className="w-full rounded-[6px] border border-border/80 bg-surface-raised/60 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Notice: </span>
              Internal heuristic indicator based on static analysis & AST readiness, not an industry-standard security certification or official audit.
            </div>
          </Panel>

          {/* Repository Architecture Summary */}
          <Panel className="p-4 space-y-3">
            <PanelHeader
              title="Repository Architecture"
              subtitle="Indexed AST symbols and contracts"
              icon={<Boxes className="size-4" />}
            />
            <div className="space-y-2 text-xs mono">
              <div className="flex justify-between py-1 border-b border-border text-muted-foreground">
                <span>Indexed Files:</span>
                <span className="text-foreground font-semibold">{ws.codeNodes.length} files</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border text-muted-foreground">
                <span>API Contracts:</span>
                <span className="text-foreground font-semibold">{ws.contracts.length} endpoints</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border text-muted-foreground">
                <span>PostgreSQL Tables:</span>
                <span className="text-foreground font-semibold">{ws.tables.length} tables</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Schema Version:</span>
                <span className="text-primary font-semibold">v{ws.project.schema_version}</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Column: Key Metrics, Conflict Radar & Alerts */}
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Cyber Threats"
              value={cyberThreatsCount}
              tone={cyberThreatsCount > 0 ? "danger" : "success"}
              hint={`${cyberAudit.summary.critical} critical · ${cyberAudit.summary.high} high severity`}
              icon={<ShieldAlert className="size-4" />}
            />
            <Metric
              label="Active Branches"
              value={ws.branches.length}
              hint={`${ws.branches.filter((b) => b.integration_ready).length} ready for merge`}
              icon={<GitBranch className="size-4 text-info" />}
            />
            <Metric
              label="Open Tasks"
              value={openTasks.length}
              hint={`${ws.tasks.length} tracked`}
              icon={<ListChecks className="size-4 text-muted-foreground" />}
            />
            <Metric
              label="Health Checks"
              value={`${ws.checks.filter((c) => c.status === "pass").length}/${ws.checks.length}`}
              tone={failing.length ? "warning" : "success"}
              hint={failing.length ? `${failing.length} failing checks` : "All checks passing"}
              icon={<Activity className="size-4" />}
            />
          </div>

          {/* Merge Collision Radar */}
          {conflictReport.conflicts.length > 0 ? (
            <Panel className="border-warning/30 bg-warning/5">
              <PanelHeader
                title="Cross-Branch Drift & Conflict Radar"
                subtitle="Live detection of branch and AST schema drift across team layers"
                icon={<Radio className="size-4 text-warning" />}
                actions={
                  <StatusPill tone={conflictReport.hasCritical ? "danger" : "warning"}>
                    {conflictReport.conflicts.length} active conflict{conflictReport.conflicts.length !== 1 ? "s" : ""}
                  </StatusPill>
                }
              />
              <div className="divide-y divide-border/60">
                {conflictReport.conflicts.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{c.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{c.description}</p>
                    </div>
                    <Link
                      to="/git"
                      className="shrink-0 flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Resolve in Git <ArrowRight className="size-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {/* Active Security Vulnerabilities Preview */}
          <Panel>
            <PanelHeader
              title="Active SAST Security Findings"
              subtitle="Detected vulnerabilities requiring human-in-the-loop review and fix"
              icon={<ShieldCheck className="size-4" />}
              actions={
                <Link
                  to="/security"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  View all {cyberAudit.vulnerabilities.length} findings <ArrowRight className="size-3" />
                </Link>
              }
            />
            {cyberAudit.vulnerabilities.length > 0 ? (
              <div className="divide-y divide-border">
                {cyberAudit.vulnerabilities.slice(0, 3).map((v) => (
                  <div key={v.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill
                          tone={v.severity === "critical" || v.severity === "high" ? "danger" : "warning"}
                          dot={false}
                        >
                          {v.severity.toUpperCase()}
                        </StatusPill>
                        <span className="mono text-[11px] text-muted-foreground">{v.cwe}</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-foreground">{v.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{v.description}</p>
                      <p className="mt-1 text-[11px] mono text-primary truncate">{v.location.target}</p>
                    </div>
                    <Link
                      to="/security"
                      className="shrink-0 rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors"
                    >
                      Inspect & Fix
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="size-6 text-success mx-auto mb-2" />
                No active security vulnerabilities detected. Codebase is clean.
              </div>
            )}
          </Panel>

          {/* Recent Engineering Activity */}
          <Panel>
            <PanelHeader
              title="Recent Activity Feed"
              subtitle="Audited repository commits, sync events, and security scans"
              icon={<Activity className="size-4" />}
              actions={
                <Link to="/activity" className="text-xs text-primary hover:underline font-medium">
                  Full log <ArrowRight className="size-3 inline" />
                </Link>
              }
            />
            <ul className="divide-y divide-border text-xs">
              {ws.activity.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground leading-snug">{a.message}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{a.actor ?? "Member"}</span>
                      <RoleBadge role={a.actor_role ?? "shared"} />
                    </div>
                  </div>
                  <span className="mono shrink-0 text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <InvitationRequestsModal
        isOpen={requestsModalOpen}
        onClose={() => setRequestsModalOpen(false)}
        workspace={ws}
      />
    </>
  );
}
