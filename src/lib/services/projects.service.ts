import { supabase } from "@/integrations/supabase/client";
import {
  createProjectSchema,
  updateProjectSchema,
  joinProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type JoinProjectInput,
} from "@/lib/validation/schemas";
import { ValidationError, DatabaseError, NotFoundError, AuthorizationError } from "@/lib/errors";
import { logger } from "@/lib/errors";
import type { Project } from "@/lib/hacksync/types";

export const projectsService = {
  /**
   * Create a new project with owner membership
   */
  async createProject(input: CreateProjectInput): Promise<Project> {
    const validated = createProjectSchema.parse(input);

    logger.info(`Creating project "${validated.name}" for user ${validated.userId}`);

    // 1. Insert project
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        name: validated.name,
        description: validated.description ?? null,
        repo_url: validated.repo_url ?? null,
        default_branch: validated.default_branch,
        created_by: validated.userId,
      })
      .select("*")
      .single();

    if (pErr || !project) {
      logger.error("Failed to insert project", pErr);
      throw new DatabaseError("Failed to create project: " + (pErr?.message ?? "Unknown error"), pErr);
    }

    // 2. Add creator as project owner/lead member
    const { error: mErr } = await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: validated.userId,
      display_name: validated.displayName,
      role: validated.role === "owner" || validated.role === "lead" ? validated.role : "lead",
      online: true,
    });

    if (mErr) {
      logger.error("Failed to add project owner member", mErr, undefined, project.id, validated.userId);
      // Clean up project on failed member insert
      await supabase.from("projects").delete().eq("id", project.id);
      throw new DatabaseError("Failed to initialize project membership: " + mErr.message, mErr);
    }

    // 3. Log initial activity
    await supabase.from("activity_events").insert({
      project_id: project.id,
      kind: "project",
      actor: validated.displayName,
      actor_role: validated.role,
      message: `Created project "${project.name}"`,
    });

    return project as Project;
  },

  /**
   * Update an existing project's metadata
   */
  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    const validated = updateProjectSchema.parse(input);

    const { data: updated, error } = await supabase
      .from("projects")
      .update(validated as any)
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) {
      logger.error("Failed to update project", error, undefined, projectId);
      throw new DatabaseError(error.message, error);
    }

    return updated as Project;
  },

  /**
   * Delete a project (Owner only)
   */
  async deleteProject(projectId: string): Promise<void> {
    logger.warn(`Deleting project ${projectId}`);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      logger.error("Failed to delete project", error, undefined, projectId);
      throw new DatabaseError(error.message, error);
    }
  },

  /**
   * Join an existing project using an invite code
   */
  async joinProject(input: JoinProjectInput): Promise<Project> {
    const validated = joinProjectSchema.parse(input);

    // 1. Locate project
    const { data: project, error: findErr } = await supabase
      .from("projects")
      .select("*")
      .eq("invite_code", validated.inviteCode)
      .maybeSingle();

    if (findErr) throw new DatabaseError(findErr.message, findErr);
    if (!project) throw new NotFoundError("Project with that invite code");

    // 2. Check existing membership
    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("user_id", validated.userId)
      .maybeSingle();

    if (existing) {
      return project as Project;
    }

    // 3. Add as new member via secure RPC (no direct table INSERT — RLS blocks self-insert)
    const joinRole = validated.role === "owner" ? "member" : validated.role;
    const { error: joinErr } = await (supabase.rpc as any)("join_project_by_code", {
      p_invite_code: validated.inviteCode,
      p_display_name: validated.displayName,
      p_role: joinRole,
    });

    if (joinErr) throw new DatabaseError(joinErr.message, joinErr);

    await supabase.from("activity_events").insert({
      project_id: project.id,
      kind: "member",
      actor: validated.displayName,
      actor_role: joinRole,
      message: `Joined project as ${validated.role} engineer`,
    });

    return project as Project;
  },
};
