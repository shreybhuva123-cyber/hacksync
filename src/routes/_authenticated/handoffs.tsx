import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
} from "@/components/hacksync/primitives";
import type { Handoff, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/handoffs")({
  head: () => ({
    meta: [
      { title: "Handoff Cards — HackSync" },
      {
        name: "description",
        content:
          "Structured handoff notes: what changed, which files, which APIs, which migrations and how to test.",
      },
      { property: "og:title", content: "Handoff Cards — HackSync" },
      {
        property: "og:description",
        content: "Hand work between teammates without a 20-message chat thread.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HandoffsPage,
});

function HandoffsPage() {
  return <WorkspaceView>{(ws) => <HandoffsBody ws={ws} />}</WorkspaceView>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-xs whitespace-pre-line">{value}</p>
    </div>
  );
}

function HandoffsBody({ ws }: { ws: Workspace }) {
  return (
    <>
      <PageHeader
        eyebrow="handoff"
        title="Handoff cards"
        description="Every meaningful change gets a card so the next person can pick it up cold."
      />
      {ws.handoffs.length === 0 ? (
        <EmptyState
          title="No handoffs yet"
          description="Post one when you finish a slice of work — files touched, API changes, migrations, and how to test."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ws.handoffs.map((h: Handoff) => (
            <Panel key={h.id} className="self-start">
              <PanelHeader
                title={h.title}
                subtitle={h.summary ?? undefined}
                icon={<Sparkles className="size-4" />}
                actions={<RoleBadge role={h.author_role} />}
              />
              <div className="space-y-3 p-4">
                <Field label="Files affected" value={h.files_affected} />
                <Field label="API changes" value={h.api_changes} />
                <Field label="Schema changes" value={h.schema_changes} />
                <Field label="Env required" value={h.env_required} />
                <Field label="How to test" value={h.test_instructions} />
                <Field label="Known issues" value={h.known_issues} />
                <p className="text-[10px] text-muted-foreground">
                  {h.author_name ?? "Teammate"} ·{" "}
                  {new Date(h.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
