import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/hacksync/AppShell";
import { logger } from "@/lib/errors";

/**
 * Enterprise Authenticated Layout Route Guard
 * Strictly verifies real Supabase JWT session with the auth server.
 * Zero client-side bypass: all protected routes require authenticated credentials.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        logger.info("Unauthenticated route access attempt, redirecting to /auth", {
          path: location.pathname,
        });
        throw redirect({
          to: "/auth",
          search: {
            redirect: location.pathname,
          },
        });
      }

      return { user: data.user };
    } catch (err) {
      if ((err as { isRedirect?: boolean })?.isRedirect) throw err;
      throw redirect({
        to: "/auth",
        search: {
          redirect: location.pathname,
        },
      });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
