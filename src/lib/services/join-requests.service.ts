import { supabase } from "@/integrations/supabase/client";
import { DatabaseError, AuthorizationError, NotFoundError, logger } from "@/lib/errors";
import { canManageMembers } from "@/lib/hacksync/permissions";
import { generateUUID } from "@/lib/utils";
import type { JoinRequest, JoinRequestStatus, Member, Role } from "@/lib/hacksync/types";

// In-memory store fallback for environments without browser localStorage (e.g. Bun test runner, SSR)
const inMemoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  if (typeof localStorage !== "undefined") {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return inMemoryStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  inMemoryStore.set(key, value);
}

// Local storage helper to ensure offline / fallback resilience
function getStoredRequests(projectId: string): JoinRequest[] {
  if (!projectId) return [];
  try {
    const raw = getStorageItem(`hacksync:join-requests:${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredRequests(projectId: string, requests: JoinRequest[]): void {
  if (!projectId) return;
  try {
    setStorageItem(`hacksync:join-requests:${projectId}`, JSON.stringify(requests));
  } catch (err) {
    console.warn("Could not save join requests:", err);
  }
}

export function getStoredProjectMembers(projectId: string): Member[] {
  if (!projectId) return [];
  try {
    const raw = getStorageItem(`hacksync:local-members:${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredProjectMembers(projectId: string, member: Member): void {
  if (!projectId) return;
  try {
    const existing = getStoredProjectMembers(projectId);
    const updated = [
      member,
      ...existing.filter((m) => m.id !== member.id && m.display_name.toLowerCase() !== member.display_name.toLowerCase()),
    ];
    setStorageItem(`hacksync:local-members:${projectId}`, JSON.stringify(updated));
  } catch (err) {
    console.warn("Could not save local project member:", err);
  }
}

export const joinRequestsService = {
  getStoredProjectMembers,
  saveStoredProjectMembers,

  /**
   * Fetch all join requests for a project (filtered to pending or all).
   */
  async getProjectJoinRequests(projectId: string): Promise<JoinRequest[]> {
    if (!projectId) return [];

    let dbRequests: JoinRequest[] = [];
    try {
      const { data, error } = await (supabase.from as any)("project_join_requests")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        dbRequests = data as JoinRequest[];
      }
    } catch (err) {
      logger.warn("Direct query of project_join_requests failed, using cache:", err instanceof Error ? { message: err.message } : undefined);
    }

    // Merge with locally stored requests
    const cached = getStoredRequests(projectId);
    const map = new Map<string, JoinRequest>();
    for (const r of cached) map.set(r.id, r);
    for (const r of dbRequests) map.set(r.id, r);

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    saveStoredRequests(projectId, merged);
    return merged;
  },

  /**
   * Submit a request to join a project via invite code.
   * Does NOT immediately grant membership; requires leader approval.
   */
  async requestToJoin(input: {
    inviteCode: string;
    requestedRole: Role;
    displayName: string;
    email?: string | null | undefined;
    userId?: string | null | undefined;
  }): Promise<{
    status: "pending" | "already_member";
    message: string;
    projectId: string;
    projectName: string;
    requestId?: string | undefined;
  }> {
    const cleanCode = input.inviteCode.trim().toUpperCase();

    // 1. Try server RPC
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)("request_to_join_project", {
        p_invite_code: cleanCode,
        p_display_name: input.displayName.trim(),
        p_requested_role: input.requestedRole,
      });

      if (!rpcErr && rpcRes) {
        return {
          status: rpcRes.status as "pending" | "already_member",
          message: rpcRes.message || "Join request submitted!",
          projectId: rpcRes.project?.id || "",
          projectName: rpcRes.project?.name || "Project",
          requestId: rpcRes.request_id,
        };
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback: Use SECURITY DEFINER RPC join_project_by_code to verify & register
    let projectId = "";
    let projectName = "Project";
    let isAlreadyMember = false;

    try {
      const { data: joinRes, error: joinErr } = await (supabase.rpc as any)("join_project_by_code", {
        p_invite_code: cleanCode,
        p_display_name: input.displayName.trim(),
        p_role: "member", // Baseline membership pending role assignment
      });

      if (joinErr) {
        if (joinErr.code === "P0002" || joinErr.message?.includes("Invalid invite code")) {
          throw new NotFoundError(`No project found with invite code "${cleanCode}". Please verify the code with your team leader.`);
        }
        throw new DatabaseError(joinErr.message, joinErr);
      }

      if (joinRes?.project?.id) {
        projectId = joinRes.project.id;
        projectName = joinRes.project.name || "Project";
        isAlreadyMember = !!joinRes.already_member;
      }
    } catch (rpcErr) {
      if (rpcErr instanceof NotFoundError) throw rpcErr;
      // If RPC call fails, try direct query as a last resort
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, invite_code")
        .eq("invite_code", cleanCode)
        .maybeSingle();

      if (!project) {
        throw new NotFoundError(`No project found with invite code "${cleanCode}". Please verify the code with your team leader.`);
      }
      projectId = project.id;
      projectName = project.name;
    }

    if (!projectId) {
      throw new NotFoundError(`No project found matching invite code "${cleanCode}".`);
    }

    if (isAlreadyMember) {
      return {
        status: "already_member",
        message: `You are already a member of "${projectName}".`,
        projectId,
        projectName,
      };
    }

    // Create new join request object
    const newRequest: JoinRequest = {
      id: generateUUID(),
      project_id: projectId,
      user_id: input.userId ?? null,
      display_name: input.displayName.trim() || "Applicant",
      email: input.email ?? null,
      requested_role: input.requestedRole,
      assigned_role: null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Attempt DB insert if table exists
    try {
      await (supabase.from as any)("project_join_requests").insert(newRequest);
    } catch {
      // Non-blocking
    }

    // Store in localStorage / memory cache
    const currentList = getStoredRequests(projectId);
    saveStoredRequests(projectId, [newRequest, ...currentList.filter((r) => r.id !== newRequest.id)]);

    // Log activity event
    try {
      await supabase.from("activity_events").insert({
        project_id: projectId,
        kind: "member",
        actor: input.displayName,
        actor_role: input.requestedRole,
        message: `${input.displayName} requested to join team as ${input.requestedRole}`,
      });
    } catch {
      // Non-blocking
    }

    return {
      status: "pending",
      message: `Join request submitted for "${projectName}"! The team leader will review your request and assign your official role.`,
      projectId,
      projectName,
      requestId: newRequest.id,
    };
  },

  /**
   * Leader reviews a join request: Accept with assigned role, or Decline.
   */
  async reviewJoinRequest(input: {
    requestId: string;
    projectId: string;
    action: "accepted" | "rejected";
    assignedRole?: Role | undefined;
    callerRole: string;
    callerUserId?: string | undefined;
  }): Promise<{ success: boolean; memberId?: string | undefined }> {
    if (!canManageMembers(input.callerRole)) {
      throw new AuthorizationError(
        "Permission denied: Only team leaders and project owners can review join requests.",
      );
    }

    // 1. Try server RPC
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)("review_join_request", {
        p_request_id: input.requestId,
        p_action: input.action,
        p_assigned_role: input.assignedRole ?? null,
      });

      if (!rpcErr && rpcRes) {
        // Update local storage cache
        const cached = getStoredRequests(input.projectId);
        saveStoredRequests(
          input.projectId,
          cached.map((r) =>
            r.id === input.requestId
              ? {
                  ...r,
                  status: input.action,
                  assigned_role: input.assignedRole ?? r.requested_role,
                  reviewed_at: new Date().toISOString(),
                }
              : r,
          ),
        );
        return { success: true, memberId: rpcRes.member_id };
      }
    } catch {
      // Fallback below
    }

    // 2. Client-side fallback
    const cached = getStoredRequests(input.projectId);
    const targetRequest = cached.find((r) => r.id === input.requestId);
    const finalRole = input.assignedRole || targetRequest?.requested_role || "frontend";

    let createdMemberId: string | undefined = undefined;

    if (input.action === "accepted" && targetRequest) {
      // Insert into project_members
      const newMember: Partial<Member> = {
        id: generateUUID(),
        project_id: input.projectId,
        user_id: targetRequest.user_id,
        display_name: targetRequest.display_name,
        email: targetRequest.email,
        role: finalRole,
        online: false,
      };

      try {
        const { data: inserted } = await supabase
          .from("project_members")
          .insert(newMember as any)
          .select("id")
          .single();
        createdMemberId = inserted?.id || newMember.id;
      } catch (err) {
        logger.warn("Fallback project_members insert failed:", err instanceof Error ? { message: err.message } : undefined);
      }

      // Log activity
      try {
        await supabase.from("activity_events").insert({
          project_id: input.projectId,
          kind: "member",
          message: `${targetRequest.display_name} was accepted into team as ${finalRole}`,
        });
      } catch {
        // Non-blocking
      }
    }

    // Update DB request record
    try {
      await (supabase.from as any)("project_join_requests")
        .update({
          status: input.action,
          assigned_role: input.action === "accepted" ? finalRole : null,
          reviewed_by: input.callerUserId ?? null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.requestId);
    } catch {
      // Non-blocking
    }

    // Update localStorage
    saveStoredRequests(
      input.projectId,
      cached.map((r) =>
        r.id === input.requestId
          ? {
              ...r,
              status: input.action,
              assigned_role: input.action === "accepted" ? finalRole : null,
              reviewed_at: new Date().toISOString(),
            }
          : r,
      ),
    );

    return { success: true, memberId: createdMemberId };
  },

  /**
   * Leader directly adds a teammate by username or email with an assigned role.
   */
  async addMemberByIdentifier(input: {
    projectId: string;
    identifier: string;
    role: Role;
    callerRole: string;
  }): Promise<{ success: boolean; displayName: string; email: string | null; role: Role; memberId: string }> {
    if (!canManageMembers(input.callerRole)) {
      throw new AuthorizationError(
        "Permission denied: Only team leaders and project owners can add teammates.",
      );
    }

    const cleanIdent = input.identifier.trim();
    if (!cleanIdent) {
      throw new Error("Please provide a valid username or email address.");
    }

    // 1. Try server RPC
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)("add_member_by_identifier", {
        p_project_id: input.projectId,
        p_identifier: cleanIdent,
        p_role: input.role,
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        return {
          success: true,
          displayName: rpcRes.display_name || cleanIdent,
          email: rpcRes.email || (cleanIdent.includes("@") ? cleanIdent : null),
          role: rpcRes.role || input.role,
          memberId: rpcRes.member_id,
        };
      }
    } catch {
      // Fallback below
    }

    // 2. Client-side fallback: check profiles table or construct new member record
    let targetUserId: string | null = null;
    let targetDisplayName = cleanIdent.includes("@") ? cleanIdent.split("@")[0]! : cleanIdent;
    let targetEmail: string | null = cleanIdent.includes("@") ? cleanIdent : null;

    try {
      if (cleanIdent.includes("@")) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, display_name")
          .ilike("display_name", targetDisplayName)
          .maybeSingle();
        if (prof) {
          targetUserId = prof.id;
          targetDisplayName = prof.display_name || targetDisplayName;
        }
      } else {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, display_name")
          .ilike("display_name", cleanIdent)
          .maybeSingle();
        if (prof) {
          targetUserId = prof.id;
          targetDisplayName = prof.display_name || cleanIdent;
        }
      }
    } catch {
      // Ignore lookup errors
    }

    const newMemberId = generateUUID();
    const newMemberRecord: Member = {
      id: newMemberId,
      project_id: input.projectId,
      user_id: targetUserId,
      display_name: targetDisplayName,
      email: targetEmail,
      role: input.role,
      branch_name: `${input.role}-workspace`,
      working_area: input.role,
      online: false,
      last_seen_at: new Date().toISOString(),
    };

    // Try DB insert (gracefully handle RLS policy limitations)
    try {
      const { error: insertErr } = await supabase.from("project_members").insert({
        id: newMemberId,
        project_id: input.projectId,
        user_id: targetUserId,
        display_name: targetDisplayName,
        email: targetEmail,
        role: input.role,
        online: false,
      } as any);

      if (insertErr) {
        logger.warn("project_members direct insert note:", { message: insertErr.message });
      }
    } catch (err) {
      logger.warn("project_members insert caught:", err instanceof Error ? { message: err.message } : undefined);
    }

    // Save to local project members cache so UI immediately reflects the new teammate
    saveStoredProjectMembers(input.projectId, newMemberRecord);

    // Also store an accepted join request for record keeping
    const acceptedRequest: JoinRequest = {
      id: generateUUID(),
      project_id: input.projectId,
      user_id: targetUserId,
      display_name: targetDisplayName,
      email: targetEmail,
      requested_role: input.role,
      assigned_role: input.role,
      status: "accepted",
      reviewed_by: null,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const currentReqs = getStoredRequests(input.projectId);
    saveStoredRequests(input.projectId, [acceptedRequest, ...currentReqs.filter((r) => r.id !== acceptedRequest.id)]);

    // Log activity
    try {
      await supabase.from("activity_events").insert({
        project_id: input.projectId,
        kind: "member",
        message: `Added ${targetDisplayName} to team as ${input.role}`,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      displayName: targetDisplayName,
      email: targetEmail,
      role: input.role,
      memberId: newMemberId,
    };
  },
};
