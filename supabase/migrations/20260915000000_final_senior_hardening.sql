-- ==============================================================================
-- HACKSYNC FINAL SENIOR ENGINEERING HARDENING MIGRATION
-- Migration: 20260915000000_final_senior_hardening.sql
-- 
-- Objectives:
-- 1. Eliminate all permissive USING (true) and WITH CHECK (true) policies
-- 2. Enforce strict Member File Privacy (members only access their own private files;
--    owners/leads have administrative oversight)
-- 3. Enforce multi-tenant project isolation for file_versions, sync_sessions, and github_pushes
-- 4. Provide atomic PostgreSQL approval consumption function
-- ==============================================================================

-- 1. HARDEN MEMBER_FILES RLS POLICIES
DROP POLICY IF EXISTS "member_files_select_policy" ON public.member_files;
DROP POLICY IF EXISTS "member_files_insert_policy" ON public.member_files;
DROP POLICY IF EXISTS "member_files_update_policy" ON public.member_files;
DROP POLICY IF EXISTS "member_files_delete_policy" ON public.member_files;

-- Member can view own files; project leads/owners can view all project member files
CREATE POLICY "member_files_select_policy" ON public.member_files
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()::text
      OR public.can_manage_members(project_id)
    )
  );

-- Member can only insert files owned by themselves into projects they belong to
CREATE POLICY "member_files_insert_policy" ON public.member_files
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()::text
    AND public.can_view_project(project_id)
  );

-- Member can only update their own files; leads/owners can update project files
CREATE POLICY "member_files_update_policy" ON public.member_files
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()::text
      OR public.can_manage_members(project_id)
    )
  );

-- Member can only delete their own files; leads/owners can delete project files
CREATE POLICY "member_files_delete_policy" ON public.member_files
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()::text
      OR public.can_manage_members(project_id)
    )
  );

-- 2. HARDEN FILE_VERSIONS RLS POLICIES (Remove USING (true))
DROP POLICY IF EXISTS "file_versions_select_policy" ON public.file_versions;
DROP POLICY IF EXISTS "file_versions_insert_policy" ON public.file_versions;

CREATE POLICY "file_versions_select_policy" ON public.file_versions
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.can_view_project(project_id)
  );

CREATE POLICY "file_versions_insert_policy" ON public.file_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_view_project(project_id)
  );

-- 3. HARDEN SYNC_SESSIONS RLS POLICIES (Remove USING (true))
DROP POLICY IF EXISTS "sync_sessions_select_policy" ON public.sync_sessions;
DROP POLICY IF EXISTS "sync_sessions_insert_policy" ON public.sync_sessions;

CREATE POLICY "sync_sessions_select_policy" ON public.sync_sessions
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.can_view_project(project_id)
  );

CREATE POLICY "sync_sessions_insert_policy" ON public.sync_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_view_project(project_id)
  );

-- 4. HARDEN GITHUB_PUSHES RLS POLICIES (Remove USING (true))
DROP POLICY IF EXISTS "github_pushes_select_policy" ON public.github_pushes;
DROP POLICY IF EXISTS "github_pushes_insert_policy" ON public.github_pushes;

-- Members can view push records for their project
CREATE POLICY "github_pushes_select_policy" ON public.github_pushes
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.can_view_project(project_id)
  );

-- Only leads or owners can record GitHub pushes
CREATE POLICY "github_pushes_insert_policy" ON public.github_pushes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_manage_members(project_id)
  );

-- 5. ATOMIC APPROVAL CONSUMPTION STORED PROCEDURE
CREATE OR REPLACE FUNCTION public.consume_approval_atomic(
  p_approval_id text,
  p_user_id text,
  p_project_id text,
  p_decision text DEFAULT 'approved'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_updated_record record;
BEGIN
  -- 1. Ensure authenticated caller
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to resolve approval requests.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify project role (leads or owners only)
  SELECT role INTO v_caller_role
  FROM public.project_members
  WHERE project_id = p_project_id::uuid AND user_id = v_caller_id::text;

  IF v_caller_role IS NULL OR v_caller_role = 'member' THEN
    RAISE EXCEPTION 'Permission denied: Lead or owner role required to approve code mutations.' USING ERRCODE = '42501';
  END IF;

  -- 3. Atomic update with strict concurrency protection (exactly one concurrent caller succeeds)
  UPDATE public.ai_approval_requests
  SET
    status = p_decision,
    resolved_by = v_caller_id,
    resolved_at = now()
  WHERE id = p_approval_id
    AND project_id = p_project_id::uuid
    AND status = 'pending'
    AND expires_at > now()
  RETURNING * INTO v_updated_record;

  IF v_updated_record IS NULL THEN
    RAISE EXCEPTION 'Approval request % is invalid, expired, or already resolved.', p_approval_id USING ERRCODE = '23505';
  END IF;

  RETURN to_jsonb(v_updated_record);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_approval_atomic(text, text, text, text) TO authenticated;
