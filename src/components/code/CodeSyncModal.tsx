import { useState, useMemo, useEffect } from "react";
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
  Split,
  Eye,
  Edit3,
  FileText,
  ShieldCheck,
  History,
} from "lucide-react";
import { CopyButton, RoleBadge, StatusPill } from "@/components/hacksync/primitives";
import { codeSyncService, type CodeSyncPreviewResult } from "@/lib/services/codesync.service";
import { computeLineDiff } from "@/lib/hacksync/merge-engine";
import type {
  Workspace,
  MemberFile,
  CodeSyncPreviewItem,
  CodeSyncConflict,
  Role,
  Area,
  ConflictResolution,
  SyncSession,
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
  const [completedSession, setCompletedSession] = useState<SyncSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Conflict resolutions state: map of path -> resolution
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});

  // Active conflict in diff view
  const [activeConflictPath, setActiveConflictPath] = useState<string | null>(null);
  const [manualMergeText, setManualMergeText] = useState<string>("");
  const [diffViewMode, setDiffViewMode] = useState<"side_by_side" | "line_diff">("side_by_side");

  // Build the live preview diff with 3-way merge engine
  const preview: CodeSyncPreviewResult = useMemo(() => {
    return codeSyncService.buildCodeSyncPreview(
      workspace.project.id,
      memberFiles,
      workspace.codeNodes,
      workspace.members,
    );
  }, [workspace.project.id, memberFiles, workspace.codeNodes, workspace.members]);

  // Set initial conflict editor content when active conflict changes
  useEffect(() => {
    if (activeConflictPath) {
      const conflict = preview.conflicts.find((c) => c.path === activeConflictPath);
      if (conflict) {
        const existingRes = resolutions[activeConflictPath];
        if (existingRes?.customContent) {
          setManualMergeText(existingRes.customContent);
        } else if (conflict.rawConflictMarkers) {
          setManualMergeText(conflict.rawConflictMarkers);
        } else {
          setManualMergeText(conflict.fileA.content || conflict.fileB.content || "");
        }
      }
    }
  }, [activeConflictPath, preview.conflicts, resolutions]);

  if (!isOpen) return null;

  // Check unresolved conflicts count
  const unresolvedConflictsCount = preview.conflicts.filter(
    (c) => !resolutions[c.path],
  ).length;

  const handleResolveConflict = (
    path: string,
    choice: ConflictResolution["choice"],
    customContent?: string,
  ) => {
    const res: ConflictResolution = { choice };
    if (customContent !== undefined) {
      res.customContent = customContent;
    } else if (choice === "manual") {
      res.customContent = manualMergeText;
    }
    setResolutions((prev) => ({
      ...prev,
      [path]: res,
    }));
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
        contributors?: string[] | undefined;
        changeType?: "added" | "modified" | "auto_merged" | "unchanged" | "deleted" | undefined;
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
            } else if (conflictRes.choice === "use_base") {
              finalContent = conflict.baseContent || "";
            } else if (conflictRes.choice === "combine") {
              finalContent = `${conflict.fileA.content || ""}\n\n// --- Combined Changes ---\n\n${conflict.fileB.content || ""}`;
            } else if (conflictRes.choice === "manual" && conflictRes.customContent) {
              finalContent = conflictRes.customContent;
            } else if (conflictRes.choice === "keep_deleted") {
              finalContent = "";
            } else if (conflictRes.choice === "keep_modified") {
              finalContent = conflict.fileB.is_deleted ? (conflict.fileA.content || "") : (conflict.fileB.content || "");
            }

            resolvedItems.push({
              path: item.path,
              content: finalContent,
              area: item.area,
              ownerRole: item.ownerRole,
              language: item.language,
              contributors: item.contributors || [item.ownerName],
              changeType: "modified",
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
          contributors: item.contributors,
          changeType: item.changeType,
        });
      }

      const session = await codeSyncService.executeCodeSync(
        workspace.project.id,
        resolvedItems,
        currentUserName,
        currentUserRole,
        {
          autoMergedCount: preview.stats.autoMergedCount,
          conflictsResolvedCount: Object.keys(resolutions).length,
        },
      );

      setCompletedSession(session);
      setSyncSuccess(true);
      onSyncCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CodeSync failed to complete.");
    } finally {
      setIsExecuting(false);
    }
  };

  const activeConflict = preview.conflicts.find((c) => c.path === activeConflictPath);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-500/20 text-amber-500">
              <GitMerge className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>CodeSync — Git-like 3-Way Merge Engine</span>
                <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {workspace.project.name}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Reconciles Base versions, auto-merges multi-member changes, and provides side-by-side conflict resolution.
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
          {syncSuccess && completedSession ? (
            /* Requirement #32: CodeSync Complete Summary Report */
            <div className="rounded-xl border border-success/40 bg-success/5 p-8 text-center space-y-4 animate-in zoom-in-95">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="size-7" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-foreground">
                  CodeSync #{completedSession.session_number || 1} Completed Successfully!
                </h4>
                <p className="text-xs text-muted-foreground max-w-lg mx-auto mt-1">
                  All staged changes have been reconciled using 3-way merge and committed to the shared project codebase with immutable version history.
                </p>
              </div>

              {/* Stats Grid in Summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-2xl mx-auto pt-2">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Synchronized</span>
                  <p className="mono text-lg font-bold text-foreground">{completedSession.files_count} files</p>
                </div>
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-success">Auto-Merged</span>
                  <p className="mono text-lg font-bold text-success">+{completedSession.auto_merged_count || 0} files</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Resolved</span>
                  <p className="mono text-lg font-bold text-foreground">{completedSession.conflicts_resolved} conflicts</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-primary">Contributors</span>
                  <p className="mono text-sm font-bold text-primary truncate">
                    {completedSession.contributors?.join(", ") || currentUserName}
                  </p>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-primary px-6 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-md transition-opacity"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
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
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-center">
                  <span className="text-[10px] uppercase font-semibold text-primary">⚡ Auto-Merged</span>
                  <p className="mono text-lg font-bold text-primary">+{preview.stats.autoMergedCount}</p>
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

              {/* Conflict Radar & Resolution Section (Requirement #7, #8, #9, #10) */}
              {preview.conflicts.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-destructive font-bold text-xs">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>{preview.conflicts.length} Overlapping Conflict(s) Require Human Decision</span>
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
                    Incompatible modifications detected in the same file lines. Review the Base version, Member changes, and edit the Merged Result:
                  </p>

                  <div className="space-y-3">
                    {preview.conflicts.map((conflict) => {
                      const res = resolutions[conflict.path];
                      const isSelected = activeConflictPath === conflict.path;

                      return (
                        <div
                          key={conflict.path}
                          className="rounded-xl border border-border bg-background p-4 space-y-3 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <FileCode2 className="size-4 text-destructive shrink-0" />
                              <span className="mono text-xs font-bold text-foreground">
                                {conflict.path}
                              </span>
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-semibold uppercase">
                                {conflict.conflictType.replace(/_/g, " ")}
                              </span>
                            </div>

                            {res ? (
                              <span className="rounded bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success flex items-center gap-1">
                                <Check className="size-3" /> Resolved: {res.choice}
                              </span>
                            ) : (
                              <span className="rounded bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                                Requires Resolution
                              </span>
                            )}
                          </div>

                          {/* Quick Resolution Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {conflict.conflictType === "deletion_vs_modification" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(conflict.path, "keep_modified")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                    res?.choice === "keep_modified"
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-border bg-secondary hover:bg-accent text-foreground"
                                  }`}
                                >
                                  Keep Modified Version
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(conflict.path, "keep_deleted")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                    res?.choice === "keep_deleted"
                                      ? "bg-destructive text-destructive-foreground border-destructive"
                                      : "border-border bg-secondary hover:bg-accent text-foreground"
                                  }`}
                                >
                                  Keep Deleted
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(conflict.path, "versionA")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                    res?.choice === "versionA"
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-border bg-secondary hover:bg-accent text-foreground"
                                  }`}
                                >
                                  Use Version A ({conflict.fileA.owner_role || "Member A"})
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
                                  Use Version B ({conflict.fileB.owner_role || "Member B"})
                                </button>

                                {conflict.baseContent && (
                                  <button
                                    type="button"
                                    onClick={() => handleResolveConflict(conflict.path, "use_base")}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                      res?.choice === "use_base"
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border bg-secondary hover:bg-accent text-foreground"
                                    }`}
                                  >
                                    Use Base (V{conflict.baseVersionNumber || 1})
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleResolveConflict(conflict.path, "combine")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                    res?.choice === "combine"
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-border bg-secondary hover:bg-accent text-foreground"
                                  }`}
                                >
                                  Combine Both (A + B)
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setActiveConflictPath(isSelected ? null : conflict.path);
                              }}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              <Split className="inline size-3.5 mr-1" />
                              {isSelected ? "Close Diff Inspector" : "Open 3-Way Diff Inspector"}
                            </button>
                          </div>

                          {/* Side-by-Side 3-Way Comparison Drawer (Requirement #8 & #9) */}
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-border space-y-3 animate-in fade-in">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setDiffViewMode("side_by_side")}
                                    className={`rounded px-2 py-1 text-[11px] font-semibold ${
                                      diffViewMode === "side_by_side"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    Side-by-Side (Base / A / B)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDiffViewMode("line_diff")}
                                    className={`rounded px-2 py-1 text-[11px] font-semibold ${
                                      diffViewMode === "line_diff"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    Line Diff Inspection (+ / -)
                                  </button>
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  Edit the Merged Result below to resolve
                                </span>
                              </div>

                              {diffViewMode === "side_by_side" ? (
                                <div className="grid gap-2.5 grid-cols-1 md:grid-cols-3">
                                  {/* Column 1: BASE VERSION */}
                                  <div className="rounded-lg border border-border bg-card p-2.5 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] font-bold pb-1 border-b border-border">
                                      <span className="text-muted-foreground">1. BASE (V{conflict.baseVersionNumber || 1})</span>
                                      <CopyButton value={conflict.baseContent || ""} />
                                    </div>
                                    <pre className="mono max-h-44 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                      {conflict.baseContent || "(empty / new file)"}
                                    </pre>
                                  </div>

                                  {/* Column 2: MEMBER A */}
                                  <div className="rounded-lg border border-primary/30 bg-card p-2.5 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] font-bold pb-1 border-b border-border">
                                      <span className="text-primary">2. MEMBER A ({conflict.fileA.owner_role || "lead"})</span>
                                      <CopyButton value={conflict.fileA.content || ""} />
                                    </div>
                                    <pre className="mono max-h-44 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                                      {conflict.fileA.content || "(empty / deleted)"}
                                    </pre>
                                  </div>

                                  {/* Column 3: MEMBER B */}
                                  <div className="rounded-lg border border-amber-500/30 bg-card p-2.5 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] font-bold pb-1 border-b border-border">
                                      <span className="text-amber-500">3. MEMBER B ({conflict.fileB.owner_role || "member"})</span>
                                      <CopyButton value={conflict.fileB.content || ""} />
                                    </div>
                                    <pre className="mono max-h-44 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                                      {conflict.fileB.content || "(empty / deleted)"}
                                    </pre>
                                  </div>
                                </div>
                              ) : (
                                /* Line Diff View */
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-2 font-mono text-[11px]">
                                  {computeLineDiff(conflict.baseContent, conflict.fileA.content || conflict.fileB.content || "").map((diff, dIdx) => (
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
                              )}

                              {/* Editable Merged Result Area */}
                              <div className="space-y-1.5 pt-2 border-t border-border">
                                <div className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-foreground flex items-center gap-1.5">
                                    <Edit3 className="size-3.5 text-primary" />
                                    <span>MERGED RESULT (Editable)</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleResolveConflict(conflict.path, "manual", manualMergeText)}
                                    className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90"
                                  >
                                    Accept & Mark Resolved
                                  </button>
                                </div>
                                <textarea
                                  rows={6}
                                  value={manualMergeText}
                                  onChange={(e) => setManualMergeText(e.target.value)}
                                  spellCheck={false}
                                  className="mono w-full rounded-lg border border-input bg-background p-3 text-xs leading-relaxed outline-none focus:border-primary text-foreground"
                                  placeholder="// Resolve conflicts here or use quick buttons above..."
                                />
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
                  <Layers className="size-3.5 text-primary" /> Track-by-Track Reconciliation Preview
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
                            className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`mono font-bold text-[11px] ${
                                  file.changeType === "auto_merged"
                                    ? "text-primary"
                                    : file.changeType === "added"
                                      ? "text-success"
                                      : file.changeType === "modified"
                                        ? "text-amber-500"
                                        : "text-muted-foreground"
                                }`}
                              >
                                {file.changeType === "auto_merged"
                                  ? "⚡"
                                  : file.changeType === "added"
                                    ? "+"
                                    : file.changeType === "modified"
                                      ? "~"
                                      : "✓"}
                              </span>
                              <span className="mono truncate text-foreground">{file.path}</span>
                              {file.changeType === "auto_merged" && (
                                <span className="mono rounded bg-primary/15 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                                  Auto-Merged
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px]">
                              <RoleBadge role={file.ownerRole} />
                              <span className="text-muted-foreground">{file.ownerName}</span>
                              <span
                                className={`font-semibold uppercase rounded px-1.5 py-0.5 ${
                                  file.changeType === "auto_merged"
                                    ? "bg-primary/20 text-primary"
                                    : file.changeType === "added"
                                      ? "bg-success/20 text-success"
                                      : file.changeType === "modified"
                                        ? "bg-amber-500/20 text-amber-500"
                                        : "bg-muted text-muted-foreground"
                                }`}
                              >
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

            <div className="flex items-center gap-3">
              {unresolvedConflictsCount > 0 && (
                <span className="text-xs text-destructive font-medium">
                  {unresolvedConflictsCount} conflict(s) remaining
                </span>
              )}

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
          </div>
        )}
      </div>
    </div>
  );
}
