import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsService } from "@/lib/services";
import { workspaceRepository } from "./workspace.repository";
import { useActiveProjectId } from "@/hooks/useActiveProject";
import { DEMO_WORKSPACE } from "./demo-data";
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
      let validId = targetId;
      if (
        validId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validId)
      ) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("hacksync:active-project-id");
        }
        validId = null;
      }

      if (!validId) {
        // Look up first accessible project if no active ID selected
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return null;

        const userProjects = await workspaceRepository.getUserProjects(user.id);
        const firstProj = userProjects[0];

        if (!firstProj && user) {
          try {
            // Auto-provision initial starter workspace for authenticated user with 0 projects
            const newProj = await projectsService.createProject({
              name: "CampusMesh (Starter Workspace)",
              description: "Full-stack real-time collaboration workspace with contracts and schema.",
              role: "owner",
              displayName: user.email?.split("@")[0] || "Team Lead",
              userId: user.id,
            });

            // Seed initial items
            try {
              await Promise.all([
                (supabase.from("api_contracts") as any).insert([
                  {
                    project_id: newProj.id,
                    route: "/api/events",
                    method: "GET",
                    summary: "List all upcoming hackathon events",
                    description: "Returns an array of upcoming hackathon events with metadata.",
                    response_schema: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } } },
                    owner_role: "backend",
                    locked: true,
                    status: "implemented",
                    test_status: "passing",
                    version: "v1",
                  },
                  {
                    project_id: newProj.id,
                    route: "/api/events/:id/rsvp",
                    method: "POST",
                    summary: "RSVP to a specific event",
                    description: "Registers the current attendee for the designated event.",
                    request_schema: { type: "object", required: ["attendeeId"], properties: { attendeeId: { type: "string" } } },
                    response_schema: { type: "object", properties: { success: { type: "boolean" } } },
                    owner_role: "backend",
                    locked: true,
                    status: "agreed",
                    test_status: "passing",
                    version: "v1",
                  },
                ]),
                (supabase.from("db_tables") as any).insert([
                  {
                    project_id: newProj.id,
                    name: "events",
                    description: "Hackathon scheduled events and workshops",
                    migration_status: "migrated",
                    rls_enabled: true,
                  },
                  {
                    project_id: newProj.id,
                    name: "rsvps",
                    description: "RSVP attendee registration records",
                    migration_status: "migrated",
                    rls_enabled: true,
                  },
                ]),
                (supabase.from("tasks") as any).insert([
                  {
                    project_id: newProj.id,
                    title: "Lock events GET API contract",
                    area: "backend",
                    assigned_role: "backend",
                    status: "done",
                    priority: "high",
                  },
                  {
                    project_id: newProj.id,
                    title: "Connect Frontend EventList component",
                    area: "frontend",
                    assigned_role: "frontend",
                    status: "in_progress",
                    priority: "high",
                  },
                ]),
                (supabase.from("env_vars") as any).insert([
                  {
                    project_id: newProj.id,
                    key_name: "DATABASE_URL",
                    example_value: "postgresql://postgres:***@db.example.com:5432/postgres",
                    description: "Primary PostgreSQL connection string",
                    configured: true,
                    required: true,
                  },
                ]),
              ]);
            } catch {
              // Non-blocking
            }

            if (typeof window !== "undefined") {
              localStorage.setItem("hacksync:active-project-id", newProj.id);
            }
            return await workspaceRepository.getWorkspace(newProj.id);
          } catch (autoErr) {
            console.warn("Auto-provision starter project notice:", autoErr);
          }
        }

        if (!firstProj) return null;
        return workspaceRepository.getWorkspace(firstProj.id);
      }

      return workspaceRepository.getWorkspace(validId);
    },
    staleTime: 10_000,
    retry: (failureCount, error) => {
      // Don't retry on 404 Not Found or UUID syntax errors
      if (error.message.includes("not found") || error.message.includes("invalid input syntax")) {
        return false;
      }
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
