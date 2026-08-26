import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import { PageHeader } from "@/components/hacksync/primitives";
import { ArchitectureMap } from "@/components/hacksync/ArchitectureMap";

export const Route = createFileRoute("/_authenticated/architecture")({
  head: () => ({
    meta: [
      { title: "Architecture Map — HackSync" },
      {
        name: "description",
        content: "Visual map connecting frontend features to API routes and database tables.",
      },
      { property: "og:title", content: "Architecture Map — HackSync" },
      { property: "og:description", content: "See how frontend, API and database connect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchitecturePage,
});

function ArchitecturePage() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <WorkspaceView>
      {(ws) => (
        <>
          <PageHeader
            eyebrow="architecture"
            title="Project map"
            description="Every feature, the route it calls and the tables behind it. Dashed red edges are broken integrations."
          />
          <ArchitectureMap ws={ws} selectedId={selected} onSelect={setSelected} />
        </>
      )}
    </WorkspaceView>
  );
}
