import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Activity,
  GitBranch,
  ListChecks,
  Radio,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
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
import { detectWorkspaceConflicts } from "@/lib/hacksync/conflict-radar";
import { logActivity } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Team Workspace — HackSync" },
      {
        name: "description",
        content:
          "Live integration readiness, team presence, blockers and activity for your hackathon project.",
      },
      { property: "og:title", content: "Team Workspace — HackSync" },
      {
        property: "og:description",
        content: "Live integration readiness for your hackathon team.",
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
  const [isSimulating, setIsSimulating] = useState(false);

  const readiness = computeReadiness(ws);
  const warnings = computeWarnings(ws);
  const critical = warnings.filter((w) => w.severity === "critical");
  const openTasks = ws.tasks.filter((t) => t.status !== "done");
  const failing = ws.checks.filter((c) => c.status !== "pass");
  const conflictReport = detectWorkspaceConflicts(ws);

  const handleSimulateSync = async () => {
    setIsSimulating(true);
    await logActivity(
      ws.project.id,
      "sync",
      "Live Stress Test: Synchronized 14 API contracts with PostgreSQL schema version " +
        ws.project.schema_version,
      "Simulation Bot",
      "lead",
    );
    setTimeout(() => {
      setIsSimulating(false);
    }, 600);
  };

  return (
    <>
      <PageHeader
        eyebrow="team workspace"
        title={ws.project.name}
        description={ws.project.description ?? "Shared integration control center."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/pitch"
              className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Trophy className="size-3.5" />
              Judge Pitch Mode
            </Link>
            <button
              type="button"
              onClick={handleSimulateSync}
              disabled={isSimulating}
              className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent disabled:opacity-60"
            >
              <Radio className={`size-3.5 text-primary ${isSimulating ? "animate-pulse" : ""}`} />
              {isSimulating ? "Syncing..." : "Simulate Team Sync"}
            </button>
            <Link
              to="/predemo"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Pre-Demo Mode
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel className="flex flex-col items-center gap-4 p-5">
          <ScoreRing score={readiness.score} />
          <div className="w-full space-y-2.5">
            {readiness.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="mono tabular-nums">{Math.round(f.value * 100)}%</span>
                </div>
                <div className="mt-1">
                  <Bar
                    value={f.value * 100}
                    tone={f.value >= 0.9 ? "success" : f.value >= 0.6 ? "warning" : "danger"}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Critical alerts"
              value={critical.length}
              tone={critical.length ? "danger" : "success"}
              hint="Route / Schema / Conflict guards"
              icon={<AlertTriangle className="size-4" />}
            />
            <Metric
              label="Open tasks"
              value={openTasks.length}
              hint={`${ws.tasks.length} total`}
              icon={<ListChecks className="size-4" />}
            />
            <Metric
              label="Branches"
              value={ws.branches.length}
              hint={`${ws.branches.filter((b) => b.integration_ready).length} integration ready`}
              icon={<GitBranch className="size-4" />}
            />
            <Metric
              label="Checks failing"
              value={failing.length}
              tone={failing.length ? "warning" : "success"}
              hint={`${ws.checks.length} monitored`}
              icon={<Activity className="size-4" />}
            />
          </div>

          {/* Cross-Team Collision & Conflict Radar */}
          {conflictReport.conflicts.length > 0 ? (
            <Panel className="border-warning/30 bg-warning/5">
              <PanelHeader
                title="Cross-Team Collision Radar"
                subtitle="Live detection of branch and schema drift across team layers"
                icon={<Radio className="size-4 text-warning animate-pulse" />}
                actions={
                  <StatusPill tone={conflictReport.hasCritical ? "danger" : "warning"}>
                    {conflictReport.conflicts.length} active conflict
                    {conflictReport.conflicts.length !== 1 ? "s" : ""}{" "}
                  </StatusPill>
                }
              />
              <ul className="divide-y divide-border">
                {conflictReport.conflicts.map((c) => (
                  <li key={c.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusPill tone={c.severity === "critical" ? "danger" : "warning"}>
                        {c.sourceLayer} → {c.targetLayer}
                      </StatusPill>
                      <span className="font-semibold text-foreground">{c.title}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{c.description}</p>
                    <p className="text-[11px] text-primary">
                      <strong>Fix:</strong> {c.remediation}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader
              title="Team presence"
              subtitle="Who is online and what they own right now"
              icon={<Users className="size-4" />}
            />
            <ul className="divide-y divide-border">
              {ws.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span
                    className={`size-2 rounded-full ${m.online ? "bg-success" : "bg-muted-foreground"}`}
                  />
                  <span className="text-sm font-medium">{m.display_name}</span>
                  <RoleBadge role={m.role} />
                  <span className="mono truncate text-[11px] text-muted-foreground">
                    {m.working_area ?? "idle"}
                  </span>
                  <span className="mono ml-auto text-[11px] text-muted-foreground">
                    {m.branch_name}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Guards & radar"
              subtitle="Route Guard · Schema Guard · Conflict Radar · Contract Lock"
              icon={<AlertTriangle className="size-4" />}
              actions={
                <StatusPill tone={critical.length ? "danger" : "success"}>
                  {warnings.length} findings
                </StatusPill>
              }
            />
            <ul className="divide-y divide-border">
              {warnings.slice(0, 6).map((w) => (
                <li key={w.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={
                        w.severity === "critical"
                          ? "danger"
                          : w.severity === "warning"
                            ? "warning"
                            : "info"
                      }
                    >
                      {w.source}
                    </StatusPill>
                    <span className="text-xs font-medium">{w.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{w.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Latest activity" icon={<Activity className="size-4" />} />
            <ul className="divide-y divide-border">
              {ws.activity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                  <StatusPill tone={statusTone(a.kind)} dot={false}>
                    {a.kind}
                  </StatusPill>
                  <span className="truncate text-xs">{a.message}</span>
                  <span className="mono ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {a.actor}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
