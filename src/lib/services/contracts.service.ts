import { supabase } from "@/integrations/supabase/client";
import {
  createContractSchema,
  updateContractSchema,
  type CreateContractInput,
  type UpdateContractInput,
} from "@/lib/validation/schemas";
import { DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/errors";
import type { ApiContract } from "@/lib/hacksync/types";

export const contractsService = {
  async createContract(input: CreateContractInput): Promise<ApiContract> {
    const validated = createContractSchema.parse(input);

    const { data: contract, error } = await supabase
      .from("api_contracts")
      .insert({
        project_id: validated.project_id,
        method: validated.method,
        route: validated.route,
        summary: validated.summary ?? null,
        request_schema: validated.request_schema ?? null,
        response_schema: validated.response_schema ?? null,
        auth_required: validated.auth_required,
        status: validated.status,
        owner_role: validated.owner_role,
        version: validated.version,
        test_status: validated.test_status,
        locked: validated.locked,
      })
      .select("*")
      .single();

    if (error || !contract) {
      logger.error("Failed to create API contract", error, undefined, validated.project_id);
      throw new DatabaseError(error?.message ?? "API contract creation failed", error);
    }

    return contract as ApiContract;
  },

  async updateContract(contractId: string, input: UpdateContractInput): Promise<ApiContract> {
    const validated = updateContractSchema.parse(input);

    const { data: updated, error } = await supabase
      .from("api_contracts")
      .update(validated as any)
      .eq("id", contractId)
      .select("*")
      .single();

    if (error || !updated) {
      logger.error("Failed to update contract", error);
      throw new DatabaseError(error?.message ?? "API contract update failed", error);
    }

    return updated as ApiContract;
  },

  async toggleLock(contract: ApiContract): Promise<ApiContract> {
    const newLock = !contract.locked;
    const { data: updated, error } = await supabase
      .from("api_contracts")
      .update({ locked: newLock })
      .eq("id", contract.id)
      .select("*")
      .single();

    if (error || !updated) {
      logger.error("Failed to toggle lock on contract", error);
      throw new DatabaseError(error?.message ?? "Lock toggle failed", error);
    }

    await supabase.from("activity_events").insert({
      project_id: contract.project_id,
      kind: "contract",
      message: `${newLock ? "Locked" : "Unlocked"} contract ${contract.method} ${contract.route}`,
    });

    return updated as ApiContract;
  },

  async deleteContract(contractId: string): Promise<void> {
    const { error } = await supabase.from("api_contracts").delete().eq("id", contractId);
    if (error) {
      logger.error("Failed to delete contract", error);
      throw new DatabaseError(error.message, error);
    }
  },
};
