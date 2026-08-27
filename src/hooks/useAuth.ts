import { useEffect, useState } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/errors";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | Error | null;
}

/**
 * Enterprise Production Supabase Auth Hook
 * Strictly verifies real Supabase Auth sessions, listens for token refreshes,
 * and eliminates all fake guest/mock token creation.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AuthError | Error | null>(null);

  useEffect(() => {
    let mounted = true;

    // 1. Fetch active session from Supabase Client
    supabase.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (!mounted) return;
        if (sessionErr) {
          logger.warn("Supabase getSession error", { error: sessionErr.message });
          setError(sessionErr);
        }
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        logger.error("Unexpected error retrieving Supabase session", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    // 2. Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      logger.info(`Auth state changed: ${event}`, { userId: nextSession?.user?.id });
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    error,
  };
}

export async function signOut(): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("hacksync:demo-mode");
      localStorage.removeItem("hacksync:active-project-id");
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (err) {
    logger.error("Sign out error", err);
    throw err;
  }
}
