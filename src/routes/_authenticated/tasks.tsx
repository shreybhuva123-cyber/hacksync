import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { logActivity, useRowMutation } from "@/lib/hacksync/workspace";
import type { Task, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — HackSync" },
      {
        name: "description",
        content:
          "Role-aware task board with dependencies and blockers across frontend, backend and database.",
      },
      { property: "og:title", content: "Tasks — HackSync" },
      {
        property: "og:description",
        content: "Who is blocked on whom, at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

const COLUMNS: Task["status"][] = ["todo", "in_progress", "review", "done"];

function TasksPage() {
  return <WorkspaceView>{(ws) => <TasksBody ws={ws} />}</WorkspaceView>;
}

function TasksBody({ ws }: { ws: Workspace }) {
  const update = useRowMutation();

  const advance = (t: Task) => {
    const next = COLUMNS[Math.min(COLUMNS.length - 1, COLUMNS.indexOf(t.status) + 1)];
    if (!next || next === t.status) return;
    update.mutate(
      { table: "tasks", id: t.id, values: { status: next } },
      {
        onSuccess: () => void logActivity(ws.project.id, "task", `Moved "${t.title}" to ${next}`),
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="team"
        title="Task board"
        description="Click a card to push it to the next column. Blockers are surfaced in the readiness score."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = ws.tasks.filter((t) => t.status === col);
          return (
            <Panel key={col} className="self-start">
              <PanelHeader
                title={col.replace("_", " ")}
                icon={<ListChecks className="size-4" />}
                actions={
                  <StatusPill tone="neutral" dot={false}>
                    {items.length}
                  </StatusPill>
                }
              />
              <ul className="divide-y divide-border">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => advance(t)}
                      disabled={col === "done" || update.isPending}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-default"
                    >
                      <p className="text-xs font-medium">{t.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <RoleBadge role={t.assignee_role ?? t.area} />
                        <StatusPill tone={statusTone(t.priority)} dot={false}>
                          {t.priority}
                        </StatusPill>
                      </div>
                      {t.blocker ? (
                        <p className="mt-1.5 text-[11px] text-destructive">Blocked: {t.blocker}</p>
                      ) : null}
                      {t.depends_on ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Depends on: {t.depends_on}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                    Nothing here
                  </li>
                ) : null}
              </ul>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
