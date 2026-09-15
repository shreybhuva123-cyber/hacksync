import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setActiveProjectId } from "@/hooks/useActiveProject";
import {
  projectsService,
  tasksService,
  contractsService,
  schemaService,
  membersService,
  joinRequestsService,
} from "@/lib/services";
import { WORKSPACE_KEY, USER_PROJECTS_KEY } from "./workspace.queries";
import type { CreateProjectInput, JoinProjectInput } from "@/lib/validation/schemas";

// ─── Project Mutations ──────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      return await projectsService.createProject(input);
    },
    onSuccess: (project) => {
      setActiveProjectId(project.id);
      queryClient.invalidateQueries({ queryKey: USER_PROJECTS_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
    },
  });
}

export function useJoinProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: JoinProjectInput) => {
      return await projectsService.joinProject(input);
    },
    onSuccess: (project) => {
      setActiveProjectId(project.id);
      queryClient.invalidateQueries({ queryKey: USER_PROJECTS_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
    },
  });
}

export function useRequestToJoinProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: joinRequestsService.requestToJoin,
    onSuccess: (res) => {
      if (res.status === "already_member") {
        setActiveProjectId(res.projectId);
        queryClient.invalidateQueries({ queryKey: USER_PROJECTS_KEY });
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
      }
    },
  });
}

export function useReviewJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: joinRequestsService.reviewJoinRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
    },
  });
}

export function useAddMemberByIdentifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: joinRequestsService.addMemberByIdentifier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false });
    },
  });
}

// ─── Task Domain Hooks ──────────────────────────────────────────────────

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tasksService.createTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof tasksService.updateTask>[1] }) =>
      tasksService.updateTask(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tasksService.deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

// ─── Contract Domain Hooks ──────────────────────────────────────────────

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: contractsService.createContract,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof contractsService.updateContract>[1] }) =>
      contractsService.updateContract(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useToggleLockContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: contractsService.toggleLock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: contractsService.deleteContract,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

// ─── Database Schema Hooks ──────────────────────────────────────────────

export function useCreateTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schemaService.createTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useDeleteTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schemaService.deleteTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useAddColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schemaService.addColumn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

// ─── Member Hooks (Guarded against Privilege Escalation) ─────────────────

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role, callerRole }: { id: string; role: string; callerRole?: string | null }) =>
      membersService.updateRole(id, role, callerRole),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, callerRole, isSelfLeave }: { id: string; callerRole?: string | null; isSelfLeave?: boolean }) =>
      membersService.removeMember(id, callerRole, isSelfLeave),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

// ─── Activity Log Helper ────────────────────────────────────────────────

export async function logActivity(
  projectId: string,
  kind: string,
  message: string,
  actor = "You",
  actorRole = "lead",
) {
  try {
    await supabase
      .from("activity_events")
      .insert({ project_id: projectId, kind, message, actor, actor_role: actorRole });
  } catch {
    // Ignore offline logging errors
  }
}

// ─── Legacy Mutation Helpers for Backward Compatibility ─────────────────

export function useRowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table: string; id: string; values: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from(input.table).update(input.values).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useRowInsert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table: string; values: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from(input.table).insert(input.values);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

export function useRowDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table: string; id: string }) => {
      const { error } = await (supabase as any).from(input.table).delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY, exact: false }),
  });
}

