import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  Bot,
  Sparkles,
  KeyRound,
  Check,
  ShieldCheck,
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
import { DEFAULT_AI_SETTINGS, type AISettings, type LLMProviderType } from "@/lib/hacksync/llm-provider";
import { canManageMembers, canDeleteProject } from "@/lib/hacksync/permissions";
import type { Role, Workspace } from "@/lib/hacksync/types";

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

const ROLES: Role[] = ["frontend", "backend", "database", "lead"];

function SettingsPage() {
  return <WorkspaceView>{(ws) => <SettingsBody ws={ws} />}</WorkspaceView>;
}

function SettingsBody({ ws }: { ws: Workspace }) {
  const { user } = useAuth();
  const update = useRowMutation();
  const insert = useRowInsert();
  const remove = useRowDelete();

  // Add member form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>("frontend");
  const [addError, setAddError] = useState<string | null>(null);

  // Role editing state
  const [editingRole, setEditingRole] = useState<string | null>(null);

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

  const changeRole = (memberId: string, newRole: Role) => {
    update.mutate(
      { table: "project_members", id: memberId, values: { role: newRole } },
      {
        onSuccess: () => {
          setEditingRole(null);
          const member = ws.members.find((m) => m.id === memberId);
          void logActivity(
            ws.project.id,
            "settings",
            `Changed ${member?.display_name ?? "member"}'s role to ${newRole}`,
          );
        },
      },
    );
  };

  const removeMember = (memberId: string) => {
    const member = ws.members.find((m) => m.id === memberId);
    if (!confirm(`Remove ${member?.display_name ?? "this member"} from the project?`)) return;
    remove.mutate(
      { table: "project_members", id: memberId },
      {
        onSuccess: () =>
          void logActivity(
            ws.project.id,
            "settings",
            `Removed ${member?.display_name ?? "member"} from the team`,
          ),
      },
    );
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!addName.trim()) {
      setAddError("Display name is required.");
      return;
    }
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
          void logActivity(ws.project.id, "settings", `Added ${addName.trim()} as ${addRole}`);
          setAddName("");
          setAddEmail("");
          setAddRole("frontend");
          setShowAdd(false);
        },
        onError: (err) => {
          setAddError(err instanceof Error ? err.message : "Failed to add member.");
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="workspace"
        title="Settings"
        description="Everything the team shares: project identity, invite code, roles and demo mode."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="self-start">
          <PanelHeader title="Project" icon={<SettingsIcon className="size-4" />} />
          <dl className="divide-y divide-border text-xs">
            <Row label="Name" value={ws.project.name} />
            <Row label="Description" value={ws.project.description ?? "—"} />
            <Row label="Repository" value={ws.project.repo_url ?? "—"} />
            <Row label="Default branch" value={ws.project.default_branch} />
            <Row label="Schema version" value={ws.project.schema_version} />
            <div className="flex items-center gap-2 px-4 py-2.5">
              <dt className="w-36 text-muted-foreground">Invite code</dt>
              <dd className="mono flex items-center gap-2">
                {ws.project.invite_code}
                <CopyButton value={ws.project.invite_code} label="Copy" />
              </dd>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5">
              <dt className="w-36 text-muted-foreground">Demo mode</dt>
              <dd className="flex items-center gap-2">
                <StatusPill tone={ws.project.demo_mode ? "success" : "neutral"}>
                  {ws.project.demo_mode ? "on" : "off"}
                </StatusPill>
                <button
                  type="button"
                  onClick={toggleDemo}
                  disabled={update.isPending}
                  className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  Toggle
                </button>
              </dd>
            </div>
            <Row label="Signed in as" value={user?.email ?? "—"} />
          </dl>
        </Panel>

        {/* AI Model & LLM Provider Settings */}
        <Panel className="self-start space-y-4 p-5">
          <PanelHeader
            title="AI Intelligence & LLM Provider"
            subtitle="Configure Google Gemini, OpenAI, or the built-in Deep Reasoning Engine"
            icon={<Bot className="size-4 text-primary" />}
            actions={
              <StatusPill tone="primary">
                {aiSettings.provider === "gemini"
                  ? "Gemini 2.0 Flash"
                  : aiSettings.provider === "openai"
                    ? "OpenAI GPT-4o"
                    : "Built-in Expert"}
              </StatusPill>
            }
          />

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => saveAi("builtin")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  aiSettings.provider === "builtin"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> Built-in Expert
                </div>
                <p className="text-[10px] opacity-80 mt-1">100% Offline Deep Reasoning Engine</p>
              </button>

              <button
                type="button"
                onClick={() => saveAi("gemini", "gemini-2.0-flash")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  aiSettings.provider === "gemini"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Bot className="size-3.5" /> Google Gemini
                </div>
                <p className="text-[10px] opacity-80 mt-1">Server Gateway (Gemini 2.0 Flash)</p>
              </button>

              <button
                type="button"
                onClick={() => saveAi("openai", "gpt-4o-mini")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  aiSettings.provider === "openai"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background hover:bg-accent text-muted-foreground"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Bot className="size-3.5" /> OpenAI
                </div>
                <p className="text-[10px] opacity-80 mt-1">Server Gateway (GPT-4o Mini)</p>
              </button>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <ShieldCheck className="size-3.5" /> Server-Side AI Gateway Protected
              </div>
              <p className="text-[11px] text-muted-foreground">
                All AI queries are proxied through the authenticated server gateway with token-bucket rate limiting and zero client-side secret exposure.
              </p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <PanelHeader
            title="Team roster"
            subtitle="Click a role to change it. Add or remove teammates below."
          />
          <ul className="divide-y divide-border">
            {ws.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="text-xs font-medium">{m.display_name}</span>

                {/* Editable role */}
                {editingRole === m.id ? (
                  <div className="flex items-center gap-1">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => changeRole(m.id, r)}
                        disabled={update.isPending}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          r === m.role
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-accent"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditingRole(null)}
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
                  <div className="flex gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAddRole(r)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          addRole === r
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-accent"
                        }`}
                      >
                        {r}
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
