import { useState, useEffect } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Inbox,
  Link as LinkIcon,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { CopyButton, RoleBadge, StatusPill } from "@/components/hacksync/primitives";
import { ROLES, ROLE_CONFIG, type Role } from "@/lib/constants/roles";
import { useAuth } from "@/hooks/useAuth";
import { joinRequestsService } from "@/lib/services/join-requests.service";
import { useQueryClient } from "@tanstack/react-query";
import { WORKSPACE_KEY } from "@/lib/hacksync/workspace.queries";
import type { Workspace, JoinRequest } from "@/lib/hacksync/types";

interface InviteTeammatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
  initialTab?: "link" | "direct" | "requests";
}

export function InviteTeammatesModal({
  isOpen,
  onClose,
  workspace,
  initialTab = "link",
}: InviteTeammatesModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "direct" | "requests">(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Direct add state
  const [identifier, setIdentifier] = useState("");
  const [directRole, setDirectRole] = useState<Role>("frontend");
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directSuccess, setDirectSuccess] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<JoinRequest[]>(workspace.joinRequests || []);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [assignedRoles, setAssignedRoles] = useState<Record<string, Role>>({});
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

  // Caller role
  const callerMember = workspace.members.find((m) => m.user_id === user?.id);
  const isCreator = workspace.project.created_by === user?.id;
  const callerRole: Role = callerMember?.role ?? (isCreator ? "owner" : "member");

  // Load join requests whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setRequestsLoading(true);
    joinRequestsService
      .getProjectJoinRequests(workspace.project.id)
      .then((data) => {
        if (isMounted) {
          setRequests(data);
          // Initialize default assigned roles from requested roles
          const initial: Record<string, Role> = {};
          for (const req of data) {
            initial[req.id] = req.requested_role;
          }
          setAssignedRoles((prev) => ({ ...initial, ...prev }));
        }
      })
      .catch((err) => console.warn("Failed to load join requests:", err))
      .finally(() => {
        if (isMounted) setRequestsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspace.project.id]);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const inviteCode = workspace.project.invite_code || "SYNC99";
  const inviteUrl = `${origin}/projects?join=${inviteCode}`;
  const pendingRequests = requests.filter((r) => r.status === "pending");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Direct add member by username or email
  const handleDirectAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectError(null);
    setDirectSuccess(null);

    const clean = identifier.trim();
    if (!clean) {
      setDirectError("Please enter a teammate's username or email address.");
      return;
    }

    try {
      setDirectLoading(true);
      const res = await joinRequestsService.addMemberByIdentifier({
        projectId: workspace.project.id,
        identifier: clean,
        role: directRole,
        callerRole,
      });

      setDirectSuccess(`Added ${res.displayName} to the team as ${ROLE_CONFIG[res.role].label}!`);
      setIdentifier("");
      setDirectRole("frontend");
      // Invalidate workspace cache to update member list
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
      setTimeout(() => setDirectSuccess(null), 4000);
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : "Failed to add teammate.");
    } finally {
      setDirectLoading(false);
    }
  };

  // Review a join request (Accept with assigned role or Reject)
  const handleReviewRequest = async (requestId: string, action: "accepted" | "rejected") => {
    try {
      setReviewingId(requestId);
      const assignedRole = assignedRoles[requestId] || "frontend";

      const reviewPayload: {
        requestId: string;
        projectId: string;
        action: "accepted" | "rejected";
        assignedRole?: Role | undefined;
        callerRole: string;
        callerUserId?: string | undefined;
      } = {
        requestId,
        projectId: workspace.project.id,
        action,
        callerRole,
      };
      if (action === "accepted") {
        reviewPayload.assignedRole = assignedRole;
      }
      if (user?.id) {
        reviewPayload.callerUserId = user.id;
      }

      await joinRequestsService.reviewJoinRequest(reviewPayload);

      // Update local state
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: action,
                assigned_role: action === "accepted" ? assignedRole : null,
              }
            : r,
        ),
      );

      const req = requests.find((r) => r.id === requestId);
      const name = req?.display_name || "Applicant";
      setRequestFeedback(
        action === "accepted"
          ? `Accepted ${name} as ${ROLE_CONFIG[assignedRole].label}!`
          : `Declined request from ${name}.`,
      );

      // Invalidate workspace cache so roster updates immediately
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
      setTimeout(() => setRequestFeedback(null), 3500);
    } catch (err) {
      setRequestFeedback(err instanceof Error ? err.message : "Failed to review request.");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Team Management & Invites
              </h3>
              <p className="text-xs text-muted-foreground">
                {workspace.project.name} • {workspace.members.length} active members
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
        <div className="flex border-b border-border px-6 pt-2 shrink-0 bg-muted/10">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "link"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="size-3.5" />
            Invite Code & Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("direct")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "direct"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="size-3.5" />
            Add by Username / Email
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors relative ${
              activeTab === "requests"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="size-3.5" />
            <span>Pending Requests</span>
            {pendingRequests.length > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.2 text-[10px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Content area */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* TAB 1: 1-Click Invite Link & Code */}
          {activeTab === "link" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> Project Invite Code
                  </span>
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Request Gate Active
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-background/80 border border-border px-4 py-3">
                  <div>
                    <span className="mono text-2xl font-black tracking-widest text-foreground">
                      {inviteCode}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Teammates enter this code in the "Join" modal to request access.
                    </p>
                  </div>
                  <CopyButton value={inviteCode} label="Copy Code" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Shareable 1-Click Join Link
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
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 flex items-start gap-2.5">
                <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Leader Gate Enabled:</strong> When applicants submit this code, they must be approved by a team lead or owner with an assigned role before gaining access to the workspace.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Direct Add by Username or Email with Role */}
          {activeTab === "direct" && (
            <form onSubmit={handleDirectAdd} className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  Directly Add Teammate with Assigned Role
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Enter a teammate's username or email. As team leader, you can bypass the request queue and assign their role immediately.
                </p>
              </div>

              {directError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{directError}</span>
                </div>
              )}

              {directSuccess && (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{directSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Teammate Username or Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. alexdev or alex@team.dev"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Assigned Team Role
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setDirectRole(r)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium transition-all ${
                        directRole === r
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
                  disabled={directLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {directLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>Add Teammate as {ROLE_CONFIG[directRole].label}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Pending Join Requests */}
          {activeTab === "requests" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Review Join Requests ({pendingRequests.length} pending)
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Assign each applicant their official role and approve or decline access.
                  </p>
                </div>
              </div>

              {requestFeedback && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span>{requestFeedback}</span>
                </div>
              )}

              {requestsLoading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Loading requests...</span>
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Inbox className="size-5" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No Pending Requests</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                    When teammates use the invite code to request access, their requests will appear here for role assignment and review.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((req) => {
                    const isReviewing = reviewingId === req.id;
                    const assignedRole = assignedRoles[req.id] || req.requested_role;

                    return (
                      <div
                        key={req.id}
                        className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm hover:border-primary/40 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                              {req.display_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  {req.display_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  requested <RoleBadge role={req.requested_role} />
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {req.email || "No email provided"} •{" "}
                                {new Date(req.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Assign Role selector & Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-foreground">
                              Assign Role:
                            </span>
                            <div className="flex items-center gap-1">
                              {ROLES.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() =>
                                    setAssignedRoles((prev) => ({ ...prev, [req.id]: r }))
                                  }
                                  className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors ${
                                    assignedRole === r
                                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                      : "bg-secondary hover:bg-accent text-muted-foreground"
                                  }`}
                                >
                                  {ROLE_CONFIG[r].label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewRequest(req.id, "rejected")}
                              disabled={isReviewing}
                              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewRequest(req.id, "accepted")}
                              disabled={isReviewing}
                              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {isReviewing ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <UserCheck className="size-3.5" />
                              )}
                              <span>Accept as {ROLE_CONFIG[assignedRole].label}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InvitationRequestsModal({
  isOpen,
  onClose,
  workspace,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
}) {
  return (
    <InviteTeammatesModal
      isOpen={isOpen}
      onClose={onClose}
      workspace={workspace}
      initialTab="requests"
    />
  );
}

