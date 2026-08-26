export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor: string | null;
          actor_role: string | null;
          created_at: string;
          id: string;
          kind: string;
          message: string;
          project_id: string;
        };
        Insert: {
          actor?: string | null;
          actor_role?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          message: string;
          project_id: string;
        };
        Update: {
          actor?: string | null;
          actor_role?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          message?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      api_contracts: {
        Row: {
          auth_required: boolean;
          created_at: string;
          id: string;
          locked: boolean;
          method: string;
          owner_role: string;
          project_id: string;
          request_schema: string | null;
          response_schema: string | null;
          route: string;
          status: string;
          summary: string | null;
          test_status: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          auth_required?: boolean;
          created_at?: string;
          id?: string;
          locked?: boolean;
          method?: string;
          owner_role?: string;
          project_id: string;
          request_schema?: string | null;
          response_schema?: string | null;
          route: string;
          status?: string;
          summary?: string | null;
          test_status?: string;
          updated_at?: string;
          version?: string;
        };
        Update: {
          auth_required?: boolean;
          created_at?: string;
          id?: string;
          locked?: boolean;
          method?: string;
          owner_role?: string;
          project_id?: string;
          request_schema?: string | null;
          response_schema?: string | null;
          route?: string;
          status?: string;
          summary?: string | null;
          test_status?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_contracts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      code_nodes: {
        Row: {
          area: string;
          content: string | null;
          id: string;
          kind: string;
          language: string | null;
          owner_role: string | null;
          parent_path: string | null;
          path: string;
          project_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          area?: string;
          content?: string | null;
          id?: string;
          kind?: string;
          language?: string | null;
          owner_role?: string | null;
          parent_path?: string | null;
          path: string;
          project_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          area?: string;
          content?: string | null;
          id?: string;
          kind?: string;
          language?: string | null;
          owner_role?: string | null;
          parent_path?: string | null;
          path?: string;
          project_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "code_nodes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_comments: {
        Row: {
          author_name: string | null;
          author_role: string | null;
          body: string;
          contract_id: string | null;
          created_at: string;
          id: string;
          project_id: string;
        };
        Insert: {
          author_name?: string | null;
          author_role?: string | null;
          body: string;
          contract_id?: string | null;
          created_at?: string;
          id?: string;
          project_id: string;
        };
        Update: {
          author_name?: string | null;
          author_role?: string | null;
          body?: string;
          contract_id?: string | null;
          created_at?: string;
          id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contract_comments_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "api_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contract_comments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      db_columns: {
        Row: {
          data_type: string;
          id: string;
          is_indexed: boolean;
          is_nullable: boolean;
          is_primary: boolean;
          name: string;
          ordinal: number;
          project_id: string;
          references_table: string | null;
          table_id: string;
        };
        Insert: {
          data_type: string;
          id?: string;
          is_indexed?: boolean;
          is_nullable?: boolean;
          is_primary?: boolean;
          name: string;
          ordinal?: number;
          project_id: string;
          references_table?: string | null;
          table_id: string;
        };
        Update: {
          data_type?: string;
          id?: string;
          is_indexed?: boolean;
          is_nullable?: boolean;
          is_primary?: boolean;
          name?: string;
          ordinal?: number;
          project_id?: string;
          references_table?: string | null;
          table_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "db_columns_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "db_columns_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "db_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      db_tables: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          migration_status: string;
          name: string;
          owner_role: string;
          project_id: string;
          schema_version: string;
          sql_definition: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          migration_status?: string;
          name: string;
          owner_role?: string;
          project_id: string;
          schema_version?: string;
          sql_definition?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          migration_status?: string;
          name?: string;
          owner_role?: string;
          project_id?: string;
          schema_version?: string;
          sql_definition?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "db_tables_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      env_vars: {
        Row: {
          configured: boolean;
          description: string | null;
          example_value: string | null;
          id: string;
          key_name: string;
          project_id: string;
          required: boolean;
          scope: string;
          used_in: string | null;
        };
        Insert: {
          configured?: boolean;
          description?: string | null;
          example_value?: string | null;
          id?: string;
          key_name: string;
          project_id: string;
          required?: boolean;
          scope?: string;
          used_in?: string | null;
        };
        Update: {
          configured?: boolean;
          description?: string | null;
          example_value?: string | null;
          id?: string;
          key_name?: string;
          project_id?: string;
          required?: boolean;
          scope?: string;
          used_in?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "env_vars_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      git_branches: {
        Row: {
          ahead: number;
          behind: number;
          id: string;
          integration_ready: boolean;
          last_commit_at: string | null;
          last_commit_message: string | null;
          last_commit_sha: string | null;
          merge_status: string;
          name: string;
          owner_name: string | null;
          owner_role: string;
          project_id: string;
        };
        Insert: {
          ahead?: number;
          behind?: number;
          id?: string;
          integration_ready?: boolean;
          last_commit_at?: string | null;
          last_commit_message?: string | null;
          last_commit_sha?: string | null;
          merge_status?: string;
          name: string;
          owner_name?: string | null;
          owner_role?: string;
          project_id: string;
        };
        Update: {
          ahead?: number;
          behind?: number;
          id?: string;
          integration_ready?: boolean;
          last_commit_at?: string | null;
          last_commit_message?: string | null;
          last_commit_sha?: string | null;
          merge_status?: string;
          name?: string;
          owner_name?: string | null;
          owner_role?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "git_branches_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      handoffs: {
        Row: {
          api_changes: string | null;
          author_name: string | null;
          author_role: string;
          created_at: string;
          env_required: string | null;
          files_affected: string | null;
          id: string;
          known_issues: string | null;
          project_id: string;
          schema_changes: string | null;
          summary: string | null;
          test_instructions: string | null;
          title: string;
        };
        Insert: {
          api_changes?: string | null;
          author_name?: string | null;
          author_role?: string;
          created_at?: string;
          env_required?: string | null;
          files_affected?: string | null;
          id?: string;
          known_issues?: string | null;
          project_id: string;
          schema_changes?: string | null;
          summary?: string | null;
          test_instructions?: string | null;
          title: string;
        };
        Update: {
          api_changes?: string | null;
          author_name?: string | null;
          author_role?: string;
          created_at?: string;
          env_required?: string | null;
          files_affected?: string | null;
          id?: string;
          known_issues?: string | null;
          project_id?: string;
          schema_changes?: string | null;
          summary?: string | null;
          test_instructions?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "handoffs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      health_checks: {
        Row: {
          category: string;
          critical: boolean;
          detail: string | null;
          id: string;
          last_run_at: string;
          name: string;
          project_id: string;
          status: string;
        };
        Insert: {
          category?: string;
          critical?: boolean;
          detail?: string | null;
          id?: string;
          last_run_at?: string;
          name: string;
          project_id: string;
          status?: string;
        };
        Update: {
          category?: string;
          critical?: boolean;
          detail?: string | null;
          id?: string;
          last_run_at?: string;
          name?: string;
          project_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "health_checks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_links: {
        Row: {
          contract_id: string | null;
          created_at: string;
          feature_name: string;
          frontend_path: string | null;
          id: string;
          notes: string | null;
          project_id: string;
          status: string;
          tables: string[];
          updated_at: string;
        };
        Insert: {
          contract_id?: string | null;
          created_at?: string;
          feature_name: string;
          frontend_path?: string | null;
          id?: string;
          notes?: string | null;
          project_id: string;
          status?: string;
          tables?: string[];
          updated_at?: string;
        };
        Update: {
          contract_id?: string | null;
          created_at?: string;
          feature_name?: string;
          frontend_path?: string | null;
          id?: string;
          notes?: string | null;
          project_id?: string;
          status?: string;
          tables?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_links_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "api_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_links_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          author_role: string | null;
          body: string;
          created_at: string;
          id: string;
          project_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          author_role?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          project_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_role?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          branch_name: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          id: string;
          last_seen_at: string;
          online: boolean;
          project_id: string;
          role: string;
          user_id: string | null;
          working_area: string | null;
        };
        Insert: {
          branch_name?: string | null;
          created_at?: string;
          display_name: string;
          email?: string | null;
          id?: string;
          last_seen_at?: string;
          online?: boolean;
          project_id: string;
          role: string;
          user_id?: string | null;
          working_area?: string | null;
        };
        Update: {
          branch_name?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id?: string;
          last_seen_at?: string;
          online?: boolean;
          project_id?: string;
          role?: string;
          user_id?: string | null;
          working_area?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_branch: string;
          demo_mode: boolean;
          description: string | null;
          id: string;
          invite_code: string;
          is_open_demo: boolean;
          name: string;
          repo_url: string | null;
          schema_version: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_branch?: string;
          demo_mode?: boolean;
          description?: string | null;
          id?: string;
          invite_code?: string;
          is_open_demo?: boolean;
          name: string;
          repo_url?: string | null;
          schema_version?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_branch?: string;
          demo_mode?: boolean;
          description?: string | null;
          id?: string;
          invite_code?: string;
          is_open_demo?: boolean;
          name?: string;
          repo_url?: string | null;
          schema_version?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          area: string;
          assignee_role: string | null;
          blocker: string | null;
          created_at: string;
          depends_on: string | null;
          id: string;
          priority: string;
          project_id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          area?: string;
          assignee_role?: string | null;
          blocker?: string | null;
          created_at?: string;
          depends_on?: string | null;
          id?: string;
          priority?: string;
          project_id: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          area?: string;
          assignee_role?: string | null;
          blocker?: string | null;
          created_at?: string;
          depends_on?: string | null;
          id?: string;
          priority?: string;
          project_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_access_project: { Args: { pid: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
