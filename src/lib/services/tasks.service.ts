import { supabase } from "@/integrations/supabase/client";
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/lib/validation/schemas";
import { DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/errors";
import type { Task } from "@/lib/hacksync/types";

export const tasksService = {
  async createTask(input: CreateTaskInput): Promise<Task> {
    const validated = createTaskSchema.parse(input);

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: validated.project_id,
        title: validated.title,
        area: validated.area,
        priority: validated.priority,
        status: validated.status,
        assignee_role: validated.assignee_role ?? null,
        depends_on: validated.depends_on ?? null,
        blocker: validated.blocker ?? null,
      })
      .select("*")
      .single();

    if (error || !task) {
      logger.error("Failed to create task", error, undefined, validated.project_id);
      throw new DatabaseError(error?.message ?? "Task creation failed", error);
    }

    return task as Task;
  },

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const validated = updateTaskSchema.parse(input);

    const updatePayload: Record<string, unknown> = {};
    if (validated.title !== undefined) updatePayload["title"] = validated.title;
    if (validated.area !== undefined) updatePayload["area"] = validated.area;
    if (validated.priority !== undefined) updatePayload["priority"] = validated.priority;
    if (validated.status !== undefined) updatePayload["status"] = validated.status;
    if (validated.assignee_role !== undefined) updatePayload["assignee_role"] = validated.assignee_role;
    if (validated.depends_on !== undefined) updatePayload["depends_on"] = validated.depends_on;
    if (validated.blocker !== undefined) updatePayload["blocker"] = validated.blocker;

    const { data: updated, error } = await supabase
      .from("tasks")
      .update(updatePayload as any)
      .eq("id", taskId)
      .select("*")
      .single();

    if (error || !updated) {
      logger.error("Failed to update task", error);
      throw new DatabaseError(error?.message ?? "Task update failed", error);
    }

    return updated as Task;
  },

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      logger.error("Failed to delete task", error);
      throw new DatabaseError(error.message, error);
    }
  },
};
