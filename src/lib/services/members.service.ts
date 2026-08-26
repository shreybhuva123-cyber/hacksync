import { supabase } from "@/integrations/supabase/client";
import { roleEnum, type ProjectRole } from "@/lib/validation/schemas";
import { canManageMembers } from "@/lib/hacksync/permissions";
import { DatabaseError, AuthorizationError, logger } from "@/lib/errors";
import type { Member } from "@/lib/hacksync/types";

export const membersService = {
  /**
   * Update a member's role with strict RBAC authorization check.
   * Prevents self-service privilege escalation (e.g. member -> owner/lead).
   */
  async updateRole(
    memberId: string,
    role: string,
    callerRole?: string | null,
  ): Promise<Member> {
    const validatedRole = roleEnum.parse(role) as ProjectRole;

    // Strict client-side privilege escalation guard
    if (callerRole && !canManageMembers(callerRole)) {
      throw new AuthorizationError(
        "Only project owners and team leads can change member roles. Self-service role promotion is prohibited.",
      );
    }

    // Strict hierarchy rule: Lead cannot promote anyone to owner
    if (callerRole === "lead" && validatedRole === "owner") {
      throw new AuthorizationError(
        "Permission denied: Team leads cannot create or promote members to the owner role. Only existing project owners can assign the owner role.",
      );
    }

    // 1. Try server RPC function (with server-side SECURITY DEFINER check)
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)("change_member_role", {
        p_member_id: memberId,
        p_new_role: validatedRole,
      });

      if (!rpcErr && rpcRes) {
        // Fetch updated member record
        const { data: updated } = await supabase
          .from("project_members")
          .select("*")
          .eq("id", memberId)
          .single();
        if (updated) return updated as Member;
      }
    } catch {
      // Fallback to direct guarded table update if RPC not yet deployed in DB
    }

    // 2. Direct table update fallback (enforced by RLS)
    const { data: updated, error } = await supabase
      .from("project_members")
      .update({ role: validatedRole })
      .eq("id", memberId)
      .select("*")
      .single();

    if (error || !updated) {
      logger.error("Failed to update member role", error);
      throw new DatabaseError(error?.message ?? "Role update failed", error);
    }

    return updated as Member;
  },

  /**
   * Join a project securely using a valid invitation token.
   */
  async joinByInvite(inviteToken: string): Promise<{ success: boolean; projectId?: string; role?: string }> {
    const { data, error } = await (supabase.rpc as any)("join_project_by_invite", {
      p_invite_token: inviteToken,
    });

    if (error) {
      logger.error("Failed to join project via invite", error);
      throw new DatabaseError(error.message, error);
    }

    return data;
  },

  /**
   * Remove a member from the project.
   * Only accessible to leads/owners or members voluntarily leaving.
   */
  async removeMember(
    memberId: string,
    callerRole?: string | null,
    isSelfLeave = false,
  ): Promise<void> {
    if (callerRole && !canManageMembers(callerRole) && !isSelfLeave) {
      throw new AuthorizationError(
        "You do not have permission to remove team members from this project.",
      );
    }

    // Try server RPC
    try {
      const { error: rpcErr } = await (supabase.rpc as any)("remove_member_from_project", {
        p_member_id: memberId,
      });
      if (!rpcErr) return;
    } catch {
      // Fallback to direct table delete
    }

    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) {
      logger.error("Failed to remove member", error);
      throw new DatabaseError(error.message, error);
    }
  },

  /**
   * Update active user presence without altering any role permissions.
   */
  async updatePresence(
    memberId: string,
    workingArea?: string | null,
    branchName?: string | null,
  ): Promise<void> {
    await supabase
      .from("project_members")
      .update({
        online: true,
        last_seen_at: new Date().toISOString(),
        working_area: workingArea ?? null,
        branch_name: branchName ?? null,
      })
      .eq("id", memberId);
  },
};
