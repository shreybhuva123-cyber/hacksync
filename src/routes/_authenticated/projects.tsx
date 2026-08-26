import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  FolderPlus,
  Loader2,
  LogIn,
  Network,
  Plus,
  Users,
  Folder,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
} from "@/components/hacksync/primitives";
import { useAuth } from "@/hooks/useAuth";
import { setActiveProjectId } from "@/hooks/useActiveProject";
import { useUserProjects, useCreateProject, useJoinProject } from "@/lib/hacksync/workspace";
import {
  pickLocalDirectory,
  createProjectSubfolder,
  scaffoldInitialProjectFiles,
  supportsFileSystemAccess,
  saveStoredDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import type { Role } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — HackSync" },
      {
        name: "description",
        content: "Create, join, and switch between HackSync workspaces.",
      },
      { property: "og:title", content: "Projects — HackSync" },
      {
        property: "og:description",
        content: "Manage your hackathon team workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

const ROLES: Role[] = ["frontend", "backend", "database", "lead"];

function ProjectsPage() {
  return <WorkspaceView allowEmpty>{() => <ProjectsBody />}</WorkspaceView>;
}

function ProjectsBody() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: projects, isLoading } = useUserProjects();
  const createProject = useCreateProject();
  const joinProject = useJoinProject();

  // Create project form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRepo, setCreateRepo] = useState("");
  const [createRole, setCreateRole] = useState<Role>("lead");
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localDirName, setLocalDirName] = useState<string>("");
  const [autoScaffold, setAutoScaffold] = useState<boolean>(true);

  // Join project form
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinRole, setJoinRole] = useState<Role>("frontend");

  const [error, setError] = useState<string | null>(null);

  const handlePickDirectory = async () => {
    try {
      const res = await pickLocalDirectory();
      if (res) {
        setLocalDirHandle(res.handle);
        setLocalDirName(res.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access local folder.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!createName.trim()) return setError("Project name is required.");
    try {
      // 1. If local directory selected, create project subfolder & scaffold starter files
      if (localDirHandle) {
        try {
          const projectFolder = await createProjectSubfolder(localDirHandle, createName.trim());
          if (autoScaffold) {
            await scaffoldInitialProjectFiles(projectFolder, createName.trim(), createDesc.trim());
          }
          saveStoredDirectoryState({
            connected: true,
            name: `${localDirName}/${createName.trim()}`,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch (fsErr) {
          console.warn("Could not create local project subfolder:", fsErr);
        }
      }

      const meta = user?.user_metadata as Record<string, string> | undefined;
      const project = await createProject.mutateAsync({
        name: createName.trim(),
        description: createDesc.trim(),
        repo_url: createRepo.trim(),
        role: createRole,
        displayName: meta?.["display_name"] ?? user?.email?.split("@")[0] ?? "Member",
        userId: user?.id ?? "",
      });
      setActiveProjectId(project.id);
      void navigate({ to: "/code" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!joinCode.trim()) return setError("Invite code is required.");
    try {
      const meta = user?.user_metadata as Record<string, string> | undefined;
      const project = await joinProject.mutateAsync({
        inviteCode: joinCode.trim(),
        displayName:
          joinName.trim() || meta?.["display_name"] || user?.email?.split("@")[0] || "Member",
        role: joinRole,
        userId: user?.id ?? "",
      });
      setActiveProjectId(project.id);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join project.");
    }
  };

  const switchTo = (id: string) => {
    setActiveProjectId(id);
    void navigate({ to: "/dashboard" });
  };

  return (
    <>
      <PageHeader
        eyebrow="workspace"
        title="Projects"
        description="Create a new workspace, join one with an invite code, or switch between your existing projects."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* My Projects */}
        <Panel className="self-start">
          <PanelHeader
            title="My projects"
            icon={<Network className="size-4" />}
            subtitle={
              isLoading
                ? "Loading…"
                : `${projects?.length ?? 0} project${(projects?.length ?? 0) !== 1 ? "s" : ""}`
            }
          />
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : !projects?.length ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No projects yet. Create one or join with an invite code.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => switchTo(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <Network className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{p.name}</p>
                      {p.description ? (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Actions */}
        <div className="space-y-4">
          {/* Create Project */}
          <Panel className="self-start">
            <PanelHeader title="Create project" icon={<FolderPlus className="size-4" />} />
            {!showCreate ? (
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(true);
                    setShowJoin(false);
                    setError(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="size-4" />
                  New project
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3 p-4">
                <FormField
                  id="create-name"
                  label="Project name"
                  value={createName}
                  onChange={setCreateName}
                  placeholder="hackathon-2025"
                  required
                />
                <FormField
                  id="create-desc"
                  label="Description"
                  value={createDesc}
                  onChange={setCreateDesc}
                  placeholder="Weekend hackathon project"
                />
                <FormField
                  id="create-repo"
                  label="Repo URL"
                  value={createRepo}
                  onChange={setCreateRepo}
                  placeholder="https://github.com/team/repo"
                />
                <RoleSelect
                  id="create-role"
                  label="Your role"
                  value={createRole}
                  onChange={setCreateRole}
                />

                {/* Local Directory Location (Vibe Coding) */}
                <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <HardDrive className="size-3.5 text-primary" />
                      Local Directory Location (Vibe Coding)
                    </label>
                    <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Code locally in VS Code/Cursor — HackSync will live-sync your full code files!
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePickDirectory}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      <Folder className="size-3.5 text-primary" />
                      {localDirName ? "Change Directory" : "Browse Folder..."}
                    </button>
                    {localDirName ? (
                      <div className="flex flex-1 items-center truncate rounded-md bg-secondary/80 px-2.5 py-1 text-xs mono text-secondary-foreground">
                        📁 {localDirName}/
                        {createName
                          ? createName.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
                          : "project-folder"}
                      </div>
                    ) : null}
                  </div>

                  {localDirName ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoScaffold}
                        onChange={(e) => setAutoScaffold(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>Auto-scaffold project folder & starter template files on disk</span>
                    </label>
                  ) : null}
                </div>

                {error && showCreate ? <p className="text-xs text-destructive">{error}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createProject.isPending}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {createProject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </Panel>

          {/* Join Project */}
          <Panel className="self-start">
            <PanelHeader title="Join with invite code" icon={<LogIn className="size-4" />} />
            {!showJoin ? (
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoin(true);
                    setShowCreate(false);
                    setError(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
                >
                  <Users className="size-4" />
                  Join existing project
                </button>
              </div>
            ) : (
              <form onSubmit={handleJoin} className="space-y-3 p-4">
                <FormField
                  id="join-code"
                  label="Invite code"
                  value={joinCode}
                  onChange={setJoinCode}
                  placeholder="abc123"
                  required
                />
                <FormField
                  id="join-name"
                  label="Your display name"
                  value={joinName}
                  onChange={setJoinName}
                  placeholder={
                    (user?.user_metadata as Record<string, string> | undefined)?.["display_name"] ||
                    user?.email?.split("@")[0] ||
                    "Your Name"
                  }
                />
                <RoleSelect
                  id="join-role"
                  label="Your role"
                  value={joinRole}
                  onChange={setJoinRole}
                />

                {error && showJoin ? <p className="text-xs text-destructive">{error}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={joinProject.isPending}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {joinProject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoin(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

// ─── Shared form components ────────────────────────────────────────────

function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </div>
  );
}

function RoleSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Role;
  onChange: (v: Role) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-1.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value === r
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
