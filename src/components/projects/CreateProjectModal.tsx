import { useState } from "react";
import { Folder, HardDrive, Loader2, Sparkles, X } from "lucide-react";
import { RoleBadge } from "@/components/hacksync/primitives";
import {
  pickDirectoryUniversal,
  createProjectSubfolder,
  scaffoldInitialProjectFiles,
  saveStoredDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import type { Role } from "@/lib/hacksync/types";

const ROLES: Role[] = ["frontend", "backend", "database", "lead"];

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description?: string | undefined;
    repo_url?: string | undefined;
    role: Role;
    directoryHandle?: FileSystemDirectoryHandle | null | undefined;
    autoScaffold?: boolean | undefined;
  }) => Promise<void>;
  isLoading: boolean;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [repo, setRepo] = useState("");
  const [role, setRole] = useState<Role>("lead");
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localDirName, setLocalDirName] = useState<string>("");
  const [autoScaffold, setAutoScaffold] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePickDirectory = async () => {
    try {
      const res = await pickDirectoryUniversal();
      if (res) {
        setLocalDirHandle(res.handle);
        setLocalDirName(res.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access folder");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: desc.trim() || undefined,
        repo_url: repo.trim() || undefined,
        role,
        directoryHandle: localDirHandle,
        autoScaffold,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Create New Project</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/15 border border-destructive/30 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-foreground">
              Project Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI MedScan, DefiPulse"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-foreground">Description (Optional)</label>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Brief description of what you're building..."
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-foreground">
              GitHub Repo URL (Optional)
            </label>
            <input
              type="url"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="https://github.com/team/my-project"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <HardDrive className="size-3.5" /> Local Vibe Coding Directory (Optional)
              </span>
              {localDirName && (
                <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  📁 {localDirName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Select your local project folder to enable live file synchronization with HackSync.
            </p>
            <button
              type="button"
              onClick={handlePickDirectory}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10"
            >
              <Folder className="size-3.5 text-primary" />
              {localDirName ? `Change Folder (${localDirName})` : "Choose Workspace Folder"}
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Your Role</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium capitalize transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <RoleBadge role={r} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
