import { ChevronRight, FolderPlus, Loader2, Network, Plus, Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/hacksync/primitives";
import type { UserProject } from "@/lib/hacksync/workspace";

interface ProjectListGridProps {
  projects: UserProject[];
  activeId: string | null;
  isLoading: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateClick: () => void;
  onJoinClick: () => void;
}

export function ProjectListGrid({
  projects,
  activeId,
  isLoading,
  onSelectProject,
  onCreateClick,
  onJoinClick,
}: ProjectListGridProps) {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="size-4" />
          <span>{projects.length} accessible workspace{projects.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onJoinClick}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <span>Join via Code</span>
          </button>
          <button
            type="button"
            onClick={onCreateClick}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const isActive = p.id === activeId;
          return (
            <div
              key={p.id}
              onClick={() => onSelectProject(p.id)}
              className={`group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 hover:shadow-md ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:bg-card/90"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid size-8 place-items-center rounded-lg ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                    }`}
                  >
                    <Network className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {p.name}
                    </h4>
                    <span className="mono text-[10px] text-muted-foreground">
                      Code: {p.invite_code}
                    </span>
                  </div>
                </div>
                {isActive && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Active
                  </span>
                )}
              </div>

              {p.description && (
                <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2">
                  {p.description}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
                <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open Workspace <ChevronRight className="size-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
