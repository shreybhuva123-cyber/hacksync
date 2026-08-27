import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  Github,
  GitMerge,
  Layers,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { supabase } from "@/integrations/supabase/client";
import type { Workspace, GitHubPushRecord } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/git")({
  head: () => ({
    meta: [
      { title: "Git & Branches — HackSync" },
      {
        name: "description",
        content:
          "Branch ownership, ahead/behind counts, merge conflict radar, and GitHub push synchronization history.",
      },
      { property: "og:title", content: "Git & Branches — HackSync" },
      {
        property: "og:description",
        content: "See who is ahead, who is behind, where conflicts are, and track GitHub push history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GitPage,
});

function GitPage() {
  return <WorkspaceView>{(ws) => <GitBody ws={ws} />}</WorkspaceView>;
}

function GitBody({ ws }: { ws: Workspace }) {
  const conflicts = ws.branches.filter((b) => b.merge_status === "conflict").length;
  const [pushes, setPushes] = useState<GitHubPushRecord[]>([]);

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
        // Fallback
      }
    }
    loadPushes();
  }, [ws.project.id]);

  return (
    <>
      <PageHeader
        eyebrow="git"
        title="Branch status & GitHub Push History"
        description={`Everything integrates into ${ws.project.default_branch}. Merge in order: database → backend → frontend.`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={conflicts ? "danger" : "success"}>
              {conflicts ? `${conflicts} conflicting` : "no conflicts"}
            </StatusPill>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Branches Panel */}
        <Panel>
          <PanelHeader title="Active Branches" icon={<GitBranchIcon className="size-4" />} />
          <ul className="divide-y divide-border">
            {ws.branches.map((b) => (
              <li key={b.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <GitBranchIcon className="size-3.5 text-muted-foreground" />
                  <span className="mono text-[12px] font-medium">{b.name}</span>
                  <RoleBadge role={b.owner_role} />
                  <span className="text-[11px] text-muted-foreground">{b.owner_name}</span>
                  <StatusPill tone={statusTone(b.merge_status)} className="ml-auto">
                    {b.merge_status}
                  </StatusPill>
                  {b.integration_ready ? (
                    <StatusPill tone="success" dot={false}>
                      integration ready
                    </StatusPill>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="mono">
                    ↑{b.ahead} ahead · ↓{b.behind} behind
                  </span>
                  {b.last_commit_sha ? (
                    <span className="mono">{b.last_commit_sha.slice(0, 7)}</span>
                  ) : null}
                  {b.last_commit_message ? <span>{b.last_commit_message}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* GitHub Push History */}
        <Panel>
          <PanelHeader
            title="GitHub Push History"
            icon={<Github className="size-4" />}
            actions={
              <span className="mono text-[10px] text-muted-foreground">
                {pushes.length} pushes
              </span>
            }
          />
          {pushes.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <UploadCloud className="mx-auto size-8 text-muted-foreground/50 mb-2" />
              <p>No GitHub pushes recorded yet.</p>
              <p className="text-[11px] mt-1">Use "Push to GitHub" on the Files & Code page to push your codebase.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border max-h-[350px] overflow-y-auto">
              {pushes.map((p) => {
                const repoClean = p.repo_url.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");
                const commitUrl = `https://github.com/${repoClean}/commit/${p.commit_sha}`;
                return (
                  <li key={p.id} className="p-3.5 space-y-1 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground truncate max-w-[200px]">
                        {p.commit_message}
                      </span>
                      <a
                        href={commitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-[10px] text-primary hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>{p.commit_sha.slice(0, 7)}</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{p.author_name || "Developer"} · branch {p.branch}</span>
                      <span>{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-4">
        <PanelHeader
          title="Safe integration routine"
          icon={<GitMerge className="size-4" />}
          subtitle="Run this before every merge so nobody overwrites a teammate."
        />
        <ol className="list-decimal space-y-1.5 py-3 pr-4 pl-9 text-xs text-muted-foreground">
          <li>
            <span className="mono text-foreground">
              git pull origin {ws.project.default_branch}
            </span>{" "}
            on your branch first — never merge blind.
          </li>
          <li>Resolve conflicts locally, re-run the health checks, then push.</li>
          <li>Database migrations merge first, then backend routes, then frontend screens.</li>
          <li>Lock the API contract before the frontend codes against it.</li>
          <li>Post a handoff card so the other two know what changed.</li>
        </ol>
      </Panel>
    </>
  );
}
