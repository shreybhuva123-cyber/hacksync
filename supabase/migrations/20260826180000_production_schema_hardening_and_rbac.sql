-- ============================================================================
-- HackSync Production Schema Hardening, Constraints & RBAC Migration
-- Timestamp: 2026-08-26 18:00:00 UTC
-- Enforces canonical roles, table constraints, foreign key indexes,
-- Security Definer authorization helpers, and RPC endpoints.
-- ============================================================================

-- 1. Ensure Canonical Role Check Constraint on project_members
DO $$
BEGIN
  -- Drop existing role check if present
  ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
  -- Add canonical role check
  ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check 
    CHECK (role IN ('owner', 'lead', 'backend', 'database', 'frontend', 'member'));
EXCEPTION WHEN OTHERS THEN
  -- Handle gracefully if table structure is being initialized
  NULL;
END $$;

-- 2. Add Missing Uniqueness & Integrity Constraints
DO $$
BEGIN
  -- Prevent duplicate memberships for same user in same project
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_project_member_user'
  ) THEN
    ALTER TABLE public.project_members ADD CONSTRAINT unique_project_member_user 
      UNIQUE (project_id, user_id);
  END IF;

  -- Prevent duplicate contract routes in same project
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_project_contract_route'
  ) THEN
    ALTER TABLE public.api_contracts ADD CONSTRAINT unique_project_contract_route 
      UNIQUE (project_id, method, route);
  END IF;

  -- Prevent duplicate table names in same project
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_project_db_table'
  ) THEN
    ALTER TABLE public.db_tables ADD CONSTRAINT unique_project_db_table 
      UNIQUE (project_id, name);
  END IF;

  -- Prevent duplicate column names in same table
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_table_column_name'
  ) THEN
    ALTER TABLE public.db_columns ADD CONSTRAINT unique_table_column_name 
      UNIQUE (table_id, name);
  END IF;
END $$;

-- 3. Optimized Foreign Key & Query Indexes
CREATE INDEX IF NOT EXISTS idx_members_project_user ON public.project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON public.api_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tables_project ON public.db_tables(project_id);
CREATE INDEX IF NOT EXISTS idx_columns_table ON public.db_columns(table_id);
CREATE INDEX IF NOT EXISTS idx_columns_project_table ON public.db_columns(project_id, table_id);
CREATE INDEX IF NOT EXISTS idx_activity_project_created ON public.activity_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_nodes_project ON public.code_nodes(project_id);

-- 4. Granular Authorization Helper Functions (Security Definer)
CREATE OR REPLACE FUNCTION public.can_view_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = pid AND (p.is_open_demo = true OR p.demo_mode = true)
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

-- 5. Server RPC Authorization Functions (No Self-Service Escalation)
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_member_id uuid,
  p_new_role text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user text;
BEGIN
  IF p_new_role NOT IN ('owner', 'lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  SELECT project_id, user_id INTO v_project_id, v_target_user
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  IF NOT public.can_manage_members(v_project_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only project owners and leads can change member roles.';
  END IF;

  UPDATE public.project_members
  SET role = p_new_role
  WHERE id = p_member_id;

  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (v_project_id, 'member', 'Changed member role to ' || p_new_role);

  RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'role', p_new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_member_from_project(
  p_member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user text;
  v_target_role text;
BEGIN
  SELECT project_id, user_id, role INTO v_project_id, v_target_user, v_target_role
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the project owner.';
  END IF;

  IF NOT (public.can_manage_members(v_project_id) OR v_target_user = auth.uid()::text) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to remove this member.';
  END IF;

  DELETE FROM public.project_members WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true, 'removed_member_id', p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_presence(
  p_member_id uuid,
  p_working_area text DEFAULT NULL,
  p_branch_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.project_members
  SET 
    online = true,
    last_seen_at = now()::text,
    working_area = COALESCE(p_working_area, working_area),
    branch_name = COALESCE(p_branch_name, branch_name)
  WHERE id = p_member_id AND user_id = auth.uid()::text;
END;
$$;

-- 6. Grant Permissions
GRANT EXECUTE ON FUNCTION public.can_view_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_contracts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_schema(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member_from_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_presence(uuid, text, text) TO authenticated;

-- 7. Hardened Row Level Security (RLS) Policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_nodes ENABLE ROW LEVEL SECURITY;

-- Projects Policies
DROP POLICY IF EXISTS "read accessible projects" ON public.projects;
DROP POLICY IF EXISTS "update accessible projects" ON public.projects;
DROP POLICY IF EXISTS "delete own projects" ON public.projects;
CREATE POLICY "read accessible projects" ON public.projects FOR SELECT TO authenticated USING (public.can_view_project(id));
CREATE POLICY "update accessible projects" ON public.projects FOR UPDATE TO authenticated USING (public.can_edit_project(id));
CREATE POLICY "delete own projects" ON public.projects FOR DELETE TO authenticated USING (public.can_delete_project(id));

-- Project Members Policies (Only lead/owner can modify roles, members cannot promote themselves)
DROP POLICY IF EXISTS "members readable" ON public.project_members;
DROP POLICY IF EXISTS "members insert" ON public.project_members;
DROP POLICY IF EXISTS "members update" ON public.project_members;
DROP POLICY IF EXISTS "members delete" ON public.project_members;
DROP POLICY IF EXISTS "members_update_role_lead_only" ON public.project_members;

CREATE POLICY "members readable" ON public.project_members FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY "members insert" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.can_manage_members(project_id) OR auth.uid() = user_id);
CREATE POLICY "members_update_role_lead_only" ON public.project_members FOR UPDATE TO authenticated USING (public.can_manage_members(project_id));
CREATE POLICY "members delete" ON public.project_members FOR DELETE TO authenticated USING (public.can_manage_members(project_id) OR auth.uid() = user_id);

-- API Contracts Policies (Owner, Lead, Backend only)
DROP POLICY IF EXISTS "api_contracts_read" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_insert" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_update" ON public.api_contracts;
DROP POLICY IF EXISTS "api_contracts_delete" ON public.api_contracts;
CREATE POLICY "api_contracts_read" ON public.api_contracts FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY "api_contracts_insert" ON public.api_contracts FOR INSERT TO authenticated WITH CHECK (public.can_manage_contracts(project_id));
CREATE POLICY "api_contracts_update" ON public.api_contracts FOR UPDATE TO authenticated USING (public.can_manage_contracts(project_id));
CREATE POLICY "api_contracts_delete" ON public.api_contracts FOR DELETE TO authenticated USING (public.can_manage_contracts(project_id));

-- DB Tables Policies (Owner, Lead, Database only)
DROP POLICY IF EXISTS "db_tables_read" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_insert" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_update" ON public.db_tables;
DROP POLICY IF EXISTS "db_tables_delete" ON public.db_tables;
CREATE POLICY "db_tables_read" ON public.db_tables FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY "db_tables_insert" ON public.db_tables FOR INSERT TO authenticated WITH CHECK (public.can_manage_schema(project_id));
CREATE POLICY "db_tables_update" ON public.db_tables FOR UPDATE TO authenticated USING (public.can_manage_schema(project_id));
CREATE POLICY "db_tables_delete" ON public.db_tables FOR DELETE TO authenticated USING (public.can_manage_schema(project_id));

-- DB Columns Policies (Owner, Lead, Database only)
DROP POLICY IF EXISTS "db_columns_read" ON public.db_columns;
DROP POLICY IF EXISTS "db_columns_insert" ON public.db_columns;
DROP POLICY IF EXISTS "db_columns_update" ON public.db_columns;
DROP POLICY IF EXISTS "db_columns_delete" ON public.db_columns;
CREATE POLICY "db_columns_read" ON public.db_columns FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY "db_columns_insert" ON public.db_columns FOR INSERT TO authenticated WITH CHECK (public.can_manage_schema(project_id));
CREATE POLICY "db_columns_update" ON public.db_columns FOR UPDATE TO authenticated USING (public.can_manage_schema(project_id));
CREATE POLICY "db_columns_delete" ON public.db_columns FOR DELETE TO authenticated USING (public.can_manage_schema(project_id));
