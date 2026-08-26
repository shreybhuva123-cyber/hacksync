import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { workspaceRepository } from "./workspace.repository";
import { useActiveProjectId } from "@/hooks/useActiveProject";
import type { Workspace, Project } from "./types";

export const WORKSPACE_KEY = ["hacksync", "workspace"] as const;
export const USER_PROJECTS_KEY = ["hacksync", "user-projects"] as const;

/**
 * Primary hook to query the active workspace.
 * Returns real workspace data or error status (no silent fake-data fallback).
 */
export function useWorkspace(explicitProjectId?: string | null) {
  const [activeProjectId] = useActiveProjectId();
  const targetId = explicitProjectId !== undefined ? explicitProjectId : activeProjectId;

  return useQuery<Workspace | null, Error>({
    queryKey: [...WORKSPACE_KEY, targetId],
    queryFn: async () => {
      if (!targetId) {
        // Look up first accessible project if no active ID selected
        const { data: { user } } = await supabase.auth.getUser();
        const userProjects = await workspaceRepository.getUserProjects(user?.id);
        const firstProj = userProjects[0];
        if (!firstProj) return null;
        return workspaceRepository.getWorkspace(firstProj.id);
      }

      return workspaceRepository.getWorkspace(targetId);
    },
    staleTime: 10_000,
    retry: (failureCount, error) => {
      // Don't retry on 404 Not Found
      if (error.message.includes("not found")) return false;
      return failureCount < 2;
    },
  });
}

/**
 * Hook to query all accessible projects for the current user.
 */
export function useUserProjects() {
  return useQuery<Project[], Error>({
    queryKey: USER_PROJECTS_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return workspaceRepository.getUserProjects(user?.id);
    },
    staleTime: 30_000,
  });
}
