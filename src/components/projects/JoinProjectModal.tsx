import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { RoleBadge } from "@/components/hacksync/primitives";
import type { Role } from "@/lib/hacksync/types";

const ROLES: Role[] = ["frontend", "backend", "database", "lead"];

interface JoinProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { inviteCode: string; role: Role }) => Promise<void>;
  isLoading: boolean;
}

export function JoinProjectModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: JoinProjectModalProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState<Role>("frontend");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError("Please enter a valid 8-character invite code.");
      return;
    }
    setError(null);
    try {
      await onSubmit({ inviteCode: inviteCode.trim().toUpperCase(), role });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join project.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Join Project via Invite Code</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

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
            <label className="block text-xs font-medium text-foreground">Your Role on This Team</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium capitalize transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <RoleBadge role={r} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>Join Workspace</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
