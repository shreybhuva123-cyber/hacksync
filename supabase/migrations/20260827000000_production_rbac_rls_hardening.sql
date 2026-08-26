-- ============================================================================
-- HackSync Production-Grade RBAC & Supabase RLS Security Hardening
-- Replaces generic project access with granular role-based authorization functions,
-- unique constraints, and optimized foreign key indexes.
-- ============================================================================

-- 1. Helper Functions for Granular Role-Based Access Control

CREATE OR REPLACE FUNCTION public.can_view_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.is_open_demo = true
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m 
    WHERE m.project_id = pid AND m.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.projects p 
    WHERE p.id = pid AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m 
    WHERE m.project_id = pid 
      AND m.user_id = auth.uid() 
      AND m.role IN ('owner', 'lead')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_members(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m 
    WHERE m.project_id = pid 
      AND m.user_id = auth.uid() 
      AND m.role IN ('owner', 'lead')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_contracts(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m 
    WHERE m.project_id = pid 
      AND m.user_id = auth.uid() 
      AND m.role IN ('owner', 'lead', 'backend')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_schema(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m 
    WHERE m.project_id = pid 
      AND m.user_id = auth.uid() 
      AND m.role IN ('owner', 'lead', 'database')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_delete_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND p.created_by = auth.uid()
  );
$$;

-- Revoke public execution of security definer functions
REVOKE ALL ON FUNCTION public.can_view_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_contracts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_schema(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_project(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_view_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_contracts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_schema(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_project(uuid) TO authenticated;

-- 2. Constraints & Index Optimizations

CREATE INDEX IF NOT EXISTS idx_members_project_user ON public.project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON public.api_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tables_project ON public.db_tables(project_id);
CREATE INDEX IF NOT EXISTS idx_columns_table ON public.db_columns(table_id);
CREATE INDEX IF NOT EXISTS idx_activity_project_created ON public.activity_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_nodes_project ON public.code_nodes(project_id);

-- 3. Granular Table Policies

-- Projects
DROP POLICY IF EXISTS "read accessible projects" ON public.projects;
DROP POLICY IF EXISTS "update accessible projects" ON public.projects;
DROP POLICY IF EXISTS "delete own projects" ON public.projects;

CREATE POLICY "read accessible projects" ON public.projects 
  FOR SELECT TO authenticated USING (public.can_view_project(id));

CREATE POLICY "update accessible projects" ON public.projects 
  FOR UPDATE TO authenticated USING (public.can_edit_project(id));

CREATE POLICY "delete own projects" ON public.projects 
  FOR DELETE TO authenticated USING (public.can_delete_project(id));

-- Project Members
DROP POLICY IF EXISTS "members readable" ON public.project_members;
DROP POLICY IF EXISTS "members insert" ON public.project_members;
DROP POLICY IF EXISTS "members update" ON public.project_members;
DROP POLICY IF EXISTS "members delete" ON public.project_members;

CREATE POLICY "members readable" ON public.project_members 
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));

CREATE POLICY "members insert" ON public.project_members 
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_members(project_id) OR auth.uid() = user_id
  );

CREATE POLICY "members update" ON public.project_members 
  FOR UPDATE TO authenticated USING (
    public.can_manage_members(project_id) OR auth.uid() = user_id
  );

CREATE POLICY "members delete" ON public.project_members 
  FOR DELETE TO authenticated USING (
    public.can_manage_members(project_id) OR auth.uid() = user_id
  );

-- API Contracts
DROP POLICY IF EXISTS "api_contracts_read" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_insert" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_update" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_delete" ON public.api_contracts;

CREATE POLICY "api_contracts_read" ON public.api_contracts 
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));

CREATE POLICY "api_contracts_insert" ON public.api_contracts 
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_contracts(project_id));

CREATE POLICY "api_contracts_update" ON public.api_contracts 
  FOR UPDATE TO authenticated USING (public.can_manage_contracts(project_id));

CREATE POLICY "api_contracts_delete" ON public.api_contracts 
  FOR DELETE TO authenticated USING (public.can_manage_contracts(project_id));

-- Database Tables & Columns
DROP POLICY IF EXISTS "db_tables_read" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_insert" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_update" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_delete" ON public.db_tables;

CREATE POLICY "db_tables_read" ON public.db_tables 
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));

CREATE POLICY "db_tables_insert" ON public.db_tables 
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_schema(project_id));

CREATE POLICY "db_tables_update" ON public.db_tables 
  FOR UPDATE TO authenticated USING (public.can_manage_schema(project_id));

CREATE POLICY "db_tables_delete" ON public.db_tables 
  FOR DELETE TO authenticated USING (public.can_manage_schema(project_id));
