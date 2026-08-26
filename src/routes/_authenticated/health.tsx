import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import { PageHeader, Panel, PanelHeader, StatusPill } from "@/components/hacksync/primitives";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "Health Checks — HackSync" },
      {
        name: "description",
        content: "Monitored integration health checks across frontend, API and database.",
      },
      { property: "og:title", content: "Health Checks — HackSync" },
      { property: "og:description", content: "Integration health across the whole stack." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  return (
    <WorkspaceView>
      {(ws) => (
        <>
          <PageHeader
            eyebrow="health"
            title="Integration health checks"
            description="Automated checks that tell you which layer is broken before the judges find out."
          />
          <Panel>
            <PanelHeader
              title="All checks"
              actions={
                <StatusPill
                  tone={ws.checks.every((c) => c.status === "pass") ? "success" : "danger"}
                >
                  {ws.checks.filter((c) => c.status === "pass").length}/{ws.checks.length} passing
                </StatusPill>
              }
            />
            <ul className="divide-y divide-border">
              {ws.checks.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={
                        c.status === "pass" ? "success" : c.status === "warn" ? "warning" : "danger"
                      }
                    >
                      {c.status}
                    </StatusPill>
                    <span className="text-xs font-medium">{c.name}</span>
                    <span className="mono text-[10px] text-muted-foreground">{c.category}</span>
                    {c.critical ? <StatusPill tone="danger">critical</StatusPill> : null}
                  </div>
                  {c.detail ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{c.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </WorkspaceView>
  );
}
