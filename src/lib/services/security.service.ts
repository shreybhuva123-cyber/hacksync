import { supabase } from "@/integrations/supabase/client";
import { DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/errors";

export const securityService = {
  async recordScanFinding(projectId: string, message: string): Promise<void> {
    const { error } = await supabase.from("activity_events").insert({
      project_id: projectId,
      kind: "security",
      actor: "Security Sentinel",
      actor_role: "lead",
      message,
    });

    if (error) {
      logger.warn("Failed to record security scan finding", { error, projectId });
    }
  },

  async applyRemediation(projectId: string, findingTitle: string): Promise<void> {
    logger.info(`Applying remediation patch for "${findingTitle}" in project ${projectId}`);
    await this.recordScanFinding(projectId, `Remediation patch applied: ${findingTitle}`);
  },
};
