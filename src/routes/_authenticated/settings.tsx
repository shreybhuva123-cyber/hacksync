import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Bot,
  Check,
  KeyRound,
  Loader2,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
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
import { logActivity, useRowDelete, useRowInsert, useRowMutation } from "@/lib/hacksync/workspace";
import { membersService } from "@/lib/services/members.service";
import { DEFAULT_AI_SETTINGS, type AISettings, type LLMProviderType } from "@/lib/hacksync/llm-provider";
import { canManageMembers, canDeleteProject } from "@/lib/hacksync/permissions";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import type { Workspace } from "@/lib/hacksync/types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace Settings — HackSync" },
      {
        name: "description",
        content:
          "Project details, invite code, team roster and demo mode for your HackSync workspace.",
      },
      { property: "og:title", content: "Workspace Settings — HackSync" },
      { property: "og:description", content: "Invite teammates and configure the workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return <WorkspaceView>{(ws) => <SettingsBody ws={ws} />}</WorkspaceView>;
}

function SettingsBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const update = useRowMutation();
  const insert = useRowInsert();
  const remove = useRowDelete();

  // Find caller's role in this project
  const callerMember = ws.members.find((m) => m.user_id === user?.id);
  const callerRole: Role = callerMember?.role ?? (ws.project.created_by === user?.id ? "owner" : "member");

  // Add member form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>("frontend");
  const [addError, setAddError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Role editing state
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // AI Intelligence settings
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [aiSaved, setAiSaved] = useState(false);

  const saveAi = (provider: LLMProviderType, model = "gemini-2.0-flash") => {
    setAiSettings({ provider, model, temperature: 0.7 });
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const toggleDemo = () => {
    update.mutate(
      { table: "projects", id: ws.project.id, values: { demo_mode: !ws.project.demo_mode } },
      {
        onSuccess: () =>
          void logActivity(
            ws.project.id,
            "settings",
            `Demo mode ${ws.project.demo_mode ? "disabled" : "enabled"}`,
          ),
      },
    );
  };

  const changeRole = async (memberId: string, newRole: Role) => {
    try {
      setIsUpdatingRole(true);
      setActionFeedback(null);
      await membersService.updateRole(memberId, newRole, callerRole);
      setEditingRole(null);
      const member = ws.members.find((m) => m.id === memberId);
      setActionFeedback({
        type: "success",
        message: `Updated ${member?.display_name ?? "member"}'s role to ${newRole}`,
      });
      void logActivity(
        ws.project.id,
        "settings",
        `Changed ${member?.display_name ?? "member"}'s role to ${newRole}`,
      );
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      setActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update member role.",
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const removeMember = async (memberId: string) => {
    const member = ws.members.find((m) => m.id === memberId);
    if (!confirm(`Remove ${member?.display_name ?? "this member"} from the project?`)) return;

    try {
      setActionFeedback(null);
      await membersService.removeMember(memberId, callerRole);
      setActionFeedback({
        type: "success",
        message: `Removed ${member?.display_name ?? "member"} from the project.`,
      });
      void logActivity(
        ws.project.id,
        "settings",
        `Removed ${member?.display_name ?? "member"} from the team`,
      );
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      setActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to remove member.",
      });
    }
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      setAddError("Name is required");
      return;
    }
    setAddError(null);

    insert.mutate(
      {
        table: "project_members",
        values: {
          project_id: ws.project.id,
          display_name: addName.trim(),
          email: addEmail.trim() || null,
          role: addRole,
          online: false,
        },
      },
      {
        onSuccess: () => {
          void logActivity(ws.project.id, "settings", `Added team member ${addName.trim()}`);
          setAddName("");
          setAddEmail("");
          setShowAdd(false);
        },
        onError: (err: unknown) => {
          setAddError(err instanceof Error ? err.message : "Failed to add member");
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="project administration"
        title="Settings"
        description="Project details, invite code, and team roster for your HackSync workspace."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project details */}
        <Panel className="self-start">
          <PanelHeader title="Project Details" icon={<SettingsIcon className="size-4" />} />
          <dl className="divide-y divide-border text-xs">
            <Row label="Name" value={ws.project.name} />
            <Row label="Description" value={ws.project.description || "—"} />
            <Row label="GitHub Repo" value={ws.project.repo_url || "—"} />
            <Row label="Default Branch" value={ws.project.default_branch || "main"} />
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-muted-foreground">Demo Mode</dt>
              <dd>
                <button
                  type="button"
                  onClick={toggleDemo}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    ws.project.demo_mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {ws.project.demo_mode ? "Active" : "Inactive"}
                </button>
              </dd>
            </div>
          </dl>
        </Panel>

        {/* Invite code */}
        <Panel className="self-start">
          <PanelHeader title="Invite Teammates" icon={<KeyRound className="size-4" />} />
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Share this invite code with your teammates so they can join this workspace with live
              collaboration.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Workspace Invite Code
                </span>
                <p className="mono text-lg font-bold tracking-widest text-primary">
                  {ws.project.invite_code}
                </p>
              </div>
              <CopyButton value={ws.project.invite_code} label="Copy code" />
            </div>
          </div>
        </Panel>

        {/* AI Model Intelligence */}
        <Panel className="self-start lg:col-span-2">
          <PanelHeader
            title="AI Model Intelligence Provider"
            icon={<Bot className="size-4" />}
            actions={
              aiSaved ? (
                <span className="flex items-center gap-1 text-[11px] text-success font-medium">
                  <Check className="size-3" /> Saved
                </span>
              ) : undefined
            }
          />
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Select which AI provider powers your code explanations, AST diagnostics, and judge
              pitch generation.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => saveAi("gemini", "gemini-2.0-flash")}
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
                onClick={() => saveAi("openai", "gpt-4o-mini")}
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
                onClick={() => saveAi("builtin", "built-in")}
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
          </div>
        </Panel>

        {/* Team roster */}
        <Panel className="self-start lg:col-span-2">
          <PanelHeader
            title="Team Roster"
            icon={<SettingsIcon className="size-4" />}
            actions={<StatusPill tone="primary">{ws.members.length} members</StatusPill>}
          />

          {actionFeedback && (
            <div
              className={`mx-4 mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium ${
                actionFeedback.type === "success"
                  ? "bg-success/15 text-success border border-success/30"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}
            >
              {actionFeedback.type === "success" ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <AlertCircle className="size-4 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
          )}

          <ul className="divide-y divide-border">
            {ws.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="text-xs font-medium">{m.display_name}</span>

                {/* Editable role */}
                {editingRole === m.id ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => changeRole(m.id, r)}
                        disabled={isUpdatingRole}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
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
                      disabled={isUpdatingRole}
                      className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingRole(m.id)}
                    title="Click to change role"
                    className="cursor-pointer"
                  >
                    <RoleBadge role={m.role} />
                  </button>
                )}

                <StatusPill tone={m.online ? "success" : "neutral"}>
                  {m.online ? "online" : "offline"}
                </StatusPill>

                {m.branch_name ? (
                  <span className="mono ml-auto text-[10px] text-muted-foreground">
                    {m.branch_name}
                  </span>
                ) : null}

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  disabled={remove.isPending}
                  title="Remove member"
                  className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                >
                  <Trash2 className="size-3" />
                </button>

                {m.working_area ? (
                  <p className="w-full text-[11px] text-muted-foreground">
                    Working in {m.working_area}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Add member */}
          <div className="border-t border-border p-4">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Plus className="size-3.5" />
                Add team member
              </button>
            ) : (
              <form onSubmit={addMember} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="add-name"
                      className="mb-1 block text-[11px] font-medium text-muted-foreground"
                    >
                      Display name
                    </label>
                    <input
                      id="add-name"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="Priya Nair"
                      required
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="add-email"
                      className="mb-1 block text-[11px] font-medium text-muted-foreground"
                    >
                      Email (optional)
                    </label>
                    <input
                      id="add-email"
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="priya@team.dev"
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Role
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAddRole(r)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          addRole === r
                            ? "bg-primary text-primary-foreground font-bold"
                            : "bg-secondary text-secondary-foreground hover:bg-accent"
                        }`}
                      >
                        {ROLE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>

                {addError ? <p className="text-xs text-destructive">{addError}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={insert.isPending}
                    className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {insert.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                    Add member
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(false);
                      setAddError(null);
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 px-4 py-2.5">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="mono truncate">{value}</dd>
    </div>
  );
}
