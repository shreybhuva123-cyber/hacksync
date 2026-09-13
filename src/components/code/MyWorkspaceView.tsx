import { useState, useMemo, useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
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
  Split,
  Eye,
  ShieldAlert,
  ArrowDownCircle,
  X,
} from "lucide-react";
import { CopyButton, RoleBadge, StatusPill } from "@/components/hacksync/primitives";
import {
  pickLocalFileUniversal,
  pickDirectoryUniversal,
  downloadSingleFile,
  readDataTransferEntries,
} from "@/lib/hacksync/local-filesystem";
import { computeFastHash, computeLineDiff } from "@/lib/hacksync/merge-engine";
import { ROLES, type Role } from "@/lib/constants/roles";
import type { MemberFile, FileSyncStatus, Area, CodeNode } from "@/lib/hacksync/types";

interface MyWorkspaceViewProps {
  memberFiles: MemberFile[];
  sharedNodes?: CodeNode[];
  currentUserId: string | null;
  currentRole: Role;
  folderName?: string | null;
  onAddFiles: (files: Omit<MemberFile, "id" | "created_at" | "updated_at">[]) => void;
  onUpdateFile: (fileId: string, updates: Partial<MemberFile>) => void;
  onDeleteFile: (fileId: string) => void;
  onSelectFile: (file: MemberFile) => void;
  selectedFileId: string | null;
  onOpenCodeSync: () => void;
}

interface UpdateSafetyModalState {
  file: MemberFile;
  sharedNode: CodeNode;
}

export function MyWorkspaceView({
  memberFiles,
  sharedNodes = [],
  currentUserId,
  currentRole,
  folderName,
  onAddFiles,
  onUpdateFile,
  onDeleteFile,
  onSelectFile,
  selectedFileId,
  onOpenCodeSync,
}: MyWorkspaceViewProps) {
  const [isLinkingFile, setIsLinkingFile] = useState(false);
  const [isLinkingFolder, setIsLinkingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filterTrack, setFilterTrack] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Safety update confirmation modal state (Requirement #21)
  const [safetyModal, setSafetyModal] = useState<UpdateSafetyModalState | null>(null);
  // Review Diff modal state (Requirement #20)
  const [reviewDiffFile, setReviewDiffFile] = useState<{
    file: MemberFile;
    sharedNode: CodeNode;
  } | null>(null);

  // Index shared nodes by clean path
  const sharedMap = useMemo(() => {
    const map = new Map<string, CodeNode>();
    for (const node of sharedNodes) {
      if (node.kind === "file") {
        const clean = node.path.replace(/^\/+/, "").replace(/\\/g, "/");
        map.set(clean, node);
      }
    }
    return map;
  }, [sharedNodes]);

  // Compute live sync status for each file relative to shared project
  const computedFiles = useMemo(() => {
    return memberFiles.map((file) => {
      const cleanPath = file.relative_path.replace(/^\/+/, "").replace(/\\/g, "/");
      const shared = sharedMap.get(cleanPath);

      const localHash = computeFastHash(file.content || "");
      const baseVersion = file.base_version_number || 1;
      const sharedVersion = shared?.current_version_number || 1;
      const sharedHash = shared?.content ? computeFastHash(shared.content) : null;

      let computedStatus: FileSyncStatus = file.sync_status;
      let isBehind = false;
      let hasLocalEdits = false;

      if (!shared) {
        computedStatus = "local_modified";
      } else {
        const baseContent = file.base_content ?? "";
        const baseHash = file.base_hash || (baseContent ? computeFastHash(baseContent) : null);
        hasLocalEdits = baseHash ? localHash !== baseHash : localHash !== sharedHash;

        if (sharedHash === localHash) {
          computedStatus = "synced";
        } else if (sharedVersion > baseVersion) {
          isBehind = true;
          computedStatus = hasLocalEdits ? "diverged" : "behind";
        } else {
          computedStatus = hasLocalEdits ? "local_modified" : "synced";
        }
      }

      return {
        ...file,
        computedStatus,
        isBehind,
        hasLocalEdits,
        sharedVersion,
        baseVersion,
        sharedNode: shared,
      };
    });
  }, [memberFiles, sharedMap]);

  // Filter to matching track and search query
  const myFiles = useMemo(() => {
    return computedFiles.filter((f) => {
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
  }, [computedFiles, filterTrack, searchQuery]);

  const pendingCount = computedFiles.filter(
    (f) => f.computedStatus === "local_modified" || f.computedStatus === "diverged",
  ).length;

  const behindCount = computedFiles.filter(
    (f) => f.computedStatus === "behind" || f.computedStatus === "diverged",
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
      const contentHash = computeFastHash(picked.content);

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
          base_version_number: 1,
          base_content: picked.content,
          base_hash: contentHash,
          content_hash: contentHash,
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
      if (!res || res.files.length === 0) {
        setIsLinkingFolder(false);
        if (res && res.files.length === 0) {
          setFeedback(`Selected folder "${res.name}" contained no text/code files.`);
          setTimeout(() => setFeedback(null), 3500);
        }
        return;
      }

      const defaultRole = currentRole === "owner" ? "lead" : currentRole;

      const newFiles = res.files.map((f) => {
        const hash = computeFastHash(f.content || "");
        return {
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
          base_version_number: 1,
          base_content: f.content || "",
          base_hash: hash,
          content_hash: hash,
        };
      });

      onAddFiles(newFiles);
      setFeedback(`Linked ${newFiles.length} files from folder "${res.name}"!`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      console.warn("Folder link error:", err);
      setFeedback("Folder selection was interrupted.");
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsLinkingFolder(false);
    }
  };

  // Drag and Drop Handler
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer) {
        try {
          setIsLinkingFolder(true);
          const res = await readDataTransferEntries(e.dataTransfer);
          if (res && res.files.length > 0) {
            const defaultRole = currentRole === "owner" ? "lead" : currentRole;
            const newFiles = res.files.map((f) => {
              const hash = computeFastHash(f.content || "");
              return {
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
                base_version_number: 1,
                base_content: f.content || "",
                base_hash: hash,
                content_hash: hash,
              };
            });
            onAddFiles(newFiles);
            setFeedback(`Imported ${newFiles.length} files from dropped folder "${res.name}"!`);
            setTimeout(() => setFeedback(null), 3500);
          }
        } catch (err) {
          console.warn("Drop error:", err);
        } finally {
          setIsLinkingFolder(false);
        }
      }
    },
    [currentRole, currentUserId, onAddFiles],
  );

  // Safe Local File Update Handler (Requirement #20 & #21)
  const handleRequestLocalUpdate = (file: MemberFile, sharedNode: CodeNode) => {
    const localHash = computeFastHash(file.content || "");
    const baseHash = file.base_hash || (file.base_content ? computeFastHash(file.base_content) : null);
    const hasUncommittedChanges = baseHash ? localHash !== baseHash : localHash !== computeFastHash(sharedNode.content || "");

    if (!hasUncommittedChanges) {
      // Safe to update directly!
      executeLocalUpdate(file.id, sharedNode.content || "", sharedNode.current_version_number || 1);
      setFeedback(`Updated "${file.file_name}" to latest shared version V${sharedNode.current_version_number || 1}`);
      setTimeout(() => setFeedback(null), 3500);
    } else {
      // Trigger Safety Dialog! (Requirement #21)
      setSafetyModal({ file, sharedNode });
    }
  };

  const executeLocalUpdate = (fileId: string, newContent: string, newVersionNumber: number) => {
    const hash = computeFastHash(newContent);
    onUpdateFile(fileId, {
      content: newContent,
      base_content: newContent,
      base_version_number: newVersionNumber,
      base_hash: hash,
      content_hash: hash,
      sync_status: "synced",
      last_modified: new Date().toISOString(),
    });
    setSafetyModal(null);
  };

  const handleBackupAndUpdate = () => {
    if (!safetyModal) return;
    const { file, sharedNode } = safetyModal;

    // Create a local backup file first
    const backupFileName = `${file.file_name}.local_backup_v${file.base_version_number || 1}`;
    const backupPath = `${file.relative_path}.bak`;
    onAddFiles([
      {
        project_id: file.project_id,
        user_id: currentUserId,
        member_id: file.member_id,
        owner_role: file.owner_role,
        file_name: backupFileName,
        relative_path: backupPath,
        file_type: "text/plain",
        language: file.language,
        content: file.content,
        sync_status: "unlinked",
        last_modified: new Date().toISOString(),
      },
    ]);

    // Update local file with shared version
    executeLocalUpdate(file.id, sharedNode.content || "", sharedNode.current_version_number || 1);
    setFeedback(`Created backup "${backupFileName}" and updated file to shared V${sharedNode.current_version_number || 1}`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const statusToneMap: Record<FileSyncStatus, "success" | "warning" | "danger" | "neutral" | "primary"> = {
    synced: "success",
    local_modified: "warning",
    pending_upload: "warning",
    behind: "primary",
    diverged: "danger",
    conflict: "danger",
    unlinked: "neutral",
  };

  const statusLabelMap: Record<FileSyncStatus, string> = {
    synced: "✓ Up to date",
    local_modified: "↑ Local Changes",
    pending_upload: "↑ Pending Sync",
    behind: "↓ Shared Changes (Behind)",
    diverged: "↔ Changes to Merge",
    conflict: "⚠ Conflict",
    unlinked: "✕ Unlinked",
  };

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
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
                <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {computedFiles.length} linked files
                </span>
                {behindCount > 0 && (
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary animate-pulse">
                    ↓ {behindCount} behind shared
                  </span>
                )}
                {folderName && (
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    📁 {folderName}
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                Your private staged files. Compare changes with the shared project or execute CodeSync to merge.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLinkSingleFile}
              disabled={isLinkingFile}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-opacity disabled:opacity-50"
            >
              {isLinkingFile ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>+ Link Single File</span>
            </button>

            <button
              type="button"
              onClick={handleLinkFolder}
              disabled={isLinkingFolder}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {isLinkingFolder ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Folder className="size-3.5" />
              )}
              <span>📁 Link Local Folder</span>
            </button>

            <button
              type="button"
              onClick={onOpenCodeSync}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm ${
                pendingCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-black animate-pulse"
                  : "bg-secondary text-secondary-foreground border border-border hover:bg-accent"
              }`}
            >
              <Zap className="size-3.5" />
              <span>⚡ CodeSync ({pendingCount} to merge)</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="flex items-center gap-2 rounded-lg bg-success/15 border border-success/30 p-2 text-xs font-medium text-success animate-in fade-in">
            <Check className="size-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* Drag & Drop Visual Indicator */}
      {isDragging && (
        <div className="rounded-xl border-2 border-dashed border-primary bg-primary/10 p-8 text-center animate-in zoom-in-95">
          <UploadCloud className="mx-auto size-8 text-primary animate-bounce" />
          <p className="mt-2 text-sm font-bold text-primary">Drop your project folder or files here to link instantly!</p>
        </div>
      )}

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
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3 bg-card/50">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileCode2 className="size-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">No files linked yet</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              Click <b className="text-foreground">📁 Link Local Folder</b>, <b className="text-foreground">+ Link Single File</b>, or simply <b className="text-primary">drag & drop a folder here</b>.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myFiles.map((file) => {
            const isSelected = file.id === selectedFileId;
            const sharedNode = file.sharedNode;

            return (
              <div
                key={file.id}
                onClick={() => onSelectFile(file)}
                className={`group flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all ${
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
                    <StatusPill tone={statusToneMap[file.computedStatus]}>
                      {statusLabelMap[file.computedStatus]}
                    </StatusPill>
                  </div>

                  <p className="mono mt-1 truncate text-[11px] text-muted-foreground">
                    {file.relative_path}
                  </p>

                  {/* Warning: Local version is behind shared version (Requirement #20) */}
                  {file.isBehind && sharedNode && (
                    <div className="mt-2.5 rounded-lg border border-primary/30 bg-primary/10 p-2 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-primary font-bold text-[11px]">
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          <span>Local is behind shared version</span>
                        </span>
                        <span className="mono font-semibold text-[10px]">
                          V{file.baseVersion} → V{file.sharedVersion}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReviewDiffFile({ file, sharedNode });
                          }}
                          className="rounded border border-primary/40 bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-accent"
                        >
                          Review Diff
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequestLocalUpdate(file, sharedNode);
                          }}
                          className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                        >
                          Update Local File
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {file.owner_role && <RoleBadge role={file.owner_role} />}
                    <span className="mono uppercase font-medium">{file.language || "code"}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSingleFile(file.relative_path, file.content || "");
                      }}
                      title="Download file"
                      className="rounded p-1 hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Download className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFile(file.id);
                      }}
                      title="Unlink file from workspace"
                      className="rounded p-1 text-destructive hover:bg-destructive/10 transition-colors"
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

      {/* Requirement #21: Local Update Safety Confirmation Modal */}
      {safetyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-amber-500 font-bold text-sm">
                <ShieldAlert className="size-5 shrink-0" />
                <span>Local Update Safety Gate</span>
              </div>
              <button
                type="button"
                onClick={() => setSafetyModal(null)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-foreground font-semibold">
                Shared version is newer (V{safetyModal.sharedNode.current_version_number || 1}), but your local file <code className="mono text-primary font-bold">{safetyModal.file.file_name}</code> has uncommitted changes.
              </p>
              <p className="text-xs text-muted-foreground">
                Updating directly would replace your current modifications. How would you like to proceed?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const state = safetyModal;
                  setSafetyModal(null);
                  setReviewDiffFile({ file: state.file, sharedNode: state.sharedNode });
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary p-2 text-xs font-semibold text-foreground hover:bg-accent"
              >
                <Eye className="size-3.5 text-primary" />
                <span>[Review Diff] Compare Local vs Shared</span>
              </button>

              <button
                type="button"
                onClick={handleBackupAndUpdate}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary p-2 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-sm"
              >
                <HardDrive className="size-3.5" />
                <span>[Backup Local + Update] Safe Recommended</span>
              </button>

              <button
                type="button"
                onClick={() => setSafetyModal(null)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <span>[Keep Local] Dismiss and keep my uncommitted edits</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement #20: Review Diff Modal */}
      {reviewDiffFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <Split className="size-4 text-primary" />
                <span className="mono text-xs font-bold text-foreground">
                  Diff Inspection: {reviewDiffFile.file.relative_path}
                </span>
                <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Local (V{reviewDiffFile.file.base_version_number || 1}) vs Shared (V{reviewDiffFile.sharedNode.current_version_number || 1})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReviewDiffFile(null)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                  <span className="text-xs font-bold text-muted-foreground">My Local Version</span>
                  <pre className="mono max-h-64 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                    {reviewDiffFile.file.content || "(empty)"}
                  </pre>
                </div>

                <div className="rounded-lg border border-primary/30 bg-background p-3 space-y-1">
                  <span className="text-xs font-bold text-primary">Shared Project Version</span>
                  <pre className="mono max-h-64 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                    {reviewDiffFile.sharedNode.content || "(empty)"}
                  </pre>
                </div>
              </div>

              {/* Line Diff */}
              <div className="space-y-1 pt-2">
                <span className="text-xs font-bold text-foreground">Line-by-Line Changes</span>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-2 font-mono text-[11px]">
                  {computeLineDiff(reviewDiffFile.file.content || "", reviewDiffFile.sharedNode.content || "").map((diff, dIdx) => (
                    <div
                      key={dIdx}
                      className={`px-2 py-0.5 flex gap-2 ${
                        diff.type === "added"
                          ? "bg-success/15 text-success"
                          : diff.type === "removed"
                            ? "bg-destructive/15 text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      <span className="w-5 text-right select-none opacity-60">
                        {diff.type === "added" ? "+" : diff.type === "removed" ? "-" : " "}
                      </span>
                      <span className="truncate">{diff.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border p-4 bg-muted/20">
              <button
                type="button"
                onClick={() => setReviewDiffFile(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const state = reviewDiffFile;
                  setReviewDiffFile(null);
                  handleRequestLocalUpdate(state.file, state.sharedNode);
                }}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-md"
              >
                Update Local File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
