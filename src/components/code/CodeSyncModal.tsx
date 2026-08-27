import { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Diff,
  FileCode2,
  GitMerge,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { CopyButton, RoleBadge, StatusPill } from "@/components/hacksync/primitives";
import { codeSyncService, type CodeSyncPreviewResult } from "@/lib/services/codesync.service";
import type {
  Workspace,
  MemberFile,
  CodeSyncPreviewItem,
  CodeSyncConflict,
  Role,
  Area,
} from "@/lib/hacksync/types";

interface CodeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
  memberFiles: MemberFile[];
  onSyncCompleted: () => void;
  currentUserName: string;
  currentUserRole: Role;
}

interface ConflictResolution {
  choice: "versionA" | "versionB" | "manual";
  customContent?: string;
}

export function CodeSyncModal({
  isOpen,
  onClose,
  workspace,
  memberFiles,
  onSyncCompleted,
  currentUserName,
  currentUserRole,
}: CodeSyncModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conflict resolutions state: map of path -> resolution
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});

  // Active conflict in diff view
  const [activeConflictPath, setActiveConflictPath] = useState<string | null>(null);
  const [manualMergeText, setManualMergeText] = useState<string>("");

  // Build the live preview diff
  const preview: CodeSyncPreviewResult = useMemo(() => {
    return codeSyncService.buildCodeSyncPreview(
      workspace.project.id,
      memberFiles,
      workspace.codeNodes,
      workspace.members,
    );
  }, [workspace.project.id, memberFiles, workspace.codeNodes, workspace.members]);

  if (!isOpen) return null;

  // Check unresolved conflicts
  const unresolvedConflictsCount = preview.conflicts.filter(
    (c) => !resolutions[c.path],
  ).length;

  const handleResolveConflict = (
    path: string,
    choice: "versionA" | "versionB" | "manual",
    customContent?: string,
  ) => {
    const res: ConflictResolution = { choice };
    if (customContent !== undefined) {
      res.customContent = customContent;
    }
    setResolutions((prev) => ({
      ...prev,
      [path]: res,
    }));
    setActiveConflictPath(null);
  };

  const handleExecuteSync = async () => {
    try {
      setIsExecuting(true);
      setError(null);

      if (unresolvedConflictsCount > 0) {
        setError(`Please resolve the ${unresolvedConflictsCount} conflict(s) before synchronizing.`);
        setIsExecuting(false);
        return;
      }

      // Collect all resolved items to merge
      const resolvedItems: {
        path: string;
        content: string;
        area: Area;
        ownerRole: Role;
        language: string;
      }[] = [];

      const processed = new Set<string>();

      for (const item of preview.items) {
        if (processed.has(item.path)) continue;
        processed.add(item.path);

        const conflictRes = resolutions[item.path];
        if (conflictRes) {
          const conflict = preview.conflicts.find((c) => c.path === item.path);
          if (conflict) {
            let finalContent = conflict.fileA.content || "";
            if (conflictRes.choice === "versionB") {
              finalContent = conflict.fileB.content || "";
            } else if (conflictRes.choice === "manual" && conflictRes.customContent) {
              finalContent = conflictRes.customContent;
            }

            resolvedItems.push({
              path: item.path,
              content: finalContent,
              area: item.area,
              ownerRole: item.ownerRole,
              language: item.language,
            });
            continue;
          }
        }

        resolvedItems.push({
          path: item.path,
          content: item.content || "",
          area: item.area,
          ownerRole: item.ownerRole,
          language: item.language,
        });
      }

      await codeSyncService.executeCodeSync(
        workspace.project.id,
        resolvedItems,
        currentUserName,
        currentUserRole,
      );

      setSyncSuccess(true);
      setTimeout(() => {
        onSyncCompleted();
        onClose();
        setSyncSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CodeSync failed to complete.");
    } finally {
      setIsExecuting(false);
    }
  };

  const activeConflict = preview.conflicts.find((c) => c.path === activeConflictPath);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-500/20 text-amber-500">
              <Zap className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>CodeSync — Unified Workspace Merge</span>
                <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {workspace.project.name}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Aggregates individual team members' staged files into the canonical project codebase.
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

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {syncSuccess ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center space-y-3 animate-in zoom-in-95">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="size-6" />
              </div>
              <h4 className="text-base font-bold text-foreground">CodeSync Completed Successfully!</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                All staged files have been merged into the shared codebase. Your teammates can now view the updated project tree.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-border bg-background p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Total Files</span>
                  <p className="mono text-lg font-bold text-foreground">{preview.stats.totalFiles}</p>
                </div>
                <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-success">+ Added</span>
                  <p className="mono text-lg font-bold text-success">+{preview.stats.addedCount}</p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-amber-500">~ Modified</span>
                  <p className="mono text-lg font-bold text-amber-500">{preview.stats.modifiedCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Unchanged</span>
                  <p className="mono text-lg font-bold text-muted-foreground">{preview.stats.unchangedCount}</p>
                </div>
                <div className={`rounded-xl border p-3 text-center ${
                  preview.stats.conflictCount > 0
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-background text-muted-foreground"
                }`}>
                  <span className="text-[10px] uppercase font-semibold">Conflicts</span>
                  <p className="mono text-lg font-bold">{preview.stats.conflictCount}</p>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive font-medium">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Conflict Radar Section (if any) */}
              {preview.conflicts.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-destructive font-bold text-xs">
                      <AlertTriangle className="size-4" />
                      <span>{preview.conflicts.length} Path Conflict(s) Detected</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {unresolvedConflictsCount === 0 ? (
                        <span className="text-success font-semibold flex items-center gap-1">
                          <Check className="size-3" /> All Conflicts Resolved
                        </span>
                      ) : (
                        <span className="text-destructive font-semibold">
                          {unresolvedConflictsCount} unresolved
                        </span>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Multiple team members modified the same file path. Choose which version to preserve or perform a manual merge:
                  </p>

                  <div className="space-y-2">
                    {preview.conflicts.map((conflict) => {
                      const res = resolutions[conflict.path];
                      const isComparing = activeConflictPath === conflict.path;
                      return (
                        <div
                          key={conflict.path}
                          className="rounded-lg border border-border bg-background p-3 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="mono text-xs font-bold text-foreground">
                              {conflict.path}
                            </span>
                            {res ? (
                              <span className="rounded bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">
                                Resolved: {res.choice}
                              </span>
                            ) : (
                              <span className="rounded bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                                Requires Resolution
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolveConflict(conflict.path, "versionA")}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                res?.choice === "versionA"
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border bg-secondary hover:bg-accent text-foreground"
                              }`}
                            >
                              Keep Version A ({conflict.fileA.owner_role || "Owner"})
                            </button>

                            <button
                              type="button"
                              onClick={() => handleResolveConflict(conflict.path, "versionB")}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                res?.choice === "versionB"
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border bg-secondary hover:bg-accent text-foreground"
                              }`}
                            >
                              Keep Version B ({conflict.fileB.owner_role || "Member"})
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveConflictPath(isComparing ? null : conflict.path);
                                setManualMergeText(conflict.fileA.content || conflict.fileB.content || "");
                              }}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                            >
                              <Diff className="inline size-3 mr-1" />
                              {isComparing ? "Hide Diff" : "Side-by-Side Diff"}
                            </button>
                          </div>

                          {/* Side-by-side comparison drawer */}
                          {isComparing && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 pt-3 border-t border-border">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-semibold">
                                  <span>Version A ({conflict.fileA.owner_role})</span>
                                  <span className="text-muted-foreground">{new Date(conflict.fileA.last_modified).toLocaleTimeString()}</span>
                                </div>
                                <pre className="mono max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                                  {conflict.fileA.content || "(empty)"}
                                </pre>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-semibold">
                                  <span>Version B ({conflict.fileB.owner_role})</span>
                                  <span className="text-muted-foreground">{new Date(conflict.fileB.last_modified).toLocaleTimeString()}</span>
                                </div>
                                <pre className="mono max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                                  {conflict.fileB.content || "(empty)"}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Track-by-track breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Layers className="size-3.5 text-primary" /> Track-by-Track Synchronization Preview
                </h4>

                {(["frontend", "backend", "database", "shared"] as Area[]).map((area) => {
                  const trackFiles = preview.trackBreakdown[area];
                  if (trackFiles.length === 0) return null;
                  return (
                    <div key={area} className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs capitalize text-foreground flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-primary" />
                          {area} Track ({trackFiles.length} files)
                        </span>
                      </div>

                      <ul className="divide-y divide-border/60">
                        {trackFiles.map((file) => (
                          <li
                            key={file.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`mono font-bold text-[11px] ${
                                  file.changeType === "added"
                                    ? "text-success"
                                    : file.changeType === "modified"
                                      ? "text-amber-500"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {file.changeType === "added"
                                  ? "+"
                                  : file.changeType === "modified"
                                    ? "~"
                                    : "✓"}
                              </span>
                              <span className="mono truncate text-foreground">{file.path}</span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px]">
                              <RoleBadge role={file.ownerRole} />
                              <span className="text-muted-foreground">{file.ownerName}</span>
                              <span className={`font-semibold uppercase rounded px-1.5 py-0.5 ${
                                file.changeType === "added"
                                  ? "bg-success/20 text-success"
                                  : file.changeType === "modified"
                                    ? "bg-amber-500/20 text-amber-500"
                                    : "bg-muted text-muted-foreground"
                              }`}>
                                {file.changeType}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!syncSuccess && (
          <div className="flex items-center justify-between border-t border-border p-4 bg-muted/20">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExecuteSync}
              disabled={isExecuting || unresolvedConflictsCount > 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-md transition-opacity disabled:opacity-40"
            >
              {isExecuting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Zap className="size-3.5" />
              )}
              <span>Confirm & Sync Codebase ({preview.stats.totalFiles} files)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
