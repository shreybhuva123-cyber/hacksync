import { supabase } from "@/integrations/supabase/client";
import { roleEnum, type ProjectRole } from "@/lib/validation/schemas";
import { DatabaseError, AuthorizationError } from "@/lib/errors";
import { logger } from "@/lib/errors";
import type { Member } from "@/lib/hacksync/types";

export const membersService = {
  async updateRole(memberId: string, role: string): Promise<Member> {
    const validatedRole = roleEnum.parse(role) as ProjectRole;

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

  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) {
      logger.error("Failed to remove member", error);
      throw new DatabaseError(error.message, error);
    }
  },

  async updatePresence(memberId: string, workingArea?: string, branchName?: string): Promise<void> {
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
