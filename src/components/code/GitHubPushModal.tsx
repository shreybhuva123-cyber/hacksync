import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Github,
  KeyRound,
  Loader2,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { githubService, type GitHubRepoInfo, type GitHubPushResult } from "@/lib/services/github.service";
import { codeSyncService } from "@/lib/services/codesync.service";
import type { CodeNode, Workspace, MemberFile } from "@/lib/hacksync/types";

interface GitHubPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
  currentUserName: string;
  memberFiles?: MemberFile[];
}

export function GitHubPushModal({
  isOpen,
  onClose,
  workspace,
  currentUserName,
  memberFiles = [],
}: GitHubPushModalProps) {
  const [repoUrl, setRepoUrl] = useState(workspace.project.repo_url || "");
  const [branch, setBranch] = useState(workspace.project.default_branch || "main");
  const [commitMessage, setCommitMessage] = useState(
    `Sync synchronized project from HackSync [${workspace.project.name}]`,
  );
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);

  const [isValidating, setIsValidating] = useState(false);
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<GitHubPushResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for unresolved CodeSync conflicts or conflict markers in shared code (Requirements #23, #24)
  const conflictCheck = useMemo(() => {
    const filesWithMarkers = workspace.codeNodes.filter(
      (n) =>
        n.kind === "file" &&
        n.content &&
        (n.content.includes("<<<<<<<") || n.content.includes(">>>>>>>")),
    );

    let stagedConflictsCount = 0;
    if (memberFiles && memberFiles.length > 0) {
      try {
        const preview = codeSyncService.buildCodeSyncPreview(
          workspace.project.id,
          memberFiles,
          workspace.codeNodes,
          workspace.members,
        );
        stagedConflictsCount = preview.conflicts.length;
      } catch (err) {
        console.warn("Error running conflict check for GitHub Push", err);
      }
    }

    const hasConflicts = stagedConflictsCount > 0 || filesWithMarkers.length > 0;
    return {
      hasConflicts,
      stagedConflictsCount,
      markerFilesCount: filesWithMarkers.length,
      filesWithMarkers: filesWithMarkers.map((f) => f.path),
    };
  }, [workspace.codeNodes, workspace.members, workspace.project.id, memberFiles]);

  // Aggregate contributors to provide automated commit attribution
  const contributors = useMemo(() => {
    const set = new Set<string>();
    for (const n of workspace.codeNodes) {
      if (n.contributors) {
        for (const c of n.contributors) if (c) set.add(c);
      }
      if (n.last_synced_by) set.add(n.last_synced_by);
    }
    return Array.from(set);
  }, [workspace.codeNodes]);

  useEffect(() => {
    if (contributors.length > 0) {
      setCommitMessage(`CodeSync: Merged contributions from ${contributors.join(", ")}`);
    }
  }, [contributors]);

  // Load stored GitHub token from session storage if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("hacksync_github_pat");
      if (stored) setToken(stored);
    }
  }, []);

  if (!isOpen) return null;

  const fileNodes = workspace.codeNodes.filter((n) => n.kind === "file");

  const handleValidateRepo = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    try {
      setIsValidating(true);
      setError(null);
      const info = await githubService.validateRepository(repoUrl, token);
      setRepoInfo(info);
      if (info.defaultBranch) setBranch(info.defaultBranch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate repository.");
      setRepoInfo(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("GitHub Personal Access Token is required to authenticate and push code.");
      return;
    }
    if (!repoUrl.trim()) {
      setError("Repository URL is required.");
      return;
    }

    try {
      setIsPushing(true);
      setError(null);

      // Store in session storage if user chose to remember for session
      if (rememberToken && typeof window !== "undefined") {
        sessionStorage.setItem("hacksync_github_pat", token.trim());
      }

      const res = await githubService.pushSynchronizedProjectToGitHub({
        projectId: workspace.project.id,
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || "main",
        commitMessage: commitMessage.trim() || "Sync project from HackSync",
        files: workspace.codeNodes,
        token: token.trim(),
        authorName: currentUserName,
      });

      setPushResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub push failed.");
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-foreground/10 text-foreground">
              <Github className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>Push Synchronized Project to GitHub</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Pushes the complete synchronized codebase ({fileNodes.length} files) to your remote repository.
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {pushResult ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center space-y-4 animate-in zoom-in-95">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="size-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">
                  Successfully Pushed to GitHub!
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Synchronized {pushResult.filesCount} files to branch <code className="mono text-foreground">{pushResult.branch}</code> with commit <code className="mono text-primary font-bold">{pushResult.commitSha.slice(0, 7)}</code>.
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <a
                  href={pushResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <span>Open GitHub Commit</span>
                  <ExternalLink className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePush} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive font-medium">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* GitHub Repository Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    GitHub Repository <span className="text-destructive">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleValidateRepo}
                    disabled={isValidating || !repoUrl.trim()}
                    className="text-[11px] text-primary hover:underline font-medium disabled:opacity-50"
                  >
                    {isValidating ? "Validating..." : "Validate Repository"}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setRepoInfo(null);
                    }}
                    placeholder="https://github.com/username/project.git"
                    className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary text-foreground"
                  />
                </div>
                {repoInfo && (
                  <div className="flex items-center gap-1.5 text-[11px] text-success font-medium">
                    <Check className="size-3" />
                    <span>Validated: {repoInfo.fullName} ({repoInfo.isPrivate ? "Private" : "Public"})</span>
                  </div>
                )}
              </div>

              {/* Branch and Commit Message */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-1">
                  <label className="block text-xs font-semibold text-foreground">
                    Target Branch
                  </label>
                  <input
                    type="text"
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary text-foreground"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-foreground">
                    Commit Message
                  </label>
                  <input
                    type="text"
                    required
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Sync project from HackSync"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary text-foreground"
                  />
                </div>
              </div>

              {/* GitHub Token Input */}
              <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="size-3.5 text-primary" />
                    <span>Personal Access Token (PAT)</span>
                    <span className="text-destructive">*</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground">Never stored permanently</span>
                </div>

                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    className="mono w-full rounded-lg border border-input bg-background pr-10 pl-3 py-2 text-xs outline-none focus:border-primary text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  >
                    {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Create a token with <code className="font-mono text-primary font-bold">repo</code> permissions at{" "}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    github.com/settings/tokens
                  </a>.
                </p>
              </div>

              {/* Conflict Blocking Banner (Requirements #23, #24) */}
              {conflictCheck.hasConflicts && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
                  <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="font-bold text-destructive">
                      GitHub Push Blocked: Unresolved CodeSync Conflicts
                    </h5>
                    <p className="text-foreground/80 leading-relaxed text-[11px]">
                      {conflictCheck.stagedConflictsCount > 0 && (
                        <span>
                          There {conflictCheck.stagedConflictsCount === 1 ? "is" : "are"}{" "}
                          <b>{conflictCheck.stagedConflictsCount}</b> active file conflict
                          {conflictCheck.stagedConflictsCount === 1 ? "" : "s"} across team members.{" "}
                        </span>
                      )}
                      {conflictCheck.markerFilesCount > 0 && (
                        <span>
                          <b>{conflictCheck.markerFilesCount}</b> file
                          {conflictCheck.markerFilesCount === 1 ? "" : "s"} in the shared codebase contain unresolved merge conflict markers (<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>).
                        </span>
                      )}
                      {" "}Please resolve all conflicts using CodeSync before pushing to GitHub to prevent corrupting remote branch history.
                    </p>
                  </div>
                </div>
              )}

              {/* Files Summary */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Synchronized Files Ready to Push:</span>
                <span className="mono font-bold text-foreground">{fileNodes.length} files</span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPushing || conflictCheck.hasConflicts}
                  title={conflictCheck.hasConflicts ? "Push is blocked until all conflicts are resolved" : undefined}
                  className={`flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-bold transition-opacity shadow-md ${
                    conflictCheck.hasConflicts
                      ? "bg-muted text-muted-foreground cursor-not-allowed border border-border opacity-70"
                      : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  }`}
                >
                  {isPushing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : conflictCheck.hasConflicts ? (
                    <AlertTriangle className="size-3.5 text-destructive" />
                  ) : (
                    <UploadCloud className="size-3.5" />
                  )}
                  <span>
                    {conflictCheck.hasConflicts
                      ? "Push Blocked (Resolve Conflicts First)"
                      : `Push ${fileNodes.length} Files to GitHub`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
