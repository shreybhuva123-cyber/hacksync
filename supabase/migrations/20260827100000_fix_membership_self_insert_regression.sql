-- ============================================================================
-- HackSync Migration: 20260827100000_fix_membership_self_insert_regression.sql
--
-- SECURITY FIX: Closes the self-insert privilege escalation vulnerability.
--
-- Problem: Migration 20260827000000 re-introduced an INSERT policy on
-- project_members containing "auth.uid() = user_id", which allows any
-- authenticated user to insert themselves into any project with any role
-- (including owner). This completely defeats invitation-only membership.
--
-- Fix: Drop ALL existing INSERT and DELETE policies on project_members,
-- then create exactly ONE secure policy for each operation.
-- Also creates join_project_by_code RPC for invite-code-based joining.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. DROP ALL EXISTING INSERT POLICIES (by every name ever used in any migration)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "members insert" ON public.project_members;
DROP POLICY IF EXISTS "members_insert" ON public.project_members;
DROP POLICY IF EXISTS "project_members_insert_policy" ON public.project_members;
DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
DROP POLICY IF EXISTS "members_insert_secure" ON public.project_members;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. DROP ALL EXISTING DELETE POLICIES (also contained auth.uid() = user_id)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "members delete" ON public.project_members;
DROP POLICY IF EXISTS "members_delete" ON public.project_members;
DROP POLICY IF EXISTS "project_members_delete" ON public.project_members;
DROP POLICY IF EXISTS "members_delete_secure" ON public.project_members;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CREATE EXACTLY ONE SECURE INSERT POLICY
--    Allows: owner/lead to add members, OR first-member bootstrap (project creation)
--    Blocks: any user self-inserting via auth.uid() = user_id
-- ────────────────────────────────────────────────────────────────────────────
CREATE POLICY "members_insert_secure"
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Project managers (owner/lead) can add members
    public.can_manage_members(project_id)
    -- OR: allow the very first member insert (project creator bootstrap)
    OR NOT EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_members.project_id
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. CREATE EXACTLY ONE SECURE DELETE POLICY
--    Allows: owner/lead to remove members
--    Self-leave: use remove_member_from_project RPC (Security Definer)
-- ────────────────────────────────────────────────────────────────────────────
CREATE POLICY "members_delete_secure"
  ON public.project_members
  FOR DELETE
  TO authenticated
  USING (public.can_manage_members(project_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CREATE join_project_by_code RPC (Security Definer)
--    Replaces the direct table INSERT in projects.service.ts joinProject().
--    Validates invite code server-side, prevents role = 'owner' on join,
--    and inserts with elevated privileges (bypasses RLS safely).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_project_by_code(
  p_invite_code text,
  p_display_name text,
  p_role text DEFAULT 'member'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_existing record;
  v_caller_id uuid;
BEGIN
  -- Verify caller is authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Validate role: NEVER allow direct 'owner' assignment via join
  IF p_role NOT IN ('lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role for joining: %. Owner role can only be assigned by existing owners via change_member_role.', p_role
    USING ERRCODE = '22023';
  END IF;

  -- Find project by invite code
  SELECT * INTO v_project
  FROM public.projects
  WHERE invite_code = p_invite_code;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0002';
  END IF;

  -- Check if already a member
  SELECT * INTO v_existing
  FROM public.project_members
  WHERE project_id = v_project.id AND user_id = v_caller_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_member', true,
      'project', jsonb_build_object('id', v_project.id, 'name', v_project.name)
    );
  END IF;

  -- Insert new member (runs as SECURITY DEFINER, bypasses RLS safely)
  INSERT INTO public.project_members (
    project_id, user_id, display_name, role, online
  ) VALUES (
    v_project.id, v_caller_id, p_display_name, p_role, true
  );

  -- Record immutable audit event
  BEGIN
    INSERT INTO public.security_audit_events (
      project_id, actor_id, actor_role, action,
      target_resource, status, metadata
    ) VALUES (
      v_project.id, v_caller_id, p_role, 'MEMBER_JOINED_VIA_CODE',
      v_project.id::text, 'SUCCESS',
      jsonb_build_object('invite_code_used', true, 'assigned_role', p_role)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit insert failure must not prevent the join operation
    NULL;
  END;

  -- Log activity event
  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (v_project.id, 'member', p_display_name || ' joined via invite code as ' || p_role);

  RETURN jsonb_build_object(
    'success', true,
    'already_member', false,
    'project', jsonb_build_object('id', v_project.id, 'name', v_project.name)
  );
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.join_project_by_code(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.join_project_by_code(text, text, text) FROM PUBLIC, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. FIX remove_member_from_project to allow self-leave
--    Since the DELETE policy no longer includes auth.uid() = user_id,
--    the existing RPC must handle self-leave correctly.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_member_from_project(
  p_member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user_id uuid;
  v_target_role text;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();

  -- Lookup target member
  SELECT project_id, user_id, role
  INTO v_project_id, v_target_user_id, v_target_role
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id USING ERRCODE = 'P0002';
  END IF;

  -- Protect project owner from removal
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the project owner' USING ERRCODE = '42501';
  END IF;

  -- Authorization: caller must be a manager OR be the target (self-leave)
  IF NOT (public.can_manage_members(v_project_id) OR v_target_user_id = v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to remove this member' USING ERRCODE = '42501';
  END IF;

  -- Delete member record (runs as SECURITY DEFINER, bypasses RLS)
  DELETE FROM public.project_members WHERE id = p_member_id;

  -- Audit log
  BEGIN
    INSERT INTO public.security_audit_events (
      project_id, actor_id, actor_role, action,
      target_resource, status, metadata
    ) VALUES (
      v_project_id, v_caller_id, NULL, 'MEMBER_REMOVED',
      p_member_id::text, 'SUCCESS',
      jsonb_build_object(
        'removed_user_id', v_target_user_id,
        'removed_role', v_target_role,
        'self_leave', v_target_user_id = v_caller_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'removed_member_id', p_member_id);
END;
$$;
