-- ============================================================================
-- HackSync Migration: 20260826220000_audit_invites_and_strict_hierarchy.sql
-- 1. Immutable, append-only security audit log table
-- 2. Token-based project invitations & join RPC
-- 3. Strict RBAC role hierarchy (leads cannot create/modify owners)
-- 4. Eliminates direct self-insertion into project_members
-- ============================================================================

-- 1. Security Audit Events Table (Immutable & Append-Only)
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

-- Index for fast security review and chronological queries
CREATE INDEX IF NOT EXISTS idx_security_audit_project_created
  ON public.security_audit_events (project_id, created_at DESC);

-- Enable RLS on audit logs
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if any
DROP POLICY IF EXISTS "security_audit_select_owner_lead" ON public.security_audit_events;
DROP POLICY IF EXISTS "security_audit_insert_system" ON public.security_audit_events;

-- SELECT Policy: Only project owner and lead can inspect audit logs
CREATE POLICY "security_audit_select_owner_lead"
  ON public.security_audit_events
  FOR SELECT
  TO authenticated
  USING (
    project_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_members.project_id = security_audit_events.project_id
          AND project_members.user_id = auth.uid()
          AND project_members.role IN ('owner', 'lead')
      )
    )
  );

-- INSERT Policy: Authenticated users and stored procedures can insert audit records
CREATE POLICY "security_audit_insert_system"
  ON public.security_audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Immutable Protection: UPDATE and DELETE are strictly disallowed
-- (No policies created for UPDATE and DELETE, which enforces default DENY in PostgreSQL RLS)


-- 2. Project Invitations Table
CREATE TABLE IF NOT EXISTS public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invite_token text NOT NULL UNIQUE,
  target_email text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'backend', 'database', 'frontend', 'member')),
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_invitations_token
  ON public.project_invitations (invite_token);

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_invitations_manage"
  ON public.project_invitations
  FOR ALL
  TO authenticated
  USING (public.can_manage_members(project_id))
  WITH CHECK (public.can_manage_members(project_id));


-- 3. Strict RBAC Hierarchy: Helper Function
CREATE OR REPLACE FUNCTION public.get_caller_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = auth.uid()
  LIMIT 1;
$$;


-- 4. Hardened Role Change RPC (Strict Hierarchy Enforced)
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_member_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_target_user_id uuid;
  v_current_target_role text;
  v_caller_role text;
BEGIN
  -- Validate canonical role name
  IF p_new_role NOT IN ('owner', 'lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role specified: %', p_new_role USING ERRCODE = '22023';
  END IF;

  -- Locate target member
  SELECT project_id, user_id, role
  INTO v_project_id, v_target_user_id, v_current_target_role
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project member not found' USING ERRCODE = 'P0002';
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM public.project_members
  WHERE project_id = v_project_id AND user_id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of this project' USING ERRCODE = '42501';
  END IF;

  -- ENFORCE STRICT HIERARCHY:
  -- 1. Non-leads and non-owners cannot change any role
  IF v_caller_role NOT IN ('owner', 'lead') THEN
    RAISE EXCEPTION 'Permission denied: Only owners and leads can modify roles' USING ERRCODE = '42501';
  END IF;

  -- 2. Prevent self-role modification (Privilege Escalation Gate)
  IF v_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Security violation: Users cannot modify their own role' USING ERRCODE = '42501';
  END IF;

  -- 3. Lead CANNOT assign 'owner' role (Only owner can create or transfer owner role)
  IF v_caller_role = 'lead' AND p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Permission denied: Team leads cannot create or promote users to owner' USING ERRCODE = '42501';
  END IF;

  -- 4. Lead CANNOT modify or demote an existing 'owner' or other 'lead'
  IF v_caller_role = 'lead' AND v_current_target_role IN ('owner', 'lead') THEN
    RAISE EXCEPTION 'Permission denied: Team leads cannot modify owners or fellow leads' USING ERRCODE = '42501';
  END IF;

  -- Apply the role update
  UPDATE public.project_members
  SET role = p_new_role, updated_at = now()
  WHERE id = p_member_id;

  -- Record durable, tamper-evident audit log
  INSERT INTO public.security_audit_events (
    project_id,
    actor_id,
    actor_role,
    action,
    target_resource,
    status,
    metadata
  ) VALUES (
    v_project_id,
    auth.uid(),
    v_caller_role,
    'MEMBER_ROLE_CHANGED',
    p_member_id::text,
    'SUCCESS',
    jsonb_build_object(
      'previous_role', v_current_target_role,
      'new_role', p_new_role,
      'target_user_id', v_target_user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'new_role', p_new_role,
    'updated_at', now()
  );
END;
$$;


-- 5. RPC: Join Project by Invitation Token (Safe Tenant Join Gate)
CREATE OR REPLACE FUNCTION public.join_project_by_invite(
  p_invite_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_existing_member record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join project' USING ERRCODE = '42501';
  END IF;

  -- Verify active invite token
  SELECT * INTO v_invite
  FROM public.project_invitations
  WHERE invite_token = p_invite_token
    AND expires_at > now()
    AND used_at IS NULL;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation token' USING ERRCODE = '22023';
  END IF;

  -- Check if already a member
  SELECT * INTO v_existing_member
  FROM public.project_members
  WHERE project_id = v_invite.project_id AND user_id = auth.uid();

  IF v_existing_member.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'User is already a member',
      'project_id', v_invite.project_id,
      'role', v_existing_member.role
    );
  END IF;

  -- Add user as member with invite's assigned role
  INSERT INTO public.project_members (
    project_id,
    user_id,
    role,
    online
  ) VALUES (
    v_invite.project_id,
    auth.uid(),
    v_invite.role,
    true
  );

  -- Mark invitation as used
  UPDATE public.project_invitations
  SET used_at = now()
  WHERE id = v_invite.id;

  -- Record audit log
  INSERT INTO public.security_audit_events (
    project_id,
    actor_id,
    actor_role,
    action,
    target_resource,
    status,
    metadata
  ) VALUES (
    v_invite.project_id,
    auth.uid(),
    v_invite.role,
    'MEMBER_JOINED_VIA_INVITE',
    v_invite.project_id::text,
    'SUCCESS',
    jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'project_id', v_invite.project_id,
    'role', v_invite.role
  );
END;
$$;


-- 6. Tighten project_members INSERT RLS Policy (Invitation-Only)
DROP POLICY IF EXISTS "project_members_insert_policy" ON public.project_members;
CREATE POLICY "project_members_insert_policy"
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only project managers can directly insert members, OR through creator bootstrap
    public.can_manage_members(project_id)
    OR NOT EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id)
  );
