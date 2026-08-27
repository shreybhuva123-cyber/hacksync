import { useState, useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Folder,
  FolderKanban,
  GitBranch,
  Github,
  KeyRound,
  Laptop,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { WorkspaceView } from "@/components/hacksync/WorkspaceView";
import {
  CopyButton,
  PageHeader,
  Panel,
  PanelHeader,
  RoleBadge,
  StatusPill,
} from "@/components/hacksync/primitives";
import { useAuth } from "@/hooks/useAuth";
import { useActiveProjectId, setActiveProjectId } from "@/hooks/useActiveProject";
import { logActivity, useRowDelete, useRowInsert, useRowMutation } from "@/lib/hacksync/workspace";
import { membersService } from "@/lib/services/members.service";
import { DEFAULT_AI_SETTINGS, type AISettings, type LLMProviderType } from "@/lib/hacksync/llm-provider";
import { canManageMembers, canDeleteProject } from "@/lib/hacksync/permissions";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import { InviteTeammatesModal } from "@/components/projects/InviteTeammatesModal";
import {
  pickDirectoryUniversal,
  pickLocalDirectory,
  scanLocalDirectory,
  getStoredDirectoryState,
  saveStoredDirectoryState,
  setActiveDirectoryHandle,
  type LocalDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import { supabase } from "@/integrations/supabase/client";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Project Settings & Workspace Control — HackSync" },
      {
        name: "description",
        content:
          "Full project configuration, team invites, local directory binding, AI providers, and administrative controls.",
      },
      { property: "og:title", content: "Project Settings & Workspace Control — HackSync" },
      { property: "og:description", content: "Personal project settings, invite codes, and team control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return <WorkspaceView>{(ws) => <SettingsBody ws={ws} />}</WorkspaceView>;
}

type TabKey = "general" | "team" | "local" | "ai" | "danger";

function SettingsBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [, setActiveProject] = useActiveProjectId();
  const update = useRowMutation();
  const insert = useRowInsert();
  const remove = useRowDelete();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // Determine user role in this project
  const callerMember = ws.members.find((m) => m.user_id === user?.id);
  const isCreator = ws.project.created_by === user?.id;
  const callerRole: Role = callerMember?.role ?? (isCreator ? "owner" : "member");
  const isOwner = callerRole === "owner" || isCreator;
  const isLead = callerRole === "lead" || isOwner;

  // General Settings Form
  const [name, setName] = useState(ws.project.name);
  const [description, setDescription] = useState(ws.project.description || "");
  const [repoUrl, setRepoUrl] = useState(ws.project.repo_url || "");
  const [defaultBranch, setDefaultBranch] = useState(ws.project.default_branch || "main");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalFeedback, setGeneralFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync state with incoming workspace updates
  useEffect(() => {
    setName(ws.project.name);
    setDescription(ws.project.description || "");
    setRepoUrl(ws.project.repo_url || "");
    setDefaultBranch(ws.project.default_branch || "main");
  }, [ws.project.name, ws.project.description, ws.project.repo_url, ws.project.default_branch]);

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setGeneralFeedback({ type: "error", text: "Project name cannot be empty." });
      return;
    }

    setIsSavingGeneral(true);
    setGeneralFeedback(null);

    update.mutate(
      {
        table: "projects",
        id: ws.project.id,
        values: {
          name: name.trim(),
          description: description.trim() || null,
          repo_url: repoUrl.trim() || null,
          default_branch: defaultBranch.trim() || "main",
        },
      },
      {
        onSuccess: () => {
          setIsSavingGeneral(false);
          setGeneralFeedback({ type: "success", text: "Project details updated successfully!" });
          void logActivity(ws.project.id, "settings", `Updated project configuration for "${name.trim()}"`);
          setTimeout(() => setGeneralFeedback(null), 3500);
        },
        onError: (err: unknown) => {
          setIsSavingGeneral(false);
          setGeneralFeedback({
            type: "error",
            text: err instanceof Error ? err.message : "Failed to update project details.",
          });
        },
      },
    );
  };

  // Regenerate Invite Code
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const handleRegenerateInviteCode = () => {
    if (!confirm("Regenerate invite code? Existing share links with the old code will no longer work.")) return;
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsRegeneratingCode(true);
    update.mutate(
      { table: "projects", id: ws.project.id, values: { invite_code: newCode } },
      {
        onSuccess: () => {
          setIsRegeneratingCode(false);
          void logActivity(ws.project.id, "settings", `Regenerated invite code to ${newCode}`);
        },
        onError: () => setIsRegeneratingCode(false),
      },
    );
  };

  // Team Member Management
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const changeRole = async (memberId: string, newRole: Role) => {
    try {
      setIsUpdatingRole(true);
      setTeamFeedback(null);
      await membersService.updateRole(memberId, newRole, callerRole);
      setEditingRole(null);
      const member = ws.members.find((m) => m.id === memberId);
      setTeamFeedback({
        type: "success",
        text: `Updated ${member?.display_name ?? "member"}'s role to ${ROLE_CONFIG[newRole].label}`,
      });
      void logActivity(
        ws.project.id,
        "settings",
        `Changed ${member?.display_name ?? "member"}'s role to ${newRole}`,
      );
      setTimeout(() => setTeamFeedback(null), 3500);
    } catch (err) {
      setTeamFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update member role.",
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const removeMember = async (memberId: string) => {
    const member = ws.members.find((m) => m.id === memberId);
    if (!confirm(`Remove ${member?.display_name ?? "this member"} from the project?`)) return;
    try {
      setTeamFeedback(null);
      await membersService.removeMember(memberId, callerRole);
      setTeamFeedback({
        type: "success",
        text: `Removed ${member?.display_name ?? "member"} from the project.`,
      });
      void logActivity(
        ws.project.id,
        "settings",
        `Removed ${member?.display_name ?? "member"} from the team`,
      );
      setTimeout(() => setTeamFeedback(null), 3500);
    } catch (err) {
      setTeamFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove member.",
      });
    }
  };

  // Local Directory State
  const [localDir, setLocalDir] = useState<LocalDirectoryState>(getStoredDirectoryState);
  const [isConnectingDir, setIsConnectingDir] = useState(false);

  const handleConnectLocalFolder = async () => {
    try {
      setIsConnectingDir(true);
      const res = await pickDirectoryUniversal();
      if (!res) {
        setIsConnectingDir(false);
        return;
      }
      const state: LocalDirectoryState = {
        connected: true,
        name: res.name,
        fileCount: res.files.length,
        lastSyncedAt: new Date().toISOString(),
        autoSync: Boolean(res.handle),
      };
      setLocalDir(state);
      saveStoredDirectoryState(state);
      setActiveDirectoryHandle(res.handle);

      // Persist newly scanned nodes into Supabase code_nodes table
      try {
        for (const f of res.files.slice(0, 40)) {
          insert.mutate({
            table: "code_nodes",
            values: {
              project_id: ws.project.id,
              path: f.path,
              parent_path: f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : null,
              kind: "file",
              area: f.area,
              owner_role:
                f.area === "frontend"
                  ? "frontend"
                  : f.area === "backend"
                    ? "backend"
                    : f.area === "database"
                      ? "database"
                      : "lead",
              status: "done",
              language: f.language,
              content: f.content || null,
            },
          });
        }
      } catch {
        // Non-blocking
      }

      void logActivity(
        ws.project.id,
        "settings",
        `Connected local folder "${res.name}" with ${res.files.length} files`,
      );
    } catch (err) {
      console.warn("Folder connect error:", err);
    } finally {
      setIsConnectingDir(false);
    }
  };

  const toggleAutoWatcher = () => {
    const next = !localDir.autoSync;
    setLocalDir((prev) => ({ ...prev, autoSync: next }));
    saveStoredDirectoryState({ autoSync: next });
  };

  // AI Settings
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [aiSaved, setAiSaved] = useState(false);

  const saveAi = (provider: LLMProviderType, model = "gemini-2.0-flash") => {
    setAiSettings({ provider, model, temperature: 0.7 });
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  // Danger Zone: Delete Project
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteProject = async () => {
    if (deleteConfirmName !== ws.project.name) {
      setDeleteError(`Please type the exact project name "${ws.project.name}" to confirm deletion.`);
      return;
    }

    try {
      setIsDeletingProject(true);
      setDeleteError(null);
      const { error } = await supabase.from("projects").delete().eq("id", ws.project.id);
      if (error) throw error;
      setActiveProject("");
      navigate({ to: "/projects" });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project.");
      setIsDeletingProject(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const inviteUrl = `${origin}/projects?join=${ws.project.invite_code}`;

  return (
    <>
      <PageHeader
        eyebrow="project settings & control"
        title="Project Settings"
        description="Manage project metadata, invite teammates, configure live folder sync, AI models, and access permissions."
        actions={
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            <UserPlus className="size-3.5" />
            <span>Invite Teammates</span>
          </button>
        }
      />

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === "general"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <SettingsIcon className="size-3.5" />
          General & Details
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === "team"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Users className="size-3.5" />
          Team & Invites
          <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px]">
            {ws.members.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("local")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === "local"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Laptop className="size-3.5" />
          Local Folder Sync
          {localDir.connected ? (
            <span className="size-2 rounded-full bg-success animate-pulse" />
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === "ai"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Bot className="size-3.5" />
          AI & Intelligence
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("danger")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === "danger"
              ? "bg-destructive text-destructive-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          }`}
        >
          <ShieldAlert className="size-3.5" />
          Danger Zone
        </button>
      </div>

      {/* ─── TAB 1: General Project Configuration ─── */}
      {activeTab === "general" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2 p-5 space-y-5">
            <PanelHeader
              title="Project Identity & Information"
              subtitle="Update your project name, repository link, and branching strategy."
              icon={<SettingsIcon className="size-4 text-primary" />}
            />

            {generalFeedback && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium ${
                  generalFeedback.type === "success"
                    ? "bg-success/15 text-success border border-success/30"
                    : "bg-destructive/15 text-destructive border border-destructive/30"
                }`}
              >
                {generalFeedback.type === "success" ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0" />
                )}
                <span>{generalFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveGeneral} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Project Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CampusMesh"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Project Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what your hackathon team is building..."
                  className="w-full rounded-lg border border-input bg-background p-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Github className="size-3.5 text-muted-foreground" /> Git Repository URL
                  </label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/team/project"
                    className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <GitBranch className="size-3.5 text-muted-foreground" /> Default Branch
                  </label>
                  <input
                    type="text"
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    placeholder="main"
                    className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity"
                >
                  {isSavingGeneral ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </Panel>

          {/* Quick Summary Card */}
          <Panel className="p-5 space-y-4 self-start">
            <PanelHeader title="Project Summary" icon={<FolderKanban className="size-4 text-primary" />} />
            <dl className="divide-y divide-border text-xs">
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Project ID</dt>
                <dd className="mono text-[11px] truncate max-w-36">{ws.project.id}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Created By</dt>
                <dd className="text-foreground">{isCreator ? "You (Owner)" : "Team Teammate"}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Your Role</dt>
                <dd><RoleBadge role={callerRole} /></dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">API Contracts</dt>
                <dd className="font-semibold text-foreground">{ws.contracts.length}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Database Tables</dt>
                <dd className="font-semibold text-foreground">{ws.tables.length}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Team Size</dt>
                <dd className="font-semibold text-foreground">{ws.members.length} members</dd>
              </div>
            </dl>
          </Panel>
        </div>
      )}

      {/* ─── TAB 2: Team & Invitations ─── */}
      {activeTab === "team" && (
        <div className="space-y-6">
          {/* Invite Banner Card */}
          <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" /> Invite Hackathon Teammates
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Share the universal invite code or send the 1-click link to your team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
              >
                <UserPlus className="size-3.5" />
                <span>Open Invite Modal</span>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg bg-background/80 border border-border p-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Invite Code
                  </span>
                  <div className="mono text-xl font-extrabold text-foreground mt-0.5">
                    {ws.project.invite_code}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <CopyButton value={ws.project.invite_code} label="Copy" />
                  {isOwner && (
                    <button
                      type="button"
                      onClick={handleRegenerateInviteCode}
                      disabled={isRegeneratingCode}
                      title="Generate new invite code"
                      className="rounded-md border border-border bg-secondary p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className={`size-3.5 ${isRegeneratingCode ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-background/80 border border-border p-3">
                <div className="min-w-0 flex-1 mr-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    1-Click Join Link
                  </span>
                  <div className="mono text-xs text-muted-foreground truncate mt-0.5">
                    {inviteUrl}
                  </div>
                </div>
                <CopyButton value={inviteUrl} label="Copy Link" />
              </div>
            </div>
          </div>

          {/* Team Roster Panel */}
          <Panel className="p-5 space-y-4">
            <PanelHeader
              title={`Team Roster (${ws.members.length})`}
              subtitle="Click any member's role badge to adjust their permissions (Owner / Lead privileges required)."
              icon={<Users className="size-4 text-primary" />}
            />

            {teamFeedback && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium ${
                  teamFeedback.type === "success"
                    ? "bg-success/15 text-success border border-success/30"
                    : "bg-destructive/15 text-destructive border border-destructive/30"
                }`}
              >
                {teamFeedback.type === "success" ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0" />
                )}
                <span>{teamFeedback.text}</span>
              </div>
            )}

            <ul className="divide-y divide-border border rounded-lg overflow-hidden bg-card">
              {ws.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="relative grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {m.display_name?.slice(0, 2).toUpperCase() || "U"}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background ${
                          m.online ? "bg-success" : "bg-muted-foreground"
                        }`}
                      />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">
                          {m.display_name}
                        </span>
                        {m.user_id === user?.id && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {m.email || "No email provided"}
                      </p>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    {/* Role changer button */}
                    {editingRole === m.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {ROLES.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => changeRole(m.id, r)}
                            disabled={isUpdatingRole}
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              r === m.role
                                ? "bg-primary text-primary-foreground font-bold"
                                : "bg-secondary text-secondary-foreground hover:bg-accent"
                            }`}
                          >
                            {ROLE_CONFIG[r].label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditingRole(null)}
                          className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (isLead) setEditingRole(m.id);
                        }}
                        title={isLead ? "Click to change role" : "Role assigned"}
                        className={isLead ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}
                      >
                        <RoleBadge role={m.role} />
                      </button>
                    )}

                    <StatusPill tone={m.online ? "success" : "neutral"} dot={false}>
                      {m.online ? "Online" : "Offline"}
                    </StatusPill>

                    {/* Remove Member Button */}
                    {isLead && m.user_id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        title="Remove member from project"
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {/* ─── TAB 3: Local Folder Sync ─── */}
      {activeTab === "local" && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <PanelHeader
              title="Vibe Coding Local Disk Integration"
              subtitle="Connect your actual local repository folder to enable two-way sync with VS Code, Cursor, or WebStorm."
              icon={<Laptop className="size-4 text-primary" />}
            />

            <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Folder className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      {localDir.connected ? `Connected: ${localDir.name}` : "No Local Folder Bound"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {localDir.connected
                        ? `Last synced at ${new Date(localDir.lastSyncedAt || Date.now()).toLocaleTimeString()} · ${localDir.fileCount} files scanned`
                        : "Use Chrome or Edge to bind a local folder via the native File System Access API."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectLocalFolder}
                    disabled={isConnectingDir}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity"
                  >
                    {isConnectingDir ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Folder className="size-3.5" />
                    )}
                    <span>{localDir.connected ? "Switch Local Folder" : "Connect Local Folder"}</span>
                  </button>
                </div>
              </div>

              {localDir.connected && (
                <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-foreground">
                    <span className="font-semibold">Auto-Watcher:</span>
                    <span className="text-muted-foreground">
                      Automatically re-scans modified local files every 4 seconds.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAutoWatcher}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      localDir.autoSync
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-secondary text-muted-foreground border border-border"
                    }`}
                  >
                    <Radio className="size-3.5" />
                    <span>{localDir.autoSync ? "Watcher Active" : "Watcher Paused"}</span>
                  </button>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* ─── TAB 4: AI & Intelligence ─── */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <PanelHeader
              title="AI Intelligence & Gateway Configuration"
              subtitle="Choose the default AI model used for code explanations, bug hunting, API generation, and pitch decks."
              icon={<Bot className="size-4 text-primary" />}
              actions={
                <StatusPill tone="primary">
                  {aiSettings.provider === "gemini"
                    ? "Gemini 2.0 Flash"
                    : aiSettings.provider === "openai"
                      ? "GPT-4o Mini"
                      : "Built-in Expert"}
                </StatusPill>
              }
            />

            {aiSaved && (
              <div className="flex items-center gap-2 rounded-lg bg-success/15 border border-success/30 p-3 text-xs text-success font-medium">
                <Check className="size-4 shrink-0" />
                <span>AI model preferences saved for this workspace!</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => saveAi("builtin")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "builtin"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-card hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" /> Built-in Offline Expert
                </div>
                <p className="text-[11px] opacity-80 mt-1.5">
                  Deterministic rule engine with zero API keys and instant response times.
                </p>
              </button>

              <button
                type="button"
                onClick={() => saveAi("gemini", "gemini-2.0-flash")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "gemini"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-card hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Bot className="size-4 text-primary" /> Google Gemini 2.0 Flash
                </div>
                <p className="text-[11px] opacity-80 mt-1.5">
                  High-speed multimodal reasoning and automated code generation via server gateway.
                </p>
              </button>

              <button
                type="button"
                onClick={() => saveAi("openai", "gpt-4o-mini")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "openai"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-card hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Bot className="size-4 text-primary" /> OpenAI GPT-4o Mini
                </div>
                <p className="text-[11px] opacity-80 mt-1.5">
                  Structured logic and architecture refactoring recommendations.
                </p>
              </button>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <strong className="text-foreground">Zero Client API Key Leakage:</strong> All AI
                calls are securely proxied through the server gateway with token-bucket rate limiting
                and audit logging.
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ─── TAB 5: Danger Zone ─── */}
      {activeTab === "danger" && (
        <div className="space-y-6">
          <Panel className="p-5 border-destructive/40 bg-destructive/5 space-y-4">
            <PanelHeader
              title="Danger Zone"
              subtitle="Irreversible workspace actions. Proceed with caution."
              icon={<ShieldAlert className="size-4 text-destructive" />}
            />

            {deleteError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive font-medium">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {isOwner ? (
              <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-destructive">
                      Permanently Delete Project "{ws.project.name}"
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This will permanently remove the project, all API contracts, database schemas, tasks, and member records. This action cannot be undone.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="block text-xs font-medium text-foreground">
                    To confirm, please type{" "}
                    <strong className="text-destructive font-mono">{ws.project.name}</strong> below:
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder={ws.project.name}
                      className="mono flex-1 max-w-sm rounded-lg border border-destructive/40 bg-background px-3 py-2 text-xs outline-none focus:border-destructive"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      disabled={isDeletingProject || deleteConfirmName !== ws.project.name}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {isDeletingProject ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      <span>Delete Workspace</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Leave This Workspace</h4>
                <p className="text-xs text-muted-foreground">
                  You are currently a team member on this project. Leaving will remove your access.
                </p>
                {callerMember && (
                  <button
                    type="button"
                    onClick={() => removeMember(callerMember.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <LogOut className="size-3.5" />
                    <span>Leave Project</span>
                  </button>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Invite Teammates Modal */}
      <InviteTeammatesModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        workspace={ws}
      />
    </>
  );
}
