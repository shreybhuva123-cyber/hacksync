-- ============================================================================
-- HackSync Complete Production Database Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqyecjwhyjyryqykhcxa/sql
-- ============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles Table & Trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Developer',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "own profile write" ON public.profiles;
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  repo_url text,
  default_branch text NOT NULL DEFAULT 'main',
  schema_version text NOT NULL DEFAULT 'v1',
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text),1,6)),
  is_open_demo boolean NOT NULL DEFAULT false,
  demo_mode boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Project Members Table (with canonical 6-role check)
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  email text,
  role text NOT NULL CHECK (role IN ('owner','lead','backend','database','frontend','member')),
  branch_name text,
  working_area text,
  online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Helper RBAC Functions
CREATE OR REPLACE FUNCTION public.can_view_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.is_open_demo = true
  ) OR EXISTS (
    SELECT 1 FROM public.project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_members(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'lead')
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_contracts(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'lead', 'backend')
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_schema(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'lead', 'database')
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_delete_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.created_by = auth.uid()
  );
$$;

-- 6. Projects & Members RLS Policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read accessible projects" ON public.projects;
CREATE POLICY "read accessible projects" ON public.projects FOR SELECT TO authenticated USING (public.can_view_project(id));

DROP POLICY IF EXISTS "create projects" ON public.projects;
CREATE POLICY "create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update accessible projects" ON public.projects;
CREATE POLICY "update accessible projects" ON public.projects FOR UPDATE TO authenticated USING (public.can_manage_members(id));

DROP POLICY IF EXISTS "delete own projects" ON public.projects;
CREATE POLICY "delete own projects" ON public.projects FOR DELETE TO authenticated USING (public.can_delete_project(id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members readable" ON public.project_members;
CREATE POLICY "members readable" ON public.project_members FOR SELECT TO authenticated USING (public.can_view_project(project_id));

DROP POLICY IF EXISTS "members_insert_secure" ON public.project_members;
CREATE POLICY "members_insert_secure" ON public.project_members FOR INSERT TO authenticated WITH CHECK (
  public.can_manage_members(project_id)
  OR NOT EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id)
);

DROP POLICY IF EXISTS "members_update_role_lead_only" ON public.project_members;
CREATE POLICY "members_update_role_lead_only" ON public.project_members FOR UPDATE TO authenticated USING (public.can_manage_members(project_id));

DROP POLICY IF EXISTS "members_delete_secure" ON public.project_members;
CREATE POLICY "members_delete_secure" ON public.project_members FOR DELETE TO authenticated USING (public.can_manage_members(project_id));

-- 7. Additional Tables (code_nodes, api_contracts, db_tables, db_columns, tasks, activity_events, env_vars, git_branches, handoffs, health_checks, contract_comments)
CREATE TABLE IF NOT EXISTS public.code_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  parent_path text,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','folder')),
  area text NOT NULL DEFAULT 'shared' CHECK (area IN ('frontend','backend','database','shared')),
  owner_role text CHECK (owner_role IN ('owner','lead','backend','database','frontend','member')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','blocked')),
  language text,
  content text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.code_nodes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.code_nodes TO authenticated, service_role;
DROP POLICY IF EXISTS "code_nodes_read" ON public.code_nodes;
CREATE POLICY "code_nodes_read" ON public.code_nodes FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "code_nodes_write" ON public.code_nodes;
CREATE POLICY "code_nodes_write" ON public.code_nodes FOR ALL TO authenticated USING (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.api_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  route text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  summary text,
  description text,
  request_schema text,
  response_schema text,
  owner_role text NOT NULL DEFAULT 'backend' CHECK (owner_role IN ('owner','lead','backend','database','frontend','member')),
  locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','agreed','implemented','deprecated')),
  test_status text NOT NULL DEFAULT 'untested' CHECK (test_status IN ('untested','passing','failing')),
  auth_required boolean NOT NULL DEFAULT false,
  version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_contracts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.api_contracts TO authenticated, service_role;
DROP POLICY IF EXISTS "contracts_read" ON public.api_contracts;
CREATE POLICY "contracts_read" ON public.api_contracts FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "contracts_manage" ON public.api_contracts;
CREATE POLICY "contracts_manage" ON public.api_contracts FOR ALL TO authenticated USING (public.can_manage_contracts(project_id));

CREATE TABLE IF NOT EXISTS public.db_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rls_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','migrated','deprecated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.db_tables ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.db_tables TO authenticated, service_role;
DROP POLICY IF EXISTS "tables_read" ON public.db_tables;
CREATE POLICY "tables_read" ON public.db_tables FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "tables_manage" ON public.db_tables;
CREATE POLICY "tables_manage" ON public.db_tables FOR ALL TO authenticated USING (public.can_manage_schema(project_id));

CREATE TABLE IF NOT EXISTS public.db_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.db_tables(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  data_type text NOT NULL,
  is_nullable boolean NOT NULL DEFAULT true,
  is_primary_key boolean NOT NULL DEFAULT false,
  is_foreign_key boolean NOT NULL DEFAULT false,
  references_table text,
  default_value text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.db_columns ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.db_columns TO authenticated, service_role;
DROP POLICY IF EXISTS "columns_read" ON public.db_columns;
CREATE POLICY "columns_read" ON public.db_columns FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "columns_manage" ON public.db_columns;
CREATE POLICY "columns_manage" ON public.db_columns FOR ALL TO authenticated USING (public.can_manage_schema(project_id));

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_role text NOT NULL CHECK (assigned_role IN ('owner','lead','backend','database','frontend','member')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','blocked')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tasks TO authenticated, service_role;
DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read" ON public.tasks FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "tasks_manage" ON public.tasks;
CREATE POLICY "tasks_manage" ON public.tasks FOR ALL TO authenticated USING (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  actor text,
  actor_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.activity_events TO authenticated, service_role;
DROP POLICY IF EXISTS "events_read" ON public.activity_events;
CREATE POLICY "events_read" ON public.activity_events FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "events_insert" ON public.activity_events;
CREATE POLICY "events_insert" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.env_vars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  example_value text,
  description text,
  is_secret boolean NOT NULL DEFAULT false,
  required_by text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.env_vars ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.env_vars TO authenticated, service_role;
DROP POLICY IF EXISTS "env_read" ON public.env_vars;
CREATE POLICY "env_read" ON public.env_vars FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "env_manage" ON public.env_vars;
CREATE POLICY "env_manage" ON public.env_vars FOR ALL TO authenticated USING (public.can_manage_members(project_id));

CREATE TABLE IF NOT EXISTS public.git_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_role text NOT NULL CHECK (owner_role IN ('owner','lead','backend','database','frontend','member')),
  purpose text,
  is_merged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.git_branches ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.git_branches TO authenticated, service_role;
DROP POLICY IF EXISTS "branches_read" ON public.git_branches;
CREATE POLICY "branches_read" ON public.git_branches FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "branches_manage" ON public.git_branches;
CREATE POLICY "branches_manage" ON public.git_branches FOR ALL TO authenticated USING (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_role text NOT NULL CHECK (from_role IN ('owner','lead','backend','database','frontend','member')),
  to_role text NOT NULL CHECK (to_role IN ('owner','lead','backend','database','frontend','member')),
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.handoffs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.handoffs TO authenticated, service_role;
DROP POLICY IF EXISTS "handoffs_read" ON public.handoffs;
CREATE POLICY "handoffs_read" ON public.handoffs FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "handoffs_manage" ON public.handoffs;
CREATE POLICY "handoffs_manage" ON public.handoffs FOR ALL TO authenticated USING (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','healthy','degraded','down')),
  latency_ms integer,
  last_checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.health_checks TO authenticated, service_role;
DROP POLICY IF EXISTS "health_read" ON public.health_checks;
CREATE POLICY "health_read" ON public.health_checks FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "health_manage" ON public.health_checks;
CREATE POLICY "health_manage" ON public.health_checks FOR ALL TO authenticated USING (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.contract_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.api_contracts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('owner','lead','backend','database','frontend','member')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_comments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.contract_comments TO authenticated, service_role;
DROP POLICY IF EXISTS "comments_read" ON public.contract_comments;
CREATE POLICY "comments_read" ON public.contract_comments FOR SELECT TO authenticated USING (public.can_view_project(project_id));
DROP POLICY IF EXISTS "comments_insert" ON public.contract_comments;
CREATE POLICY "comments_insert" ON public.contract_comments FOR INSERT TO authenticated WITH CHECK (public.can_view_project(project_id));

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  actor_role text,
  action text NOT NULL,
  target_resource text,
  status text NOT NULL DEFAULT 'SUCCESS',
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.security_audit_events TO authenticated, service_role;
DROP POLICY IF EXISTS "audit_read_owner" ON public.security_audit_events;
CREATE POLICY "audit_read_owner" ON public.security_audit_events FOR SELECT TO authenticated USING (
  public.can_delete_project(project_id) OR actor_id = auth.uid()
);

-- 8. Secure RPC Functions
CREATE OR REPLACE FUNCTION public.join_project_by_code(
  p_invite_code text,
  p_display_name text,
  p_role text DEFAULT 'member'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project record;
  v_existing record;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role for joining: %. Owner role can only be assigned by existing owners.', p_role USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE invite_code = p_invite_code;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing FROM public.project_members WHERE project_id = v_project.id AND user_id = v_caller_id;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_member', true, 'project', jsonb_build_object('id', v_project.id, 'name', v_project.name));
  END IF;

  INSERT INTO public.project_members (project_id, user_id, display_name, role, online)
  VALUES (v_project.id, v_caller_id, p_display_name, p_role, true);

  BEGIN
    INSERT INTO public.security_audit_events (project_id, actor_id, actor_role, action, target_resource, status, metadata)
    VALUES (v_project.id, v_caller_id, p_role, 'MEMBER_JOINED_VIA_CODE', v_project.id::text, 'SUCCESS', jsonb_build_object('invite_code_used', true, 'assigned_role', p_role));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (v_project.id, 'member', p_display_name || ' joined via invite code as ' || p_role);

  RETURN jsonb_build_object('success', true, 'already_member', false, 'project', jsonb_build_object('id', v_project.id, 'name', v_project.name));
END; $$;
GRANT EXECUTE ON FUNCTION public.join_project_by_code(text, text, text) TO authenticated;

-- 8b. Create Project With Owner (Atomic RPC)
CREATE OR REPLACE FUNCTION public.create_project_with_owner(
  p_name text,
  p_description text DEFAULT NULL,
  p_repo_url text DEFAULT NULL,
  p_default_branch text DEFAULT 'main',
  p_role text DEFAULT 'lead',
  p_display_name text DEFAULT 'Team Lead'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id uuid;
  v_project_id uuid;
  v_project record;
  v_role text;
  v_invite_code text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a project' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Project name must be at least 2 characters' USING ERRCODE = '22000';
  END IF;

  v_role := CASE WHEN p_role IN ('owner', 'lead', 'frontend', 'backend', 'database') THEN p_role ELSE 'lead' END;
  
  -- Generate 6-char uppercase invite code
  v_invite_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  -- 1. Insert project
  INSERT INTO public.projects (
    name, description, repo_url, default_branch, created_by, invite_code, schema_version
  ) VALUES (
    trim(p_name), p_description, p_repo_url, COALESCE(p_default_branch, 'main'), v_caller_id, v_invite_code, 'v1.0.0'
  ) RETURNING * INTO v_project;

  v_project_id := v_project.id;

  -- 2. Add creator to project_members
  INSERT INTO public.project_members (
    project_id, user_id, display_name, email, role, online
  ) VALUES (
    v_project_id,
    v_caller_id,
    COALESCE(p_display_name, 'Team Lead'),
    (SELECT email FROM auth.users WHERE id = v_caller_id),
    v_role,
    true
  );

  -- 3. Log initial activity event
  INSERT INTO public.activity_events (
    project_id, kind, actor, actor_role, message
  ) VALUES (
    v_project_id,
    'project',
    COALESCE(p_display_name, 'Team Lead'),
    v_role,
    'Created project "' || v_project.name || '"'
  );

  RETURN to_jsonb(v_project);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_project_with_owner(text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_member_id uuid,
  p_new_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user_id uuid;
  v_target_old_role text;
  v_caller_id uuid;
  v_caller_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_new_role NOT IN ('owner', 'lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
  END IF;

  SELECT project_id, user_id, role INTO v_project_id, v_target_user_id, v_target_old_role
  FROM public.project_members WHERE id = p_member_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Member not found: %', p_member_id USING ERRCODE = 'P0002'; END IF;

  SELECT role INTO v_caller_role FROM public.project_members WHERE project_id = v_project_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id AND created_by = v_caller_id) THEN
      v_caller_role := 'owner';
    ELSE
      RAISE EXCEPTION 'Unauthorized: You are not a member of this project' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_caller_role NOT IN ('owner', 'lead') THEN
    RAISE EXCEPTION 'Unauthorized: Only owners and leads can change member roles' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role = 'lead' AND p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Team leads cannot promote members to the owner role' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role = 'lead' AND v_target_old_role = 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Team leads cannot modify the project owner role' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_members SET role = p_new_role WHERE id = p_member_id;

  BEGIN
    INSERT INTO public.security_audit_events (project_id, actor_id, actor_role, action, target_resource, status, metadata)
    VALUES (v_project_id, v_caller_id, v_caller_role, 'ROLE_CHANGE', p_member_id::text, 'SUCCESS',
      jsonb_build_object('target_user_id', v_target_user_id, 'old_role', v_target_old_role, 'new_role', p_new_role));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'old_role', v_target_old_role, 'new_role', p_new_role);
END; $$;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_member_from_project(
  p_member_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user_id uuid;
  v_target_role text;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  SELECT project_id, user_id, role INTO v_project_id, v_target_user_id, v_target_role
  FROM public.project_members WHERE id = p_member_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Member not found: %', p_member_id USING ERRCODE = 'P0002'; END IF;
  IF v_target_role = 'owner' THEN RAISE EXCEPTION 'Cannot remove the project owner' USING ERRCODE = '42501'; END IF;

  IF NOT (public.can_manage_members(v_project_id) OR v_target_user_id = v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to remove this member' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.project_members WHERE id = p_member_id;
  RETURN jsonb_build_object('success', true, 'removed_member_id', p_member_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.remove_member_from_project(uuid) TO authenticated;

-- 9. Seed 1 Standard Open Demo Project (CampusMesh)
DO $$
DECLARE
  v_demo_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_demo_id) THEN
    INSERT INTO public.projects (
      id, name, description, repo_url, default_branch, schema_version, invite_code, is_open_demo, demo_mode
    ) VALUES (
      v_demo_id,
      'CampusMesh (Demo Workspace)',
      'Campus event mesh built during hackathon with React, Node/Express and PostgreSQL.',
      'https://github.com/hacksync/campusmesh',
      'main',
      'v2.1.0',
      'DEMO99',
      true,
      true
    );

    -- Seed Members
    INSERT INTO public.project_members (project_id, display_name, email, role, online) VALUES
      (v_demo_id, 'Arjun Patel', 'arjun@campusmesh.dev', 'lead', true),
      (v_demo_id, 'Priya Sharma', 'priya@campusmesh.dev', 'frontend', true),
      (v_demo_id, 'Rahul Verma', 'rahul@campusmesh.dev', 'backend', true),
      (v_demo_id, 'Meera Nair', 'meera@campusmesh.dev', 'database', false);

    -- Seed Contracts
    INSERT INTO public.api_contracts (project_id, route, method, summary, description, request_schema, response_schema, owner_role, locked, status, test_status, version) VALUES
      (v_demo_id, '/api/events', 'GET', 'List campus events', 'Returns array of upcoming campus events', null, '{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"}}}}', 'backend', true, 'implemented', 'passing', 'v1'),
      (v_demo_id, '/api/events/:id/rsvp', 'POST', 'RSVP to event', 'Registers user attendance for event', '{"type":"object","required":["attendeeId"],"properties":{"attendeeId":{"type":"string"}}}', '{"type":"object","properties":{"success":{"type":"boolean"}}}', 'backend', true, 'agreed', 'passing', 'v1');

    -- Seed Tables
    INSERT INTO public.db_tables (project_id, name, description, status, rls_enabled) VALUES
      (v_demo_id, 'events', 'Campus events table', 'migrated', true),
      (v_demo_id, 'rsvps', 'RSVP records table', 'migrated', true);

    -- Seed Tasks
    INSERT INTO public.tasks (project_id, title, description, assigned_role, status, priority) VALUES
      (v_demo_id, 'Lock events GET contract', 'Finalize OpenAPI schema for event listings', 'backend', 'done', 'high'),
      (v_demo_id, 'Connect Frontend EventList component', 'Wire React component to live endpoint', 'frontend', 'in_progress', 'high');

    -- Seed Env Vars
    INSERT INTO public.env_vars (project_id, key, example_value, description, is_secret, required_by) VALUES
      (v_demo_id, 'DATABASE_URL', 'postgresql://postgres:***@db.campusmesh.dev:5432/postgres', 'Primary database connection', true, ARRAY['backend','database']);
  END IF;
END $$;
