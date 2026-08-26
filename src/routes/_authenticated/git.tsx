import { createFileRoute } from "@tanstack/react-router";
import { GitBranch as GitBranchIcon, GitMerge } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/git")({
  head: () => ({
    meta: [
      { title: "Git & Branches — HackSync" },
      {
        name: "description",
        content:
          "Branch ownership, ahead/behind counts and merge conflict radar for a three-person team.",
      },
      { property: "og:title", content: "Git & Branches — HackSync" },
      {
        property: "og:description",
        content: "See who is ahead, who is behind and where the conflicts are.",
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

  return (
    <>
      <PageHeader
        eyebrow="git"
        title="Branch status"
        description={`Everything integrates into ${ws.project.default_branch}. Merge in order: database → backend → frontend.`}
        actions={
          <StatusPill tone={conflicts ? "danger" : "success"}>
            {conflicts ? `${conflicts} conflicting` : "no conflicts"}
          </StatusPill>
        }
      />
      <Panel>
        <PanelHeader title="Branches" icon={<GitBranchIcon className="size-4" />} />
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
