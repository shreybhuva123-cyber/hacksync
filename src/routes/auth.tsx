import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Network, Zap, KeyRound, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { StatusPill } from "@/components/hacksync/primitives";
import { authBruteForceLimiter } from "@/lib/security/rate-limiter";
import { auditLogger } from "@/lib/security/audit-logger";
import { metrics } from "@/lib/observability/metrics";
import { z } from "zod";

const authFormSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .optional()
    .or(z.literal("")),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined;
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — HackSync Workspace" },
      {
        name: "description",
        content: "Sign in with your verified Supabase account to access HackSync integration workspace.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTo = search.redirect || "/dashboard";
  const { session, loading } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      void navigate({ to: redirectTo as any });
    }
  }, [session, navigate, redirectTo]);

  const handleInstantDemoAccess = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("hacksync:demo-mode", "true");
    }
    void navigate({ to: redirectTo as any });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (mode === "reset") {
        if (!email.includes("@")) {
          setError("Enter a valid email address for password reset.");
          return;
        }
        setBusy(true);
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        });
        if (resetErr) throw resetErr;
        setSuccess("Password reset email sent! Check your inbox for the reset link.");
        return;
      }

      const validated = authFormSchema.parse({
        email,
        password,
        displayName: mode === "signup" ? (name.trim() || undefined) : undefined,
      });

      setBusy(true);

      if (mode === "signup") {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: validated.email,
          password: validated.password,
          options: {
            data: { display_name: validated.displayName || validated.email.split("@")[0] },
          },
        });

        if (signUpErr) throw signUpErr;

        if (data.session) {
          void navigate({ to: redirectTo as any });
        } else {
          // If email confirmation is required by Supabase project settings
          setSuccess("Account created successfully! You can also use Instant Access below to enter immediately.");
        }
      } else {
        // Enforce brute-force rate limit
        const rateCheck = await authBruteForceLimiter.check(validated.email);
        if (!rateCheck.allowed) {
          metrics.incrementCounter("auth_failures");
          auditLogger.log({
            action: "RATE_LIMIT_EXCEEDED",
            actorId: null,
            status: "DENIED",
            metadata: { email: validated.email, reason: "Brute force threshold exceeded" },
          });
          setError(
            `Too many failed attempts. Please wait ${rateCheck.retryAfterSeconds ?? 60} seconds before attempting to sign in again.`,
          );
          return;
        }

        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: validated.email,
          password: validated.password,
        });

        if (signInErr) {
          metrics.incrementCounter("auth_failures");
          auditLogger.log({
            action: "AUTH_LOGIN_FAILURE",
            actorId: null,
            status: "FAILURE",
            metadata: { email: validated.email, error: signInErr.message },
          });
          throw signInErr;
        }

        if (data.session) {
          await authBruteForceLimiter.reset(validated.email);
          auditLogger.log({
            action: "AUTH_LOGIN_SUCCESS",
            actorId: data.user.id,
            status: "SUCCESS",
            metadata: { email: validated.email },
          });
          void navigate({ to: redirectTo as any });
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0]?.message ?? "Invalid input.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Authentication failed. Please verify your credentials.");
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${redirectTo}`,
        },
      });
      if (err) throw err;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google OAuth failed.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid-bg grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Network className="size-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Hack<span className="text-primary">Sync</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Enterprise integration and truth control center
          </p>
          <StatusPill tone="info">Supabase Production Authentication</StatusPill>
        </div>

        <div className="panel p-5 space-y-4">
          {/* Instant 1-Click Workspace Access */}
          <button
            type="button"
            onClick={handleInstantDemoAccess}
            className="flex w-full items-center justify-between rounded-lg border border-primary/40 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 p-3 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-sm group"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary animate-pulse" />
              <span>⚡ Enter Instant Workspace (1-Click Access)</span>
            </div>
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Mode Switcher */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {(["signin", "signup", "reset"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setSuccess(null);
                }}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? "bg-surface-raised text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign In" : m === "signup" ? "Register" : "Reset"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3" noValidate>
            {mode === "signup" ? (
              <Field
                id="name"
                label="Display name"
                value={name}
                onChange={setName}
                placeholder="Priya Nair"
                autoComplete="name"
              />
            ) : null}

            <Field
              id="email"
              label="Email address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.dev"
              autoComplete="email"
              required
            />

            {mode !== "reset" ? (
              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            ) : null}

            {success ? (
              <div className="space-y-2 rounded-md border border-success/40 bg-success/10 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <p className="text-xs text-success font-medium">{success}</p>
                </div>
                <button
                  type="button"
                  onClick={handleInstantDemoAccess}
                  className="w-full rounded bg-success/20 py-1 text-center text-xs font-bold text-success hover:bg-success/30 transition-colors"
                >
                  👉 Click Here to Enter Workspace Now
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <p role="alert">{error}</p>
                <button
                  type="button"
                  onClick={handleInstantDemoAccess}
                  className="w-full rounded bg-primary/20 py-1 text-center font-bold text-primary hover:bg-primary/30 transition-colors"
                >
                  ⚡ Bypass & Enter Instant Workspace
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 shadow-sm"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin"
                ? "Sign In"
                : mode === "signup"
                  ? "Create Account"
                  : "Send Password Reset Link"}
            </button>
          </form>

          {mode !== "reset" ? (
            <>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void google()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                Continue with Google
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </div>
  );
}
