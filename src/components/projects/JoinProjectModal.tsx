import { useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, X } from "lucide-react";
import { RoleBadge } from "@/components/hacksync/primitives";
import type { Role } from "@/lib/hacksync/types";

const ROLES: Role[] = ["frontend", "backend", "database", "lead"];

interface JoinProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { inviteCode: string; role: Role }) => Promise<{ status?: "pending" | "already_member" | string; message?: string } | void>;
  isLoading: boolean;
  initialInviteCode?: string;
}

export function JoinProjectModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  initialInviteCode = "",
}: JoinProjectModalProps) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [role, setRole] = useState<Role>("frontend");
  const [error, setError] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<{
    status: "pending" | "already_member";
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError("Please enter a valid invite code.");
      return;
    }
    setError(null);
    try {
      const result = await onSubmit({ inviteCode: inviteCode.trim().toUpperCase(), role });
      if (result && result.status === "pending") {
        setSubmittedStatus({
          status: "pending",
          message: result.message || "Your request to join has been submitted for leader approval.",
        });
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit join request.");
    }
  };

  const handleResetAndClose = () => {
    setSubmittedStatus(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {submittedStatus ? "Request Status" : "Request to Join Team"}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {submittedStatus ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center space-y-2.5">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock className="size-6 animate-pulse" />
              </div>
              <h4 className="text-sm font-bold text-foreground">Join Request Submitted!</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {submittedStatus.message}
              </p>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-3 py-1 text-[11px] font-medium text-foreground">
                <span>Requested Role:</span>
                <RoleBadge role={role} />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              The project leader or owner will assign your role and grant workspace access upon review.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Got It
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Enter the project invite code to submit a join request. The team leader will review your request and assign your official role.
            </p>

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Invite Code <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SYNC-9942"
                  className="mono w-full rounded-lg border border-input bg-background px-3 py-2 text-xs uppercase tracking-wider outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Preferred / Requested Role
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium capitalize transition-colors ${
                        role === r
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                          : "border-border hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <RoleBadge role={r} />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  The team leader will confirm or adjust your role upon accepting your request.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  <span>Request to Join</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
