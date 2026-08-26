import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Code2, Database, Download, FileCode, KeyRound, Sparkles, Terminal } from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CodeBlock,
  CopyButton,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
  statusTone,
} from "@/components/hacksync/primitives";
import {
  generateDrizzleSchema,
  generatePostgreSqlDDL,
  generatePrismaSchema,
} from "@/lib/hacksync/conflict-radar";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/schema")({
  head: () => ({
    meta: [
      { title: "Database Schema & ORM Generator — HackSync" },
      {
        name: "description",
        content:
          "Shared database schema registry with automatic PostgreSQL DDL, Prisma, and Drizzle ORM code generation.",
      },
      { property: "og:title", content: "Database Schema & ORM Generator — HackSync" },
      {
        property: "og:description",
        content: "Tables, columns, migration status and 1-click ORM code generators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchemaPage,
});

type OrmFormat = "sql" | "prisma" | "drizzle";

function SchemaPage() {
  return <WorkspaceView>{(ws) => <SchemaBody ws={ws} />}</WorkspaceView>;
}

function SchemaBody({ ws }: { ws: Workspace }) {
  const [showOrmModal, setShowOrmModal] = useState(false);
  const [ormFormat, setOrmFormat] = useState<OrmFormat>("sql");

  const applied = ws.tables.filter((t) => t.migration_status === "applied").length;

  const generatedCode = useMemo(() => {
    if (ormFormat === "prisma") return generatePrismaSchema(ws.tables, ws.columns);
    if (ormFormat === "drizzle") return generateDrizzleSchema(ws.tables, ws.columns);
    return generatePostgreSqlDDL(ws.tables, ws.columns);
  }, [ws.tables, ws.columns, ormFormat]);

  const handleDownload = () => {
    const filename =
      ormFormat === "prisma"
        ? "schema.prisma"
        : ormFormat === "drizzle"
          ? "schema.ts"
          : "migrations.sql";
    const blob = new Blob([generatedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="database & orm generation"
        title="Schema Registry"
        description={`Project schema version ${ws.project.schema_version}. All tables, columns, and 1-click ORM DDL generators.`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOrmModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Code2 className="size-3.5" />
              Generate ORM / SQL DDL
            </button>
            <StatusPill tone={applied === ws.tables.length ? "success" : "warning"}>
              {applied}/{ws.tables.length} applied
            </StatusPill>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {ws.tables.map((t) => {
          const cols = ws.columns
            .filter((c) => c.table_id === t.id)
            .sort((a, b) => a.ordinal - b.ordinal);
          return (
            <Panel key={t.id} className="self-start">
              <PanelHeader
                title={t.name}
                subtitle={t.description ?? undefined}
                icon={<Database className="size-4" />}
                actions={
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role={t.owner_role} />
                    <StatusPill tone={statusTone(t.migration_status)}>
                      {t.migration_status}
                    </StatusPill>
                  </div>
                }
              />
              <div className="p-4">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-[10px] tracking-wider text-muted-foreground uppercase">
                      <th className="pb-2 font-medium">Column</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cols.map((c) => (
                      <tr key={c.id}>
                        <td className="mono py-1.5">
                          <span className="inline-flex items-center gap-1">
                            {c.is_primary ? <KeyRound className="size-3 text-warning" /> : null}
                            {c.name}
                          </span>
                        </td>
                        <td className="mono py-1.5 text-muted-foreground">{c.data_type}</td>
                        <td className="py-1.5 text-[11px] text-muted-foreground">
                          {[
                            c.is_nullable ? "nullable" : "not null",
                            c.is_indexed ? "indexed" : null,
                            c.references_table ? `→ ${c.references_table}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {t.sql_definition ? (
                  <CodeBlock
                    className="mt-3"
                    filename={`${t.name}.sql`}
                    code={t.sql_definition}
                    maxHeight="12rem"
                  />
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>

      {/* ORM & Migration DDL Generator Modal */}
      {showOrmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="relative flex h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden">
            <header className="flex h-14 items-center justify-between border-b border-border px-5 bg-surface">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Schema DDL & Multi-ORM Exporter
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <Download className="size-3" /> Download File
                </button>
                <button
                  type="button"
                  onClick={() => setShowOrmModal(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                >
                  ✕
                </button>
              </div>
            </header>

            {/* Format Selector Tabs */}
            <div className="flex border-b border-border bg-muted/40 px-4 py-2 gap-2">
              <button
                type="button"
                onClick={() => setOrmFormat("sql")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  ormFormat === "sql"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                PostgreSQL DDL (.sql)
              </button>
              <button
                type="button"
                onClick={() => setOrmFormat("prisma")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  ormFormat === "prisma"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Prisma Schema (.prisma)
              </button>
              <button
                type="button"
                onClick={() => setOrmFormat("drizzle")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  ormFormat === "drizzle"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Drizzle ORM (.ts)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <CodeBlock
                code={generatedCode}
                language={
                  ormFormat === "prisma" ? "prisma" : ormFormat === "drizzle" ? "typescript" : "sql"
                }
                filename={
                  ormFormat === "prisma"
                    ? "schema.prisma"
                    : ormFormat === "drizzle"
                      ? "schema.ts"
                      : "schema.sql"
                }
                maxHeight="60vh"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
