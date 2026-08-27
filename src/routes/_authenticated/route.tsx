import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/hacksync/AppShell";
import { logger } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      const searchObj = location.search as Record<string, unknown> | undefined;
      const isDemoMode =
        typeof window !== "undefined" &&
        (localStorage.getItem("hacksync:demo-mode") === "true" ||
          searchObj?.["demo"] === "true" ||
          searchObj?.["demo"] === true ||
          location.href?.includes("demo=true"));

      const { data, error } = await supabase.auth.getUser();

      if ((error || !data.user) && !isDemoMode) {
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
      return { user: data?.user ?? null };
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
