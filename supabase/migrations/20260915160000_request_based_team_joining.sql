-- ============================================================================
-- HackSync Migration: 20260915160000_request_based_team_joining.sql
-- 1. Create project_join_requests table for request-based team joining
-- 2. request_to_join_project RPC (applicant submits request via invite code)
-- 3. review_join_request RPC (leader accepts with assigned role or rejects)
-- 4. add_member_by_identifier RPC (leader adds member by username or email with role)
-- ============================================================================

-- 1. Table: project_join_requests
CREATE TABLE IF NOT EXISTS public.project_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text,
  requested_role text NOT NULL DEFAULT 'frontend' CHECK (requested_role IN ('lead', 'backend', 'database', 'frontend', 'member')),
  assigned_role text CHECK (assigned_role IS NULL OR assigned_role IN ('lead', 'backend', 'database', 'frontend', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_project_status
  ON public.project_join_requests (project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_user
  ON public.project_join_requests (user_id);

-- Enable RLS
ALTER TABLE public.project_join_requests ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Requesters see their own requests; Leaders/Owners see requests for their project
DROP POLICY IF EXISTS "join_requests_select" ON public.project_join_requests;
CREATE POLICY "join_requests_select"
  ON public.project_join_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_join_requests.project_id
        AND project_members.user_id = auth.uid()
        AND project_members.role IN ('owner', 'lead')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_join_requests.project_id
        AND projects.created_by = auth.uid()
    )
  );

-- INSERT policy: Any authenticated user can submit a pending join request
DROP POLICY IF EXISTS "join_requests_insert" ON public.project_join_requests;
CREATE POLICY "join_requests_insert"
  ON public.project_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- UPDATE policy: Only project owner or lead can review requests
DROP POLICY IF EXISTS "join_requests_update" ON public.project_join_requests;
CREATE POLICY "join_requests_update"
  ON public.project_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_join_requests.project_id
        AND project_members.user_id = auth.uid()
        AND project_members.role IN ('owner', 'lead')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_join_requests.project_id
        AND projects.created_by = auth.uid()
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.project_join_requests TO authenticated;
GRANT ALL ON public.project_join_requests TO service_role;


-- 2. RPC: request_to_join_project
-- Submits a join request via invite code without immediately granting workspace access.
CREATE OR REPLACE FUNCTION public.request_to_join_project(
  p_invite_code text,
  p_display_name text,
  p_requested_role text DEFAULT 'frontend'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_caller_id uuid;
  v_caller_email text;
  v_existing_member record;
  v_existing_request record;
  v_new_request_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit join request' USING ERRCODE = '42501';
  END IF;

  -- Get caller email from auth
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Validate requested role
  IF p_requested_role NOT IN ('lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role requested: %', p_requested_role USING ERRCODE = '22023';
  END IF;

  -- Look up project by invite code
  SELECT * INTO v_project
  FROM public.projects
  WHERE invite_code = p_invite_code;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code: No project found' USING ERRCODE = 'P0002';
  END IF;

  -- Check if already an active member
  SELECT * INTO v_existing_member
  FROM public.project_members
  WHERE project_id = v_project.id AND user_id = v_caller_id;

  IF v_existing_member.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_member',
      'message', 'You are already a member of this project.',
      'project', jsonb_build_object('id', v_project.id, 'name', v_project.name)
    );
  END IF;

  -- Check if request already pending
  SELECT * INTO v_existing_request
  FROM public.project_join_requests
  WHERE project_id = v_project.id AND user_id = v_caller_id AND status = 'pending';

  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending',
      'message', 'Your request to join this team is already pending review by the team leader.',
      'request_id', v_existing_request.id,
      'project', jsonb_build_object('id', v_project.id, 'name', v_project.name)
    );
  END IF;

  -- Insert pending join request
  INSERT INTO public.project_join_requests (
    project_id,
    user_id,
    display_name,
    email,
    requested_role,
    status
  ) VALUES (
    v_project.id,
    v_caller_id,
    COALESCE(NULLIF(p_display_name, ''), split_part(v_caller_email, '@', 1), 'Applicant'),
    v_caller_email,
    p_requested_role,
    'pending'
  )
  RETURNING id INTO v_new_request_id;

  -- Log activity event
  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (
    v_project.id,
    'member',
    p_display_name || ' requested to join team as ' || p_requested_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending',
    'message', 'Join request submitted! The team leader will review your request and assign your role.',
    'request_id', v_new_request_id,
    'project', jsonb_build_object('id', v_project.id, 'name', v_project.name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_to_join_project(text, text, text) TO authenticated;


-- 3. RPC: review_join_request
-- Allows leader/owner to approve (with assigned role) or decline a pending join request.
CREATE OR REPLACE FUNCTION public.review_join_request(
  p_request_id uuid,
  p_action text, -- 'accepted' or 'rejected'
  p_assigned_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_caller_id uuid;
  v_caller_role text;
  v_final_role text;
  v_new_member_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Fetch the join request
  SELECT * INTO v_request
  FROM public.project_join_requests
  WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Verify caller role in project
  SELECT role INTO v_caller_role
  FROM public.project_members
  WHERE project_id = v_request.project_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL THEN
    -- Check if project creator
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_request.project_id AND created_by = v_caller_id) THEN
      RAISE EXCEPTION 'Permission denied: Only project owners and leads can review requests' USING ERRCODE = '42501';
    ELSE
      v_caller_role := 'owner';
    END IF;
  END IF;

  IF v_caller_role NOT IN ('owner', 'lead') THEN
    RAISE EXCEPTION 'Permission denied: Only project owners and leads can review requests' USING ERRCODE = '42501';
  END IF;

  -- Validate action
  IF p_action NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review action: % (must be accepted or rejected)', p_action USING ERRCODE = '22023';
  END IF;

  IF p_action = 'accepted' THEN
    -- Determine assigned role
    v_final_role := COALESCE(p_assigned_role, v_request.requested_role, 'member');
    IF v_final_role NOT IN ('lead', 'backend', 'database', 'frontend', 'member') THEN
      v_final_role := 'member';
    END IF;

    -- Non-owners cannot assign 'owner' role
    IF v_final_role = 'owner' AND v_caller_role != 'owner' THEN
      RAISE EXCEPTION 'Only the project owner can assign owner role' USING ERRCODE = '42501';
    END IF;

    -- Add to project_members (or update role if row exists)
    INSERT INTO public.project_members (
      project_id,
      user_id,
      display_name,
      email,
      role,
      online
    ) VALUES (
      v_request.project_id,
      v_request.user_id,
      v_request.display_name,
      v_request.email,
      v_final_role,
      false
    )
    ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, display_name = EXCLUDED.display_name
    RETURNING id INTO v_new_member_id;

    -- Update join request
    UPDATE public.project_join_requests
    SET status = 'accepted',
        assigned_role = v_final_role,
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    -- Log activity
    INSERT INTO public.activity_events (project_id, kind, message)
    VALUES (
      v_request.project_id,
      'member',
      v_request.display_name || ' was accepted into team as ' || v_final_role
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'accepted',
      'assigned_role', v_final_role,
      'member_id', v_new_member_id
    );
  ELSE
    -- Mark rejected
    UPDATE public.project_join_requests
    SET status = 'rejected',
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, text, text) TO authenticated;


-- 4. RPC: add_member_by_identifier
-- Allows leader/owner to directly add a teammate by username or email with an assigned role.
CREATE OR REPLACE FUNCTION public.add_member_by_identifier(
  p_project_id uuid,
  p_identifier text,
  p_role text DEFAULT 'frontend'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_user_id uuid;
  v_target_display_name text;
  v_target_email text;
  v_new_member_id uuid;
  v_clean_ident text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_clean_ident := trim(p_identifier);
  IF length(v_clean_ident) = 0 THEN
    RAISE EXCEPTION 'Username or email cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- Validate role
  IF p_role NOT IN ('lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  -- Verify caller is owner or lead
  SELECT role INTO v_caller_role
  FROM public.project_members
  WHERE project_id = p_project_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND created_by = v_caller_id) THEN
      RAISE EXCEPTION 'Permission denied: Only project owners and leads can add members' USING ERRCODE = '42501';
    END IF;
  ELSIF v_caller_role NOT IN ('owner', 'lead') THEN
    RAISE EXCEPTION 'Permission denied: Only project owners and leads can add members' USING ERRCODE = '42501';
  END IF;

  -- 1. Try to find user in auth.users by email
  IF v_clean_ident LIKE '%@%' THEN
    SELECT id, email INTO v_target_user_id, v_target_email
    FROM auth.users
    WHERE lower(email) = lower(v_clean_ident)
    LIMIT 1;

    IF v_target_user_id IS NOT NULL THEN
      SELECT display_name INTO v_target_display_name
      FROM public.profiles
      WHERE id = v_target_user_id;
    END IF;
  ELSE
    -- 2. Try to find user in profiles by display_name
    SELECT id, display_name INTO v_target_user_id, v_target_display_name
    FROM public.profiles
    WHERE lower(display_name) = lower(v_clean_ident)
    LIMIT 1;

    IF v_target_user_id IS NOT NULL THEN
      SELECT email INTO v_target_email
      FROM auth.users
      WHERE id = v_target_user_id;
    END IF;
  END IF;

  -- If no existing profile found, create member record with provided identifier
  v_target_display_name := COALESCE(v_target_display_name, split_part(v_clean_ident, '@', 1), v_clean_ident);
  IF v_target_email IS NULL AND v_clean_ident LIKE '%@%' THEN
    v_target_email := v_clean_ident;
  END IF;

  -- Insert into project_members
  INSERT INTO public.project_members (
    project_id,
    user_id,
    display_name,
    email,
    role,
    online
  ) VALUES (
    p_project_id,
    v_target_user_id,
    v_target_display_name,
    v_target_email,
    p_role,
    false
  )
  ON CONFLICT (project_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name
  RETURNING id INTO v_new_member_id;

  -- Log activity
  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (
    p_project_id,
    'member',
    'Added ' || v_target_display_name || ' to team as ' || p_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_new_member_id,
    'display_name', v_target_display_name,
    'email', v_target_email,
    'role', p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_member_by_identifier(uuid, text, text) TO authenticated;
