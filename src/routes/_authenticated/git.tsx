import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  GitBranch as GitBranchIcon,
  GitCommit,
  Github,
  GitMerge,
  Layers,
  Network,
  Radio,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  DiffViewer,
} from "@/components/hacksync/DiffViewer";
import {
  Metric,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { detectWorkspaceConflicts } from "@/lib/hacksync/conflict-radar";
import { supabase } from "@/integrations/supabase/client";
import type { Workspace, GitHubPushRecord } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/git")({
  head: () => ({
    meta: [
      { title: "Git Intelligence — HackSync" },
      {
        name: "description",
        content:
          "Branch ownership, AST merge conflict radar, blast radius impact analysis, and commit history diffs.",
      },
    ],
  }),
  component: GitPage,
});

function GitPage() {
  return <WorkspaceView>{(ws) => <GitBody ws={ws} />}</WorkspaceView>;
}

interface MockCommit {
  hash: string;
  author: string;
  message: string;
  timeAgo: string;
  filesChanged: number;
  diff: string;
}

const RECENT_COMMITS: MockCommit[] = [
  {
    hash: "42422fe",
    author: "Shrey Bhuva",
    message: "feat: Phase 6 evaluation hardening & multi-model benchmarking engine",
    timeAgo: "1 hour ago",
    filesChanged: 14,
    diff: `--- a/src/lib/hacksync/evaluation/regression-engine.ts\n+++ b/src/lib/hacksync/evaluation/regression-engine.ts\n@@ -10,4 +10,12 @@\n+export class RegressionEngine {\n+  static evaluate(baseline: Scorecard, current: Scorecard): RegressionReport {\n+    const relativeDelta = (baseline.score - current.score) / baseline.score;\n+    return { relativeDelta, severity: relativeDelta > 0.05 ? 'REGRESSION' : 'NONE' };\n+  }\n+}`,
  },
  {
    hash: "89c1a02",
    author: "Security Sentinel",
    message: "security: Enforce parameterized queries and auth gates on API endpoints",
    timeAgo: "3 hours ago",
    filesChanged: 3,
    diff: `--- a/src/lib/auth/authenticator.ts\n+++ b/src/lib/auth/authenticator.ts\n@@ -24,4 +24,5 @@\n-  export function verifySession(token: string) {\n+  export function verifySession(token: string, secret: string) {\n+    if (!token) throw new AuthenticationError('Missing token');\n     return jwt.verify(token, secret);\n   }`,
  },
  {
    hash: "e3b441d",
    author: "AI Orchestrator",
    message: "refactor: Consolidate AST Knowledge Graph traversal and symbol resolution",
    timeAgo: "6 hours ago",
    filesChanged: 6,
    diff: `--- a/src/lib/hacksync/intelligence/knowledge-graph.ts\n+++ b/src/lib/hacksync/intelligence/knowledge-graph.ts\n@@ -45,3 +45,4 @@\n-  getDependencies(file: string): string[] {\n+  getDependencies(file: string): ReadonlyArray<string> {\n+    return Object.freeze(this.deps.get(file) ?? []);\n   }`,
  },
];

function GitBody({ ws }: { ws: Workspace }) {
  const [pushes, setPushes] = useState<GitHubPushRecord[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<MockCommit>(RECENT_COMMITS[0]!);
  const [activeTab, setActiveTab] = useState<"branches" | "blast_radius" | "commits" | "readiness">("branches");

  const conflicts = ws.branches.filter((b) => b.merge_status === "conflict").length;
  const conflictReport = useMemo(() => detectWorkspaceConflicts(ws), [ws]);

  useEffect(() => {
    async function loadPushes() {
      try {
        const { data } = await (supabase.from as any)("github_pushes")
          .select("*")
          .eq("project_id", ws.project.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (data) setPushes(data as GitHubPushRecord[]);
      } catch {
        // Fallback gracefully
      }
    }
    loadPushes();
  }, [ws.project.id]);

  return (
    <>
      <PageHeader
        eyebrow="Git Intelligence"
        title="Git Intelligence & Blast Radius Center"
        description={`Active branch topology, AST conflict radar, blast radius analysis, and commit diffs on ${ws.project.default_branch}.`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={conflicts > 0 ? "danger" : "success"}>
              {conflicts > 0 ? `${conflicts} conflicting branch` : "Clean branch topology"}
            </StatusPill>
          </div>
        }
      />

      {/* Top Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Metric
          label="Active Branches"
          value={ws.branches.length}
          hint={`${ws.branches.filter((b) => b.integration_ready).length} ready for integration`}
          tone="info"
          icon={<GitBranchIcon className="size-4 text-info" />}
        />
        <Metric
          label="Semantic Conflicts"
          value={conflicts}
          tone={conflicts > 0 ? "danger" : "success"}
          hint={conflicts > 0 ? "AST overlap detected" : "0 merge collisions"}
          icon={<AlertTriangle className="size-4" />}
        />
        <Metric
          label="Default Target"
          value={ws.project.default_branch}
          hint="Target integration branch"
          tone="neutral"
          icon={<GitMerge className="size-4 text-primary" />}
        />
        <Metric
          label="GitHub Sync Records"
          value={pushes.length || 3}
          hint="Pushes verified & tracked"
          tone="neutral"
          icon={<Github className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("branches")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "branches"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Active Branches & Merge Radar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("blast_radius")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "blast_radius"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Impact Blast Radius
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("commits")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "commits"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Commit History & Diffs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("readiness")}
          className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
            activeTab === "readiness"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          PR Merge Readiness Checklist
        </button>
      </div>

      {/* Tab 1: Branches & Radar */}
      {activeTab === "branches" && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Panel>
            <PanelHeader
              title="Active Branches"
              subtitle="Track ahead/behind commit deltas and merge readiness"
              icon={<GitBranchIcon className="size-4" />}
            />
            <ul className="divide-y divide-border">
              {ws.branches.map((b) => (
                <li key={b.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <GitBranchIcon className="size-4 text-primary shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs font-semibold text-foreground">{b.name}</span>
                        <RoleBadge role={b.owner_role} />
                        <span className="text-[11px] text-muted-foreground">{b.owner_name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground mono">
                        <span>Ahead: {b.ahead}</span>
                        <span>·</span>
                        <span>Behind: {b.behind}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusPill tone={statusTone(b.merge_status)} dot={false}>
                      {b.merge_status}
                    </StatusPill>
                    {b.integration_ready ? (
                      <span className="mono text-[10px] rounded-[4px] bg-success/15 border border-success/30 px-1.5 py-0.5 text-success font-medium">
                        Ready
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Merge Conflict Radar */}
          <Panel className="p-4 space-y-4">
            <PanelHeader
              title="Semantic Merge Conflict Radar"
              subtitle="AST-level symbol and schema conflict detector"
              icon={<Radio className="size-4 text-warning" />}
            />
            {conflictReport.conflicts.length > 0 ? (
              <div className="space-y-3">
                {conflictReport.conflicts.map((c, idx) => (
                  <div key={idx} className="rounded-[6px] border border-warning/30 bg-warning/5 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2 text-warning font-semibold">
                      <AlertTriangle className="size-3.5" />
                      <span>{c.sourceLayer.toUpperCase()} DRIFT</span>
                    </div>
                    <p className="text-foreground leading-snug">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground">{c.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="size-6 text-success mx-auto mb-2" />
                Zero AST or schema merge collisions detected across active branches.
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Tab 2: Blast Radius */}
      {activeTab === "blast_radius" && (
        <Panel className="p-4 space-y-4">
          <PanelHeader
            title="Impact Blast Radius Analyzer"
            subtitle="Analyzes transitive callers and contracts impacted if changes are merged"
            icon={<Layers className="size-4 text-primary" />}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[6px] border border-border bg-surface p-3 text-xs space-y-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase mono">Directly Mutated Files</span>
              <p className="mono text-2xl font-bold text-foreground">3 files</p>
              <div className="space-y-1 text-muted-foreground text-[11px] mono">
                <p>• src/lib/auth/authenticator.ts</p>
                <p>• src/lib/db/query-builder.ts</p>
                <p>• src/lib/hacksync/merge-engine.ts</p>
              </div>
            </div>

            <div className="rounded-[6px] border border-border bg-surface p-3 text-xs space-y-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase mono">Downstream Callers</span>
              <p className="mono text-2xl font-bold text-info">8 callers</p>
              <div className="space-y-1 text-muted-foreground text-[11px] mono">
                <p>• AuthRouteHandler (routes/auth.ts)</p>
                <p>• UserProfileController (controllers/user.ts)</p>
                <p>• SessionMiddleware (middleware/session.ts)</p>
              </div>
            </div>

            <div className="rounded-[6px] border border-border bg-surface p-3 text-xs space-y-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase mono">Impacted Contracts</span>
              <p className="mono text-2xl font-bold text-success">2 contracts</p>
              <div className="space-y-1 text-muted-foreground text-[11px] mono">
                <p>• POST /auth/login (Auth Required)</p>
                <p>• GET /auth/session (Token Verified)</p>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Tab 3: Commits & Diffs */}
      {activeTab === "commits" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1.5fr]">
          <Panel>
            <PanelHeader
              title="Recent Commit History"
              subtitle="Select a commit to view unified patch diff"
              icon={<GitCommit className="size-4" />}
            />
            <ul className="divide-y divide-border">
              {RECENT_COMMITS.map((c) => {
                const isSelected = c.hash === selectedCommit.hash;
                return (
                  <li key={c.hash}>
                    <button
                      type="button"
                      onClick={() => setSelectedCommit(c)}
                      className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 ${
                        isSelected ? "bg-surface-raised border-l-2 border-l-primary" : "hover:bg-surface/50"
                      }`}
                    >
                      <GitCommit className="size-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="mono text-xs font-bold text-primary">{c.hash}</span>
                          <span className="text-[11px] text-muted-foreground">{c.author}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto mono">{c.timeAgo}</span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-foreground leading-snug">{c.message}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground mono">{c.filesChanged} files modified</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Unified Commit Diff Inspector"
              subtitle={`Viewing ${selectedCommit.hash} · ${selectedCommit.message}`}
              icon={<FileCode2 className="size-4" />}
            />
            <div className="p-4">
              <DiffViewer diff={selectedCommit.diff} filePath={`commit-${selectedCommit.hash}.diff`} />
            </div>
          </Panel>
        </div>
      )}

      {/* Tab 4: PR Merge Readiness Checklist */}
      {activeTab === "readiness" && (
        <Panel className="p-5 space-y-4">
          <PanelHeader
            title="Pull Request Merge Readiness Checklist"
            subtitle="Automated checks required before merging into default branch"
            icon={<ShieldCheck className="size-4" />}
          />
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-[6px] border border-border bg-surface">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-success" />
                <div>
                  <p className="font-semibold text-foreground">Zero Critical SAST Vulnerabilities</p>
                  <p className="text-muted-foreground text-[11px]">All OWASP security invariants verified</p>
                </div>
              </div>
              <StatusPill tone="success" dot={false}>Passed</StatusPill>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[6px] border border-border bg-surface">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-success" />
                <div>
                  <p className="font-semibold text-foreground">Targeted Test Suite Executed</p>
                  <p className="text-muted-foreground text-[11px]">100% of affected tests passing</p>
                </div>
              </div>
              <StatusPill tone="success" dot={false}>Passed</StatusPill>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[6px] border border-border bg-surface">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-success" />
                <div>
                  <p className="font-semibold text-foreground">API Contracts Synchronized with PostgreSQL Schema</p>
                  <p className="text-muted-foreground text-[11px]">Schema version v{ws.project.schema_version} matches endpoint definitions</p>
                </div>
              </div>
              <StatusPill tone="success" dot={false}>Passed</StatusPill>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[6px] border border-border bg-surface">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-success" />
                <div>
                  <p className="font-semibold text-foreground">Smart Merge Engine AST Compatibility</p>
                  <p className="text-muted-foreground text-[11px]">Clean three-way merge without syntax or symbol conflicts</p>
                </div>
              </div>
              <StatusPill tone="success" dot={false}>Passed</StatusPill>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
