import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getLocalAuthUser } from "@/hooks/useAuth";
import { AppShell } from "@/components/hacksync/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Check native Supabase user
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        return { user: data.user };
      }
    } catch {
      // Supabase network or unauthenticated
    }

    // 2. Check local authenticated user (instant demo / guest / unconfirmed bypass)
    const local = getLocalAuthUser();
    if (local) {
      const localUserObj: User = {
        id: local.id,
        app_metadata: { provider: "email" },
        user_metadata: { display_name: local.display_name, role: local.role || "lead" },
        aud: "authenticated",
        created_at: new Date().toISOString(),
        email: local.email,
        phone: "",
        role: "authenticated",
        updated_at: new Date().toISOString(),
      };
      return { user: localUserObj };
    }

    // 3. Fallback: Auto-seed guest session so visiting /dashboard directly always works smoothly
    const guestUser: User = {
      id: "demo-guest-lead",
      app_metadata: { provider: "email" },
      user_metadata: { display_name: "HackSync Lead", role: "lead" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "lead@hacksync.dev",
      phone: "",
      role: "authenticated",
      updated_at: new Date().toISOString(),
    };
    return { user: guestUser };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
