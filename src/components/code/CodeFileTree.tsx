import { FileCode2, ChevronRight, HardDrive } from "lucide-react";
import { RoleBadge, StatusPill, statusTone } from "@/components/hacksync/primitives";
import type { CodeNode } from "@/lib/hacksync/types";

interface CodeFileTreeProps {
  nodes: CodeNode[];
  selectedId: string | null;
  onSelectNode: (node: CodeNode) => void;
  isLocal: boolean;
}

export function CodeFileTree({
  nodes,
  selectedId,
  onSelectNode,
  isLocal,
}: CodeFileTreeProps) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => {
        const isSelected = node.id === selectedId;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node)}
            className={`w-full flex items-center justify-between rounded-lg p-2.5 text-xs text-left transition-all ${
              isSelected
                ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
                : "hover:bg-accent text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileCode2 className={`size-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              <span className="mono truncate font-medium text-foreground">{node.path}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {node.owner_role && <RoleBadge role={node.owner_role} />}
              <StatusPill tone={statusTone(node.status)} className="text-[10px]">
                {node.status}
              </StatusPill>
            </div>
          </button>
        );
      })}
    </div>
  );
}
