import { useState } from "react";
import {
  Check,
  Copy,
  Link as LinkIcon,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { CopyButton, RoleBadge } from "@/components/hacksync/primitives";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import { useRowInsert, logActivity } from "@/lib/hacksync/workspace";
import type { Workspace } from "@/lib/hacksync/types";

interface InviteTeammatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
}

export function InviteTeammatesModal({
  isOpen,
  onClose,
  workspace,
}: InviteTeammatesModalProps) {
  const insert = useRowInsert();
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "direct">("link");

  // Direct add form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("frontend");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const inviteCode = workspace.project.invite_code || "SYNC99";
  const inviteUrl = `${origin}/projects?join=${inviteCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDirectAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError("Please enter a member name or nickname.");
      return;
    }

    insert.mutate(
      {
        table: "project_members",
        values: {
          project_id: workspace.project.id,
          display_name: name.trim(),
          email: email.trim() || null,
          role,
          online: false,
        },
      },
      {
        onSuccess: () => {
          void logActivity(
            workspace.project.id,
            "settings",
            `Invited ${name.trim()} to project as ${role}`,
          );
          setSuccessMsg(`Added ${name.trim()} as ${ROLE_CONFIG[role].label}!`);
          setName("");
          setEmail("");
          setRole("frontend");
          setTimeout(() => setSuccessMsg(null), 3500);
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to add teammate.");
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Invite Teammates to {workspace.project.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Share an instant invite link or add members directly with roles.
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

        {/* Tab switcher */}
        <div className="flex border-b border-border px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "link"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="size-3.5" />
            1-Click Invite Link & Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("direct")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "direct"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="size-3.5" />
            Direct Add by Email / Role
          </button>
        </div>

        <div className="p-6 space-y-5">
          {activeTab === "link" ? (
            <div className="space-y-4">
              {/* Large Invite Code Card */}
              <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> Project Invite Code
                  </span>
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Universal Access
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background/80 border border-border px-4 py-3">
                  <div>
                    <span className="mono text-2xl font-black tracking-widest text-foreground">
                      {inviteCode}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Teammates can enter this code in the "Join Project" modal.
                    </p>
                  </div>
                  <CopyButton value={inviteCode} label="Copy Code" />
                </div>
              </div>

              {/* Shareable Invite URL */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Direct 1-Click Join Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="mono flex-1 rounded-lg border border-input bg-secondary/80 px-3 py-2 text-xs text-foreground outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
                  >
                    {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Anyone who clicks this link will be automatically prompted to join{" "}
                  <strong>{workspace.project.name}</strong> with their chosen role.
                </p>
              </div>

              {/* Security Hint */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 flex items-start gap-2.5">
                <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Role-Based Security:</strong> You can change
                  or revoke any team member's role at any time from the{" "}
                  <span className="font-semibold text-foreground">Project Settings</span> tab.
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleDirectAdd} className="space-y-4">
              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              ) : null}

              {successMsg ? (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success flex items-center gap-2">
                  <Check className="size-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Chen"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-foreground">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. alex@team.dev"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Assigned Team Role
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium transition-all ${
                        role === r
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                          : "border-border hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <RoleBadge role={r} />
                      <span className="text-[10px] capitalize">{ROLE_CONFIG[r].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={insert.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {insert.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>Add Teammate</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
