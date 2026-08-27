import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Folder,
  HardDrive,
  KeyRound,
  Laptop,
  Layers,
  Loader2,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
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
import { useActiveProjectId } from "@/hooks/useActiveProject";
import {
  logActivity,
  useRowDelete,
  useRowInsert,
  useRowMutation,
  useUserProjects,
} from "@/lib/hacksync/workspace";
import { membersService } from "@/lib/services/members.service";
import { projectsService } from "@/lib/services/projects.service";
import {
  DEFAULT_AI_SETTINGS,
  type AISettings,
  type LLMProviderType,
} from "@/lib/hacksync/llm-provider";
import { canManageMembers, canDeleteProject } from "@/lib/hacksync/permissions";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import { InviteTeammatesModal } from "@/components/projects/InviteTeammatesModal";
import {
  pickDirectoryUniversal,
  getStoredDirectoryState,
  saveStoredDirectoryState,
  setActiveDirectoryHandle,
  type LocalDirectoryState,
} from "@/lib/hacksync/local-filesystem";
import type { Workspace, Project } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/project-settings")({
  head: () => ({
    meta: [
      { title: "Project Settings & Control — HackSync" },
      {
        name: "description",
        content:
          "Manage all project configurations, switch between projects, invite teammates, configure local folder sync, and control permissions.",
      },
      { property: "og:title", content: "Project Settings & Control — HackSync" },
      {
        property: "og:description",
        content: "Select any project to configure settings, invite codes, and team roles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectSettingsPage,
});

function ProjectSettingsPage() {
  return <WorkspaceView>{(ws) => <ProjectSettingsBody ws={ws} />}</WorkspaceView>;
}

type TabKey = "general" | "team" | "local" | "ai" | "danger";

function ProjectSettingsBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeProjectId, setActiveProjectId] = useActiveProjectId();
  const { data: allProjects = [], isLoading: isProjectsLoading } = useUserProjects();
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
  const [generalFeedback, setGeneralFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
          void logActivity(
            ws.project.id,
            "settings",
            `Updated project configuration for "${name.trim()}"`,
          );
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
    if (
      !confirm(
        "Regenerate invite code? Existing share links with the old code will no longer work.",
      )
    )
      return;
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsRegeneratingCode(true);

    update.mutate(
      {
        table: "projects",
        id: ws.project.id,
        values: { invite_code: newCode },
      },
      {
        onSuccess: () => {
          setIsRegeneratingCode(false);
          void logActivity(
            ws.project.id,
            "settings",
            `Regenerated project invite code to ${newCode}`,
          );
        },
        onError: () => setIsRegeneratingCode(false),
      },
    );
  };

  // Team Management
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const changeMemberRole = async (memberId: string, targetRole: Role) => {
    try {
      setIsUpdatingRole(true);
      setTeamFeedback(null);
      await membersService.updateRole(memberId, targetRole, callerRole);
      setEditingRoleId(null);
      const member = ws.members.find((m) => m.id === memberId);
      setTeamFeedback({
        type: "success",
        text: `Updated ${member?.display_name ?? "member"}'s role to ${ROLE_CONFIG[targetRole].label}`,
      });
      void logActivity(
        ws.project.id,
        "settings",
        `Changed ${member?.display_name ?? "member"}'s role to ${targetRole}`,
      );
      setTimeout(() => setTeamFeedback(null), 3500);
    } catch (err) {
      setTeamFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to change role.",
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
              parent_path: f.path.includes("/")
                ? f.path.substring(0, f.path.lastIndexOf("/"))
                : null,
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
    const updated = { ...localDir, autoSync: next };
    setLocalDir(updated);
    saveStoredDirectoryState(updated);
  };

  // AI Settings State
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [aiSaved, setAiSaved] = useState(false);

  const saveAiProvider = (provider: LLMProviderType, model = "gemini-2.0-flash") => {
    setAiSettings({ provider, model, temperature: 0.7 });
    setAiSaved(true);
    void logActivity(
      ws.project.id,
      "settings",
      `Switched AI Model provider to ${provider} (${model})`,
    );
    setTimeout(() => setAiSaved(false), 2500);
  };

  // Danger Zone: Delete Project
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmInput !== ws.project.name) {
      setDeleteError(`Please type "${ws.project.name}" exactly to confirm deletion.`);
      return;
    }
    if (!canDeleteProject(callerRole)) {
      setDeleteError("Only the Project Owner can delete this workspace.");
      return;
    }

    try {
      setIsDeletingProject(true);
      setDeleteError(null);
      await projectsService.deleteProject(ws.project.id);
      navigate({ to: "/projects" });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project.");
      setIsDeletingProject(false);
    }
  };

  // Danger Zone: Leave Project
  const [isLeaving, setIsLeaving] = useState(false);
  const handleLeaveProject = async () => {
    if (!callerMember) return;
    if (!confirm(`Are you sure you want to leave ${ws.project.name}?`)) return;

    try {
      setIsLeaving(true);
      await membersService.removeMember(callerMember.id, callerRole);
      navigate({ to: "/projects" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to leave project.");
      setIsLeaving(false);
    }
  };

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/projects?join=${ws.project.invite_code}`
      : "";

  return (
    <>
      <PageHeader
        eyebrow="project control & workspaces"
        title="Project Settings"
        description="Select any of your projects to manage configuration, invite codes, team roles, and local directory sync."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-opacity"
            >
              <UserPlus className="size-3.5" />
              <span>Invite Teammates</span>
            </button>
          </div>
        }
      />

      {/* 📂 Project Selector Bar: View All My Projects */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" /> All Your Projects ({allProjects.length})
          </span>
          <button
            type="button"
            onClick={() => navigate({ to: "/projects" })}
            className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
          >
            <span>Project Directory</span>
            <ChevronRight className="size-3" />
          </button>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {allProjects.map((p: Project) => {
            const isCurrent = p.id === ws.project.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActiveProjectId(p.id);
                  setName(p.name);
                  setDescription(p.description || "");
                  setRepoUrl(p.repo_url || "");
                  setDefaultBranch(p.default_branch || "main");
                }}
                className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all relative overflow-hidden ${
                  isCurrent
                    ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-border hover:bg-accent/40 text-muted-foreground"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span
                    className={`font-semibold text-xs truncate ${
                      isCurrent ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {p.name}
                  </span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                      <Check className="size-2.5" /> Active
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                  {p.description || "HackSync workspace project."}
                </p>
                <div className="mt-2.5 flex w-full items-center justify-between text-[10px] text-muted-foreground">
                  <span className="mono bg-muted/60 px-1.5 py-0.5 rounded">
                    🔑 {p.invite_code}
                  </span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Workspace Header & Tabs */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>{ws.project.name}</span>
                <span className="mono rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {ws.project.invite_code}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Configuring active workspace · Created by{" "}
                {ws.members.find((m) => m.user_id === ws.project.created_by)?.display_name ||
                  "Owner"}
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "general"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Sliders className="size-3.5" />
              General
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "team"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Users className="size-3.5" />
              Team & Invites ({ws.members.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("local")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "local"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Laptop className="size-3.5" />
              Local Sync
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "ai"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Bot className="size-3.5" />
              AI Providers
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("danger")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "danger"
                  ? "bg-destructive text-destructive-foreground"
                  : "text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              }`}
            >
              <ShieldAlert className="size-3.5" />
              Danger Zone
            </button>
          </div>
        </div>

        {/* TAB 1: General Details */}
        {activeTab === "general" && (
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Panel className="p-5 space-y-4">
              <PanelHeader
                title="Project Information"
                icon={<Sliders className="size-4" />}
                actions={
                  <span className="text-[11px] text-muted-foreground">
                    ID: <code className="mono">{ws.project.id.slice(0, 8)}</code>
                  </span>
                }
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
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-foreground">
                    Project Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-foreground">
                    Project Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the architecture, hackathon goals, and product scope..."
                    className="w-full rounded-lg border border-input bg-background p-3 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-foreground">
                      GitHub Repository URL
                    </label>
                    <input
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/org/repo"
                      className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-foreground">
                      Default Git Branch
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

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="submit"
                    disabled={isSavingGeneral}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {isSavingGeneral ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    <span>Save Project Details</span>
                  </button>
                </div>
              </form>
            </Panel>

            <Panel className="p-5 space-y-4">
              <PanelHeader title="Project Summary" icon={<Sparkles className="size-4" />} />
              <dl className="divide-y divide-border text-xs">
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Team Size</dt>
                  <dd className="font-semibold">{ws.members.length} members</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">API Contracts</dt>
                  <dd className="font-semibold">{ws.contracts.length} endpoints</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Database Tables</dt>
                  <dd className="font-semibold">{ws.tables.length} tables</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Code Files</dt>
                  <dd className="font-semibold">{ws.codeNodes.length} nodes</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Invite Code</dt>
                  <dd className="mono font-bold text-primary">{ws.project.invite_code}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Your Role</dt>
                  <dd>
                    <RoleBadge role={callerRole} />
                  </dd>
                </div>
              </dl>
            </Panel>
          </div>
        )}

        {/* TAB 2: Team & Invites */}
        {activeTab === "team" && (
          <div className="space-y-5">
            {/* Invite Code & Share Link Banner */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="size-4 text-primary" /> Invite Teammates to{" "}
                    {ws.project.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Share this 6-character code or 1-click link to let teammates join instantly.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm"
                  >
                    <Plus className="size-3.5" /> Direct Invite Modal
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={handleRegenerateInviteCode}
                      disabled={isRegeneratingCode}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent text-muted-foreground"
                    >
                      {isRegeneratingCode ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Regenerate Code"
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Invite Code
                    </span>
                    <p className="mono text-lg font-extrabold text-primary tracking-widest">
                      {ws.project.invite_code}
                    </p>
                  </div>
                  <CopyButton value={ws.project.invite_code} label="Copy Code" />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                  <div className="truncate pr-2">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      1-Click Join Link
                    </span>
                    <p className="mono text-xs text-foreground truncate">{inviteLink}</p>
                  </div>
                  <CopyButton value={inviteLink} label="Copy Link" />
                </div>
              </div>
            </div>

            {/* Team Roster Panel */}
            <Panel className="p-5 space-y-4">
              <PanelHeader
                title="Active Team Roster"
                icon={<Users className="size-4" />}
                actions={
                  <StatusPill tone="primary">
                    {ws.members.length} members
                  </StatusPill>
                }
              />

              {teamFeedback && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium ${
                    teamFeedback.type === "success"
                      ? "bg-success/15 text-success border border-success/30"
                      : "bg-destructive/15 text-destructive border border-destructive/30"
                  }`}
                >
                  {teamFeedback.type === "success" ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="size-3.5 shrink-0" />
                  )}
                  <span>{teamFeedback.text}</span>
                </div>
              )}

              <ul className="divide-y divide-border">
                {ws.members.map((m) => {
                  const isThisUser = m.user_id === user?.id;
                  const isMemberOwner = m.role === "owner" || m.user_id === ws.project.created_by;
                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-secondary font-bold text-xs">
                          {m.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground">
                              {m.display_name}
                            </span>
                            {isThisUser && (
                              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                You
                              </span>
                            )}
                            {isMemberOwner && (
                              <span className="rounded bg-lead/20 px-1.5 py-0.5 text-[10px] font-medium text-lead">
                                Creator
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {m.email || "No email provided"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {editingRoleId === m.id ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {ROLES.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => void changeMemberRole(m.id, r)}
                                disabled={isUpdatingRole}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                  r === m.role
                                    ? "bg-primary text-primary-foreground font-bold"
                                    : "bg-secondary hover:bg-accent text-muted-foreground"
                                }`}
                              >
                                {ROLE_CONFIG[r].label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setEditingRoleId(null)}
                              className="rounded p-1 text-muted-foreground hover:bg-accent"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <RoleBadge role={m.role} />
                            {isLead && !isMemberOwner && (
                              <button
                                type="button"
                                onClick={() => setEditingRoleId(m.id)}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Change Role
                              </button>
                            )}
                          </div>
                        )}

                        {isLead && !isThisUser && !isMemberOwner && (
                          <button
                            type="button"
                            onClick={() => void removeMember(m.id)}
                            title="Remove member"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        )}

        {/* TAB 3: Local Workspace Sync */}
        {activeTab === "local" && (
          <Panel className="p-5 space-y-4">
            <PanelHeader
              title="Vibe Coding Local Directory Sync"
              icon={<Laptop className="size-4" />}
            />
            <p className="text-xs text-muted-foreground">
              Bind your local development folder (VS Code, Cursor, Windsurf) to this HackSync
              workspace with universal browser support.
            </p>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/20 text-primary">
                    <HardDrive className="size-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">Active Local Folder</h4>
                    <p className="text-[11px] text-muted-foreground">
                      {localDir.connected
                        ? `📁 ${localDir.name} (${localDir.fileCount} files scanned)`
                        : "No local folder linked"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectLocalFolder}
                    disabled={isConnectingDir}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Folder className="size-3.5" />
                    {localDir.connected ? "Switch Local Folder" : "Connect Local Folder"}
                  </button>

                  {localDir.connected && (
                    <button
                      type="button"
                      onClick={toggleAutoWatcher}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        localDir.autoSync
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "bg-secondary text-muted-foreground border border-border"
                      }`}
                    >
                      <Radio className="size-3" />
                      Auto-Watcher {localDir.autoSync ? "ON" : "OFF"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {/* TAB 4: AI Providers */}
        {activeTab === "ai" && (
          <Panel className="p-5 space-y-4">
            <PanelHeader
              title="AI & Intelligence Configuration"
              icon={<Bot className="size-4" />}
            />
            <p className="text-xs text-muted-foreground">
              Select which AI provider powers your code explanations, AST diagnostics, and judge
              pitch generation.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => saveAiProvider("gemini", "gemini-2.0-flash")}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "gemini"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span className="font-semibold text-xs">Google Gemini 2.0</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Ultra-fast multimodal reasoning & code generation.
                </p>
              </button>

              <button
                type="button"
                onClick={() => saveAiProvider("openai", "gpt-4o-mini")}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "openai"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  <span className="font-semibold text-xs">OpenAI GPT-4o Mini</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  High-precision structured output & contract validation.
                </p>
              </button>

              <button
                type="button"
                onClick={() => saveAiProvider("builtin", "built-in")}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  aiSettings.provider === "builtin"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="font-semibold text-xs">Offline Rule Engine</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Deterministic instant analysis with 0 API tokens.
                </p>
              </button>
            </div>

            {aiSaved && (
              <div className="flex items-center gap-2 rounded-md bg-success/15 border border-success/30 p-2.5 text-xs text-success font-medium">
                <Check className="size-3.5" /> AI provider updated for this workspace!
              </div>
            )}
          </Panel>
        )}

        {/* TAB 5: Danger Zone */}
        {activeTab === "danger" && (
          <Panel className="p-5 space-y-5 border-destructive/30">
            <PanelHeader
              title="Danger Zone"
              icon={<ShieldAlert className="size-4 text-destructive" />}
            />

            {/* Delete Workspace */}
            {isOwner ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-destructive">
                    Permanently Delete Workspace
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Once deleted, all API contracts, schemas, files, and team access will be
                    irreversibly destroyed.
                  </p>
                </div>

                {deleteError && (
                  <div className="rounded-md bg-destructive/20 border border-destructive/40 p-2 text-xs text-destructive">
                    {deleteError}
                  </div>
                )}

                <form onSubmit={handleDeleteProject} className="space-y-2 max-w-md">
                  <label className="block text-[11px] text-muted-foreground">
                    Type <code className="font-bold text-destructive">{ws.project.name}</code> to
                    confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={ws.project.name}
                    className="w-full rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs outline-none focus:border-destructive text-foreground"
                  />
                  <button
                    type="submit"
                    disabled={isDeletingProject || deleteConfirmInput !== ws.project.name}
                    className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    {isDeletingProject ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    <span>Delete Project Workspace</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Leave Workspace</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Remove yourself from {ws.project.name}. You will need an invite code to rejoin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLeaveProject}
                  disabled={isLeaving}
                  className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Leave Project
                </button>
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* Direct Invite Modal */}
      <InviteTeammatesModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        workspace={ws}
      />
    </>
  );
}
