import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  ScoreRing,
  StatusPill,
} from "@/components/hacksync/primitives";
import { computeReadiness, computeWarnings } from "@/lib/hacksync/analysis";

export const Route = createFileRoute("/_authenticated/predemo")({
  head: () => ({
    meta: [
      { title: "Pre-Demo Mode — HackSync" },
      {
        name: "description",
        content: "Final pre-demo checklist: blockers, failing checks and demo-ready status.",
      },
      { property: "og:title", content: "Pre-Demo Mode — HackSync" },
      { property: "og:description", content: "Know if the project is demo-ready in one screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PreDemoPage,
});

function PreDemoPage() {
  return (
    <WorkspaceView>
      {(ws) => {
        const readiness = computeReadiness(ws);
        const warnings = computeWarnings(ws);
        const blockers = warnings.filter((w) => w.severity === "critical");
        const failing = ws.checks.filter((c) => c.status !== "pass");
        const ready = blockers.length === 0 && failing.length === 0;

        return (
          <>
            <PageHeader
              eyebrow="pre-demo mode"
              title={ready ? "Demo ready" : "Not demo ready yet"}
              description="Everything that must be true before you present to the judges."
            />
            <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
              <Panel className="flex flex-col items-center gap-3 p-6">
                <ScoreRing score={readiness.score} />
                <StatusPill tone={ready ? "success" : "danger"}>
                  {ready ? "all systems go" : `${blockers.length + failing.length} blockers`}
                </StatusPill>
              </Panel>
              <div className="space-y-4">
                <Panel>
                  <PanelHeader title="Blockers" subtitle="Fix these before demo" />
                  <ul className="divide-y divide-border">
                    {blockers.length === 0 ? (
                      <li className="px-4 py-3 text-xs text-muted-foreground">No blockers.</li>
                    ) : (
                      blockers.map((b) => (
                        <li key={b.id} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <StatusPill tone="danger">{b.source}</StatusPill>
                            <span className="text-xs font-medium">{b.title}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{b.detail}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </Panel>
                <Panel>
                  <PanelHeader title="Health checks" />
                  <ul className="divide-y divide-border">
                    {ws.checks.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <StatusPill tone={c.status === "pass" ? "success" : "danger"}>
                          {c.status}
                        </StatusPill>
                        <span className="text-xs">{c.name}</span>
                        <span className="mono ml-auto text-[10px] text-muted-foreground">
                          {c.category}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>
          </>
        );
      }}
    </WorkspaceView>
  );
}
