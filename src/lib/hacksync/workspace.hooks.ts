import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WORKSPACE_KEY } from "./workspace.queries";
import type { Workspace, ApiContract } from "./types";

/**
 * Subscribes to PostgreSQL realtime changes for the active project
 * and invalidates React Query cache on external updates.
 */
export function useWorkspaceRealtime(activeProjectId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!activeProjectId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `hacksync-ws-${activeProjectId}-${Date.now()}`;
      channel = supabase
        .channel(channelId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            filter: `project_id=eq.${activeProjectId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, activeProjectId] });
            queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
          },
        )
        .subscribe();
    } catch {
      // Ignore realtime subscription errors in offline mode
    }

    return () => {
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [queryClient, activeProjectId]);
}

/**
 * Memoized helper to index contracts by ID
 */
export function useContractsById(ws: Workspace | null | undefined) {
  return useMemo(() => {
    const map = new Map<string, ApiContract>();
    ws?.contracts.forEach((c) => map.set(c.id, c));
    return map;
  }, [ws]);
}
