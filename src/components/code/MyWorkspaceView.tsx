import { useState, useMemo } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";
import { CopyButton, RoleBadge, StatusPill } from "@/components/hacksync/primitives";
import {
  pickLocalFileUniversal,
  pickDirectoryUniversal,
  downloadSingleFile,
} from "@/lib/hacksync/local-filesystem";
import { ROLES, type Role } from "@/lib/constants/roles";
import type { MemberFile, FileSyncStatus, Area } from "@/lib/hacksync/types";

interface MyWorkspaceViewProps {
  memberFiles: MemberFile[];
  currentUserId: string | null;
  currentRole: Role;
  onAddFiles: (files: Omit<MemberFile, "id" | "created_at" | "updated_at">[]) => void;
  onUpdateFile: (fileId: string, updates: Partial<MemberFile>) => void;
  onDeleteFile: (fileId: string) => void;
  onSelectFile: (file: MemberFile) => void;
  selectedFileId: string | null;
  onOpenCodeSync: () => void;
}

export function MyWorkspaceView({
  memberFiles,
  currentUserId,
  currentRole,
  onAddFiles,
  onUpdateFile,
  onDeleteFile,
  onSelectFile,
  selectedFileId,
  onOpenCodeSync,
}: MyWorkspaceViewProps) {
  const [isLinkingFile, setIsLinkingFile] = useState(false);
  const [isLinkingFolder, setIsLinkingFolder] = useState(false);
  const [filterTrack, setFilterTrack] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filter to current member's personal files
  const myFiles = useMemo(() => {
    return memberFiles.filter((f) => {
      if (filterTrack !== "all" && f.owner_role !== filterTrack) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          f.file_name.toLowerCase().includes(q) ||
          f.relative_path.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [memberFiles, filterTrack, searchQuery]);

  const pendingCount = memberFiles.filter(
    (f) => f.sync_status === "local_modified" || f.sync_status === "pending_upload",
  ).length;

  // Single File Linker
  const handleLinkSingleFile = async () => {
    try {
      setIsLinkingFile(true);
      const picked = await pickLocalFileUniversal();
      if (!picked) {
        setIsLinkingFile(false);
        return;
      }

      const defaultRole = currentRole === "owner" ? "lead" : currentRole;

      onAddFiles([
        {
          project_id: "",
          user_id: currentUserId,
          member_id: null,
          owner_role: defaultRole,
          file_name: picked.fileName,
          relative_path: picked.relativePath,
          file_type: picked.fileType,
          language: picked.language,
          content: picked.content,
          sync_status: "local_modified",
          last_modified: new Date(picked.lastModified).toISOString(),
        },
      ]);

      setFeedback(`Linked local file "${picked.fileName}"`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.warn("Link file error:", err);
    } finally {
      setIsLinkingFile(false);
    }
  };

  // Bulk Folder Linker
  const handleLinkFolder = async () => {
    try {
      setIsLinkingFolder(true);
      const res = await pickDirectoryUniversal();
      if (!res) {
        setIsLinkingFolder(false);
        return;
      }

      const defaultRole = currentRole === "owner" ? "lead" : currentRole;

      const newFiles = res.files.map((f) => ({
        project_id: "",
        user_id: currentUserId,
        member_id: null,
        owner_role:
          f.area === "frontend"
            ? "frontend"
            : f.area === "backend"
              ? "backend"
              : f.area === "database"
                ? "database"
                : defaultRole,
        file_name: f.name,
        relative_path: f.path,
        file_type: "text/plain",
        language: f.language,
        content: f.content || "",
        sync_status: "local_modified" as FileSyncStatus,
        last_modified: new Date(f.lastModified).toISOString(),
      }));

      onAddFiles(newFiles);
      setFeedback(`Linked ${newFiles.length} files from folder "${res.name}"`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      console.warn("Folder link error:", err);
    } finally {
      setIsLinkingFolder(false);
    }
  };

  const statusToneMap: Record<FileSyncStatus, "success" | "warning" | "danger" | "neutral"> = {
    synced: "success",
    local_modified: "warning",
    pending_upload: "warning",
    conflict: "danger",
    unlinked: "neutral",
  };

  const statusLabelMap: Record<FileSyncStatus, string> = {
    synced: "✓ Synced",
    local_modified: "● Local Changes",
    pending_upload: "↑ Pending Sync",
    conflict: "⚠ Conflict",
    unlinked: "✕ Unlinked",
  };

  return (
    <div className="space-y-4">
      {/* Top Banner with Action Controls */}
      <div className="rounded-xl border border-primary/20 bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Laptop className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>My Local Workspace</span>
                <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {memberFiles.length} linked files
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Your private staged files from your PC. These remain on your machine and private
                until you execute CodeSync.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLinkSingleFile}
              disabled={isLinkingFile}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-opacity"
            >
              {isLinkingFile ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>+ Create / Link Local File</span>
            </button>

            <button
              type="button"
              onClick={handleLinkFolder}
              disabled={isLinkingFolder}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent transition-colors"
            >
              {isLinkingFolder ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Folder className="size-3.5" />
              )}
              <span>Link Local Folder</span>
            </button>

            <button
              type="button"
              onClick={onOpenCodeSync}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${
                pendingCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-black animate-pulse"
                  : "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
              }`}
            >
              <Zap className="size-3.5" />
              <span>⚡ CodeSync ({pendingCount} pending)</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="flex items-center gap-2 rounded-lg bg-success/15 border border-success/30 p-2 text-xs font-medium text-success">
            <Check className="size-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {["all", "frontend", "backend", "database", "lead"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTrack(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                filterTrack === t
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t === "all" ? "All Tracks" : t}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search my linked files..."
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary w-full sm:w-60"
        />
      </div>

      {/* File List Grid */}
      {myFiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileCode2 className="size-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">No files linked yet</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              Click <b className="text-foreground">+ Create / Link Local File</b> or <b className="text-foreground">Link Local Folder</b> to connect your PC's code files to this workspace.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleLinkSingleFile}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-3.5" />
              <span>Link First File</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {myFiles.map((file) => {
            const isSelected = file.id === selectedFileId;
            return (
              <div
                key={file.id}
                onClick={() => onSelectFile(file)}
                className={`group flex flex-col justify-between rounded-xl border p-3.5 cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-border hover:bg-accent/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <FileCode2 className="size-4 shrink-0 text-primary" />
                      <span className="font-semibold text-xs text-foreground truncate">
                        {file.file_name}
                      </span>
                    </div>
                    <StatusPill tone={statusToneMap[file.sync_status]}>
                      {statusLabelMap[file.sync_status]}
                    </StatusPill>
                  </div>

                  <p className="mono mt-1 truncate text-[11px] text-muted-foreground">
                    {file.relative_path}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {file.owner_role && <RoleBadge role={file.owner_role} />}
                    <span className="mono uppercase">{file.language || "code"}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSingleFile(file.relative_path, file.content || "");
                      }}
                      title="Download single file"
                      className="rounded p-1 hover:bg-accent hover:text-foreground"
                    >
                      <Download className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFile(file.id);
                      }}
                      title="Unlink file"
                      className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
