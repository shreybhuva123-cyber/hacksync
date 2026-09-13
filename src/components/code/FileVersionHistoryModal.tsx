import { useState, useEffect } from "react";
import {
  History,
  RotateCcw,
  X,
  Loader2,
  Calendar,
  User,
  CheckCircle2,
  AlertTriangle,
  Code,
  Diff,
  FileCode2,
} from "lucide-react";
import { codeSyncService } from "@/lib/services/codesync.service";
import { computeLineDiff } from "@/lib/hacksync/merge-engine";
import { RoleBadge } from "@/components/hacksync/primitives";
import type { FileVersion, Role } from "@/lib/hacksync/types";

interface FileVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  filePath: string;
  currentContent: string;
  currentVersionNumber: number;
  currentUserName: string;
  currentUserRole: Role;
  onVersionRestored: (newVersion: FileVersion) => void;
}

export function FileVersionHistoryModal({
  isOpen,
  onClose,
  projectId,
  filePath,
  currentContent,
  currentVersionNumber,
  currentUserName,
  currentUserRole,
  onVersionRestored,
}: FileVersionHistoryModalProps) {
  const [history, setHistory] = useState<FileVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<FileVersion | null>(null);
  const [viewMode, setViewMode] = useState<"code" | "diff">("code");
  const [confirmRollbackVer, setConfirmRollbackVer] = useState<FileVersion | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      loadHistory();
    }
  }, [isOpen, projectId, filePath]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const versions = await codeSyncService.getFileVersionHistory(projectId, filePath);
      setHistory(versions);
      if (versions.length > 0 && versions[0]) {
        setSelectedVersion(versions[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load version history.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleExecuteRollback = async () => {
    if (!confirmRollbackVer) return;
    try {
      setIsRollingBack(true);
      setError(null);
      const newVersion = await codeSyncService.rollbackFileVersion(
        projectId,
        filePath,
        confirmRollbackVer.version_number,
        currentUserName,
        currentUserRole,
      );
      setConfirmRollbackVer(null);
      onVersionRestored(newVersion);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore version.");
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border p-5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <History className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>Version History:</span>
                <span className="mono text-primary font-bold">{filePath}</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Immutable record of every synchronization and merge. Restore any historical version safely.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">Loading version history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-2">
              <FileCode2 className="mx-auto size-8 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">No historical versions recorded yet</h4>
              <p className="text-xs text-muted-foreground">
                Versions are automatically preserved whenever CodeSync reconciles and commits changes.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-5">
              {/* Left Column: Version Timeline */}
              <div className="md:col-span-2 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Versions ({history.length})
                </span>
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {history.map((ver) => {
                    const isSelected = selectedVersion?.id === ver.id;
                    const isCurrent = ver.version_number === currentVersionNumber;

                    return (
                      <div
                        key={ver.id}
                        onClick={() => setSelectedVersion(ver)}
                        className={`group rounded-xl border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border bg-background hover:bg-accent/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="mono text-xs font-bold text-foreground flex items-center gap-1.5">
                            <span>V{ver.version_number}</span>
                            {isCurrent && (
                              <span className="rounded bg-success/20 px-1.5 py-0.2 text-[9px] font-bold text-success">
                                Current
                              </span>
                            )}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase font-bold text-muted-foreground">
                            {ver.change_type}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-foreground mt-1 truncate">
                          {ver.change_summary}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1 truncate">
                            <User className="size-3" />
                            <span className="truncate">{ver.created_by_name}</span>
                          </div>
                          <span className="shrink-0">
                            {new Date(ver.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Code & Diff Preview */}
              <div className="md:col-span-3 space-y-2">
                {selectedVersion ? (
                  <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                      <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                          <span>Version V{selectedVersion.version_number}</span>
                          <span className="mono text-[10px] text-muted-foreground">
                            Hash: {selectedVersion.content_hash.slice(0, 8)}
                          </span>
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Created by {selectedVersion.created_by_name} on{" "}
                          {new Date(selectedVersion.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewMode("code")}
                          className={`rounded px-2 py-1 text-xs font-semibold ${
                            viewMode === "code"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("diff")}
                          className={`rounded px-2 py-1 text-xs font-semibold ${
                            viewMode === "diff"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Diff vs Current
                        </button>

                        {selectedVersion.version_number !== currentVersionNumber && (
                          <button
                            type="button"
                            onClick={() => setConfirmRollbackVer(selectedVersion)}
                            className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-black px-2.5 py-1 text-xs font-bold shadow-sm"
                          >
                            <RotateCcw className="size-3" />
                            <span>Restore V{selectedVersion.version_number}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* View Code */}
                    {viewMode === "code" ? (
                      <pre className="mono max-h-[380px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
                        {selectedVersion.content}
                      </pre>
                    ) : (
                      /* Diff vs Current */
                      <div className="max-h-[380px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 font-mono text-[11px]">
                        {computeLineDiff(selectedVersion.content, currentContent).map((diff, idx) => (
                          <div
                            key={idx}
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
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Modal for Safe Rollback (Requirement #19) */}
        {confirmRollbackVer && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-2.5 text-amber-500 font-bold text-sm">
                <RotateCcw className="size-5 shrink-0" />
                <span>Confirm Safe Version Restoration</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-foreground font-semibold">
                  Restore file to historical version <code className="mono text-primary font-bold">V{confirmRollbackVer.version_number}</code>?
                </p>
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                  <p>
                    ✓ <b>Non-destructive restoration:</b> This action will create a <b>NEW shared version</b> (e.g. V{(history[0]?.version_number ?? 0) + 1}) matching V{confirmRollbackVer.version_number}'s code.
                  </p>
                  <p>
                    ✓ <b>Zero history lost:</b> All previous versions and logs remain completely intact and recoverable.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setConfirmRollbackVer(null)}
                  disabled={isRollingBack}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRollback}
                  disabled={isRollingBack}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isRollingBack ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  <span>Confirm Restore</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
