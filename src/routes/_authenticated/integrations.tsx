import { createFileRoute } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  MethodBadge,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import { useContractsById } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integration Map — HackSync" },
      {
        name: "description",
        content:
          "Every feature mapped to the API route and database tables it depends on, with live status.",
      },
      { property: "og:title", content: "Integration Map — HackSync" },
      {
        property: "og:description",
        content: "Feature → API → table wiring for the whole hackathon project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return <WorkspaceView>{(ws) => <IntegrationsBody ws={ws} />}</WorkspaceView>;
}

function IntegrationsBody({ ws }: { ws: Workspace }) {
  const byId = useContractsById(ws);
  const healthy = ws.links.filter((l) => l.status === "healthy").length;

  return (
    <>
      <PageHeader
        eyebrow="integration"
        title="Integration map"
        description="One row per feature: the screen, the endpoint behind it, and the tables it reads or writes."
      />
      <Panel>
        <PanelHeader
          title="Feature wiring"
          icon={<Network className="size-4" />}
          subtitle="Broken rows mean frontend, API and database disagree."
          actions={
            <StatusPill tone={healthy === ws.links.length ? "success" : "danger"}>
              {healthy}/{ws.links.length} healthy
            </StatusPill>
          }
        />
        <ul className="divide-y divide-border">
          {ws.links.map((l) => {
            const contract = l.contract_id ? byId.get(l.contract_id) : undefined;
            return (
              <li key={l.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={statusTone(l.status)}>{l.status}</StatusPill>
                  <span className="text-sm font-medium">{l.feature_name}</span>
                  {l.frontend_path ? (
                    <span className="mono text-[11px] text-muted-foreground">
                      {l.frontend_path}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  {contract ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MethodBadge method={contract.method} />
                      <span className="mono text-muted-foreground">{contract.route}</span>
                    </span>
                  ) : (
                    <StatusPill tone="danger">no contract registered</StatusPill>
                  )}
                  <span className="text-muted-foreground">→</span>
                  {l.tables.length ? (
                    l.tables.map((t) => (
                      <span
                        key={t}
                        className="mono rounded border border-database/35 bg-database/10 px-1.5 py-0.5 text-[10px] text-database"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">no tables</span>
                  )}
                </div>
                {l.notes ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{l.notes}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
