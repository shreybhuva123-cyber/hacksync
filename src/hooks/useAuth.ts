import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_USER_KEY = "hacksync_auth_user";

export interface LocalAuthUser {
  id: string;
  email: string;
  display_name: string;
  role?: string;
}

let localUserListeners: Array<() => void> = [];
let cachedLocalUser: LocalAuthUser | null = null;
let cachedRaw: string | null = null;

export function getLocalAuthUser(): LocalAuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw === cachedRaw) return cachedLocalUser;
    cachedRaw = raw;
    cachedLocalUser = raw ? JSON.parse(raw) : null;
    return cachedLocalUser;
  } catch {
    return null;
  }
}

export function setLocalAuthUser(user: LocalAuthUser) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(user);
  cachedRaw = raw;
  cachedLocalUser = user;
  localStorage.setItem(LOCAL_USER_KEY, raw);
  localUserListeners.forEach((l) => l());
}

export function clearLocalAuthUser() {
  if (typeof window === "undefined") return;
  cachedRaw = null;
  cachedLocalUser = null;
  localStorage.removeItem(LOCAL_USER_KEY);
  localUserListeners.forEach((l) => l());
}

function subscribeLocalUser(listener: () => void) {
  localUserListeners.push(listener);
  return () => {
    localUserListeners = localUserListeners.filter((l) => l !== listener);
  };
}

export function useAuth() {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const localUser = useSyncExternalStore(subscribeLocalUser, getLocalAuthUser, () => null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSupabaseSession(next);
      setLoading(false);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSupabaseSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Construct standard User object from either Supabase or Local Demo User
  let user: User | null = supabaseSession?.user ?? null;
  if (!user && localUser) {
    user = {
      id: localUser.id,
      app_metadata: { provider: "email" },
      user_metadata: { display_name: localUser.display_name, role: localUser.role || "lead" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: localUser.email,
      phone: "",
      role: "authenticated",
      updated_at: new Date().toISOString(),
    };
  }

  const session: Session | null =
    supabaseSession ??
    (user
      ? ({
          access_token: "mock-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "mock-refresh-token",
          user,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as Session)
      : null);

  return { session, user, loading };
}

export async function signOut() {
  clearLocalAuthUser();
  await supabase.auth.signOut().catch(() => {});
}
