import { createFileRoute } from "@tanstack/react-router";
import { Activity as ActivityIcon } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
} from "@/components/hacksync/primitives";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Feed — HackSync" },
      {
        name: "description",
        content:
          "Live feed of contract locks, migrations, merges and task moves across the whole team.",
      },
      { property: "og:title", content: "Activity Feed — HackSync" },
      { property: "og:description", content: "Everything the team changed, in order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  return <WorkspaceView>{(ws) => <ActivityBody ws={ws} />}</WorkspaceView>;
}

function ActivityBody({ ws }: { ws: Workspace }) {
  return (
    <>
      <PageHeader
        eyebrow="team"
        title="Activity feed"
        description="Realtime stream of everything that changes the shared contract surface."
      />
      <Panel>
        <PanelHeader title="Recent events" icon={<ActivityIcon className="size-4" />} />
        {ws.activity.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No activity yet" description="Actions you take will appear here." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {ws.activity.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="mono rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {e.kind}
                </span>
                <span className="text-xs">{e.message}</span>
                <span className="ml-auto flex items-center gap-2">
                  {e.actor_role ? <RoleBadge role={e.actor_role} /> : null}
                  <span className="mono text-[10px] text-muted-foreground">
                    {new Date(e.created_at).toISOString().slice(11, 16)} UTC
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
