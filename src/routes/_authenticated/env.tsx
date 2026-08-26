import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from "@/components/hacksync/primitives";
import { generateEnvExample } from "@/lib/hacksync/analysis";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/env")({
  head: () => ({
    meta: [
      { title: "Environment Variables — HackSync" },
      {
        name: "description",
        content:
          "Which environment variables each laptop needs, which are configured, and a generated .env.example.",
      },
      { property: "og:title", content: "Environment Variables — HackSync" },
      {
        property: "og:description",
        content: "Env parity across three laptops, without pasting secrets in chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnvPage,
});

function EnvPage() {
  return <WorkspaceView>{(ws) => <EnvBody ws={ws} />}</WorkspaceView>;
}

function EnvBody({ ws }: { ws: Workspace }) {
  const missing = ws.envVars.filter((v) => v.required && !v.configured);

  return (
    <>
      <PageHeader
        eyebrow="environment"
        title="Environment parity"
        description="HackSync never stores values — only the keys each part of the stack expects."
        actions={
          <StatusPill tone={missing.length ? "danger" : "success"}>
            {missing.length ? `${missing.length} missing` : "all configured"}
          </StatusPill>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Declared variables" icon={<KeyRound className="size-4" />} />
          <ul className="divide-y divide-border">
            {ws.envVars.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <StatusPill tone={v.configured ? "success" : v.required ? "danger" : "warning"}>
                  {v.configured ? "set" : v.required ? "missing" : "optional"}
                </StatusPill>
                <span className="mono text-[12px]">{v.key_name}</span>
                <span className="mono text-[10px] text-muted-foreground uppercase">{v.scope}</span>
                {v.used_in ? (
                  <span className="mono ml-auto text-[10px] text-muted-foreground">
                    {v.used_in}
                  </span>
                ) : null}
                {v.description ? (
                  <p className="w-full text-[11px] text-muted-foreground">{v.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-4">
          <CodeBlock
            filename=".env.example (frontend)"
            code={generateEnvExample(ws, "frontend")}
            maxHeight="18rem"
          />
          <CodeBlock
            filename=".env.example (backend)"
            code={generateEnvExample(ws, "backend")}
            maxHeight="18rem"
          />
        </div>
      </div>
    </>
  );
}
