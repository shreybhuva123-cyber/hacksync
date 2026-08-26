import { MethodBadge, RoleBadge, StatusPill, statusTone } from "@/components/hacksync/primitives";
import { Lock, Unlock, Play, FileCode, Check } from "lucide-react";
import type { ApiContract } from "@/lib/hacksync/types";

interface ContractListProps {
  contracts: ApiContract[];
  selectedId: string | null;
  onSelectContract: (contract: ApiContract) => void;
  onToggleLock: (contract: ApiContract) => void;
  onOpenSandbox: (contract: ApiContract) => void;
}

export function ContractList({
  contracts,
  selectedId,
  onSelectContract,
  onToggleLock,
  onOpenSandbox,
}: ContractListProps) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {contracts.map((c) => {
        const isSelected = c.id === selectedId;
        return (
          <div
            key={c.id}
            onClick={() => onSelectContract(c)}
            className={`flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer transition-colors ${
              isSelected ? "bg-primary/5" : "hover:bg-accent/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <MethodBadge method={c.method} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="mono text-xs font-bold text-foreground">{c.route}</span>
                  <span className="mono rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                    {c.version}
                  </span>
                  {c.auth_required && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-amber-500">
                      Auth Required 🔒
                    </span>
                  )}
                </div>
                {c.summary && (
                  <p className="text-xs text-muted-foreground mt-0.5">{c.summary}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <RoleBadge role={c.owner_role} />
              <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSandbox(c);
                }}
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent text-foreground"
              >
                <Play className="size-3 text-primary fill-primary" />
                <span>Simulate</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(c);
                }}
                title={c.locked ? "Contract is locked" : "Click to lock contract"}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border ${
                  c.locked
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                <span>{c.locked ? "Locked" : "Unlocked"}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
