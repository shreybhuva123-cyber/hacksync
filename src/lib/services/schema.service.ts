import { supabase } from "@/integrations/supabase/client";
import {
  createDbTableSchema,
  createDbColumnSchema,
  type CreateDbTableInput,
  type CreateDbColumnInput,
} from "@/lib/validation/schemas";
import { DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/errors";
import type { DbTable, DbColumn } from "@/lib/hacksync/types";

export const schemaService = {
  async createTable(input: CreateDbTableInput): Promise<DbTable> {
    const validated = createDbTableSchema.parse(input);

    const { data: table, error } = await supabase
      .from("db_tables")
      .insert({
        project_id: validated.project_id,
        name: validated.name,
        description: validated.description ?? null,
        owner_role: validated.owner_role,
        schema_version: validated.schema_version,
        migration_status: validated.migration_status,
        sql_definition: validated.sql_definition ?? null,
      })
      .select("*")
      .single();

    if (error || !table) {
      logger.error("Failed to create database table", error, undefined, validated.project_id);
      throw new DatabaseError(error?.message ?? "Table creation failed", error);
    }

    // Auto-create standard primary key column 'id'
    await supabase.from("db_columns").insert({
      table_id: table.id,
      project_id: validated.project_id,
      name: "id",
      data_type: "uuid",
      is_primary: true,
      is_nullable: false,
      is_indexed: true,
      ordinal: 1,
    });

    return table as DbTable;
  },

  async deleteTable(tableId: string): Promise<void> {
    const { error } = await supabase.from("db_tables").delete().eq("id", tableId);
    if (error) {
      logger.error("Failed to delete database table", error);
      throw new DatabaseError(error.message, error);
    }
  },

  async addColumn(input: CreateDbColumnInput): Promise<DbColumn> {
    const validated = createDbColumnSchema.parse(input);

    const { data: col, error } = await supabase
      .from("db_columns")
      .insert({
        table_id: validated.table_id,
        project_id: validated.project_id,
        name: validated.name,
        data_type: validated.data_type,
        is_nullable: validated.is_nullable,
        is_primary: validated.is_primary,
        is_indexed: validated.is_indexed,
        references_table: validated.references_table ?? null,
        ordinal: validated.ordinal,
      })
      .select("*")
      .single();

    if (error || !col) {
      logger.error("Failed to add column", error);
      throw new DatabaseError(error?.message ?? "Column creation failed", error);
    }

    return col as DbColumn;
  },
};
