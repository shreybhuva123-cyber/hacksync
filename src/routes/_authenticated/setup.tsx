import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
} from "@/components/hacksync/primitives";
import { setupChecklist } from "@/lib/hacksync/analysis";
import type { Role, Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Setup & Workflow — HackSync" },
      {
        name: "description",
        content:
          "Per-role laptop setup commands and the merge workflow that keeps three machines in sync.",
      },
      { property: "og:title", content: "Setup & Workflow — HackSync" },
      {
        property: "og:description",
        content: "Get every laptop running the same project in minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupPage,
});

const ROLES: Role[] = ["frontend", "backend", "database"];

function SetupPage() {
  return <WorkspaceView>{(ws) => <SetupBody ws={ws} />}</WorkspaceView>;
}

function SetupBody({ ws }: { ws: Workspace }) {
  const [role, setRole] = useState<Role>("frontend");
  const steps = setupChecklist(ws, role);

  return (
    <>
      <PageHeader
        eyebrow="setup"
        title="Get this laptop running"
        description="Pick your role and run these in order. Everyone ends up on the same schema version and the same contracts."
        actions={
          <div className="flex items-center gap-1.5">
            {ROLES.map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)}>
                <RoleBadge role={r} className={role === r ? "ring-1 ring-primary" : "opacity-60"} />
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="self-start">
          <PanelHeader title={`${role} laptop`} icon={<Terminal className="size-4" />} />
          <div className="p-4">
            <CodeBlock filename="setup.sh" code={steps.join("\n")} maxHeight="24rem" />
          </div>
        </Panel>
        <Panel className="self-start">
          <PanelHeader
            title="Team workflow"
            subtitle="The rules that stop route, API and schema mismatches."
          />
          <ol className="list-decimal space-y-2 py-4 pr-4 pl-9 text-xs text-muted-foreground">
            <li>
              Database owner declares the table in the Schema registry <em>before</em> writing the
              migration.
            </li>
            <li>Backend owner registers the API contract and locks it once the shape is agreed.</li>
            <li>Frontend owner codes against the locked contract only — never against guesses.</li>
            <li>Register the feature in the Integration Map so the guards can watch it.</li>
            <li>Run the Health Center before every merge and before the demo.</li>
            <li>Post a handoff card for anything the other two must know.</li>
            <li>
              Invite code for this workspace:{" "}
              <span className="mono text-foreground">{ws.project.invite_code}</span>
            </li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
