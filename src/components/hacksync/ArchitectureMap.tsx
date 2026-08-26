import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Boxes, Database, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/hacksync/types";
import { MethodBadge, StatusPill } from "./primitives";

interface Edge {
  id: string;
  from: string;
  to: string;
  status: "healthy" | "broken" | "pending";
}

const edgeColor = {
  healthy: "var(--success)",
  broken: "var(--destructive)",
  pending: "var(--warning)",
} as const;

export function ArchitectureMap({
  ws,
  selectedId,
  onSelect,
}: {
  ws: Workspace;
  selectedId?: string | null;
  onSelect?: (contractId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ id: string; d: string; status: Edge["status"] }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    },
    [],
  );

  const edges: Edge[] = [];
  ws.links.forEach((l) => {
    if (l.contract_id) {
      edges.push({
        id: `${l.id}-c`,
        from: `feature:${l.id}`,
        to: `contract:${l.contract_id}`,
        status: l.status,
      });
      l.tables.forEach((t) => {
        const table = ws.tables.find((x) => x.name === t);
        if (table)
          edges.push({
            id: `${l.id}-t-${t}`,
            from: `contract:${l.contract_id}`,
            to: `table:${table.id}`,
            status: l.status,
          });
      });
    } else {
      l.tables.forEach((t) => {
        const table = ws.tables.find((x) => x.name === t);
        if (table)
          edges.push({
            id: `${l.id}-orphan-${t}`,
            from: `feature:${l.id}`,
            to: `table:${table.id}`,
            status: "broken",
          });
      });
    }
  });

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    setSize({ w: box.width, h: box.height });
    const next: { id: string; d: string; status: Edge["status"] }[] = [];
    edges.forEach((e) => {
      const a = nodeRefs.current.get(e.from);
      const b = nodeRefs.current.get(e.to);
      if (!a || !b) return;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = ra.right - box.left;
      const y1 = ra.top + ra.height / 2 - box.top;
      const x2 = rb.left - box.left;
      const y2 = rb.top + rb.height / 2 - box.top;
      const dx = Math.max(28, (x2 - x1) / 2);
      next.push({
        id: e.id,
        status: e.status,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      });
    });
    setPaths(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(edges)]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [recompute]);

  const highlight = (contractId: string | null) => onSelect?.(contractId);

  return (
    <div ref={containerRef} className="relative">
      <svg
        className="pointer-events-none absolute inset-0 hidden lg:block"
        width={size.w}
        height={size.h}
        aria-hidden
      >
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill="none"
            stroke={edgeColor[p.status]}
            strokeWidth={1.6}
            strokeDasharray={p.status === "healthy" ? undefined : "5 4"}
            opacity={0.75}
            style={
              p.status === "healthy" ? undefined : { animation: "dash-flow 1.2s linear infinite" }
            }
          />
        ))}
      </svg>

      <div className="relative grid gap-5 lg:grid-cols-3">
        <Column
          title="Frontend features"
          icon={<Boxes className="size-4" />}
          accent="text-frontend"
          count={ws.links.length}
        >
          {ws.links.map((l) => (
            <button
              key={l.id}
              ref={register(`feature:${l.id}`)}
              type="button"
              onClick={() => highlight(l.contract_id)}
              className={cn(
                "w-full rounded-lg border bg-surface p-2.5 text-left transition-colors hover:border-frontend/50",
                selectedId && selectedId === l.contract_id
                  ? "border-frontend/70 bg-frontend/10"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{l.feature_name}</span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    l.status === "healthy"
                      ? "bg-success"
                      : l.status === "broken"
                        ? "bg-destructive"
                        : "bg-warning",
                  )}
                />
              </div>
              {l.frontend_path ? (
                <p className="mono mt-1 truncate text-[10px] text-muted-foreground">
                  {l.frontend_path}
                </p>
              ) : null}
            </button>
          ))}
        </Column>

        <Column
          title="API routes"
          icon={<PlugZap className="size-4" />}
          accent="text-backend"
          count={ws.contracts.length}
        >
          {ws.contracts.map((c) => (
            <button
              key={c.id}
              ref={register(`contract:${c.id}`)}
              type="button"
              onClick={() => highlight(selectedId === c.id ? null : c.id)}
              className={cn(
                "w-full rounded-lg border bg-surface p-2.5 text-left transition-colors hover:border-backend/50",
                selectedId === c.id ? "border-backend/70 bg-backend/10" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <MethodBadge method={c.method} />
                <span className="mono truncate text-[11px]">{c.route}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <StatusPill
                  tone={
                    c.status === "live" ? "success" : c.status === "broken" ? "danger" : "warning"
                  }
                >
                  {c.status}
                </StatusPill>
                <span className="mono text-[10px] text-muted-foreground">{c.version}</span>
                {c.locked ? <span className="mono text-[10px] text-primary">locked</span> : null}
              </div>
            </button>
          ))}
        </Column>

        <Column
          title="Database tables"
          icon={<Database className="size-4" />}
          accent="text-database"
          count={ws.tables.length}
        >
          {ws.tables.map((t) => {
            const cols = ws.columns.filter((c) => c.table_id === t.id);
            return (
              <div
                key={t.id}
                ref={register(`table:${t.id}`)}
                className={cn(
                  "rounded-lg border bg-surface p-2.5",
                  t.migration_status === "drifted" ? "border-destructive/50" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono truncate text-xs font-medium">{t.name}</span>
                  <StatusPill
                    tone={
                      t.migration_status === "applied"
                        ? "success"
                        : t.migration_status === "drifted"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {t.migration_status}
                  </StatusPill>
                </div>
                <p className="mono mt-1 truncate text-[10px] text-muted-foreground">
                  {cols.length} cols · {t.schema_version}
                </p>
              </div>
            );
          })}
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  icon,
  accent,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className={accent}>{icon}</span>
        <h3 className="text-xs font-semibold tracking-wide uppercase">{title}</h3>
        <span className="mono ml-auto text-[10px] text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
