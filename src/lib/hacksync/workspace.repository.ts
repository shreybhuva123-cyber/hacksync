import { supabase } from "@/integrations/supabase/client";
import { DatabaseError, NotFoundError, logger } from "@/lib/errors";
import type {
  ActivityEvent,
  ApiContract,
  CodeNode,
  ContractComment,
  DbColumn,
  DbTable,
  EnvVar,
  GitBranch,
  Handoff,
  HealthCheck,
  IntegrationLink,
  Member,
  Note,
  Project,
  Task,
  Workspace,
} from "./types";

export const workspaceRepository = {
  /**
   * Fetch a single project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      logger.error(`Failed to fetch project ${projectId}`, error);
      throw new DatabaseError(`Could not load project: ${error.message}`, error);
    }

    return (data as Project) ?? null;
  },

  /**
   * Fetch all projects accessible to the authenticated user
   */
  async getUserProjects(userId?: string | null): Promise<Project[]> {
    if (!userId) {
      // Return open demo projects if unauthenticated
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("is_open_demo", true)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Failed to fetch open demo projects", error);
        throw new DatabaseError("Failed to load demo projects", error);
      }
      return (data as Project[]) ?? [];
    }

    // Authenticated user query
    const { data: memberRows, error: memberErr } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId);

    if (memberErr) {
      logger.error("Failed to query user project memberships", memberErr);
      throw new DatabaseError("Failed to load user projects", memberErr);
    }

    const projectIds = Array.from(new Set(memberRows?.map((r) => r.project_id) ?? []));

    let query = supabase.from("projects").select("*");
    if (projectIds.length > 0) {
      query = query.or(`created_by.eq.${userId},id.in.(${projectIds.join(",")}),is_open_demo.eq.true`);
    } else {
      query = query.or(`created_by.eq.${userId},is_open_demo.eq.true`);
    }

    const { data: projects, error: projErr } = await query.order("created_at", {
      ascending: false,
    });

    if (projErr) {
      logger.error("Failed to fetch user projects", projErr);
      throw new DatabaseError("Failed to fetch projects", projErr);
    }

    return (projects as Project[]) ?? [];
  },

  /**
   * Load a full production workspace.
   * NEVER returns fake mock data for authenticated production paths.
   */
  async getWorkspace(projectId: string): Promise<Workspace> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID "${projectId}" was not found.`);
    }

    const pid = project.id;

    // Fetch all related entities concurrently
    const [
      membersRes,
      contractsRes,
      tablesRes,
      tasksRes,
      activityRes,
      codeNodesRes,
      linksRes,
      branchesRes,
      envVarsRes,
      checksRes,
      notesRes,
      handoffsRes,
      commentsRes,
    ] = await Promise.all([
      supabase.from("project_members").select("*").eq("project_id", pid),
      supabase.from("api_contracts").select("*").eq("project_id", pid).order("route"),
      supabase.from("db_tables").select("*").eq("project_id", pid).order("name"),
      supabase.from("tasks").select("*").eq("project_id", pid).order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(50),
      supabase.from("code_nodes").select("*").eq("project_id", pid).order("file_path"),
      supabase.from("integration_links").select("*").eq("project_id", pid),
      supabase.from("git_branches").select("*").eq("project_id", pid),
      supabase.from("env_vars").select("*").eq("project_id", pid),
      supabase.from("health_checks").select("*").eq("project_id", pid),
      supabase.from("notes").select("*").eq("project_id", pid),
      supabase.from("handoffs").select("*").eq("project_id", pid),
      supabase.from("contract_comments").select("*").eq("project_id", pid),
    ]);

    // Fetch columns for tables
    const tableIds = (tablesRes.data ?? []).map((t) => t.id);
    let columns: DbColumn[] = [];
    if (tableIds.length > 0) {
      const { data: cols } = await supabase
        .from("db_columns")
        .select("*")
        .in("table_id", tableIds)
        .order("ordinal_position");
      columns = (cols as DbColumn[]) ?? [];
    }

    return {
      project,
      members: (membersRes.data as Member[]) ?? [],
      contracts: (contractsRes.data as ApiContract[]) ?? [],
      tables: (tablesRes.data as DbTable[]) ?? [],
      columns,
      tasks: (tasksRes.data as Task[]) ?? [],
      activity: (activityRes.data as ActivityEvent[]) ?? [],
      codeNodes: (codeNodesRes.data as CodeNode[]) ?? [],
      links: (linksRes.data as IntegrationLink[]) ?? [],
      branches: (branchesRes.data as GitBranch[]) ?? [],
      envVars: (envVarsRes.data as EnvVar[]) ?? [],
      checks: (checksRes.data as HealthCheck[]) ?? [],
      notes: (notesRes.data as Note[]) ?? [],
      handoffs: (handoffsRes.data as Handoff[]) ?? [],
      comments: (commentsRes.data as ContractComment[]) ?? [],
    };
  },
};
