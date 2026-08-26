-- ============================================================================
-- HackSync RBAC Privilege Escalation Fix & Server RPC Authorization
-- Removes self-service role modifications (prevents member -> owner/lead escalation)
-- and creates strict Security Definer RPC authorization endpoints.
-- ============================================================================

-- 1. Create Server RPC Function: change_member_role
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_member_id uuid,
  p_new_role text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user text;
  v_caller_role text;
BEGIN
  -- 1. Validate new role against canonical list
  IF p_new_role NOT IN ('owner', 'lead', 'backend', 'database', 'frontend', 'member') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  -- 2. Lookup target member's project
  SELECT project_id, user_id INTO v_project_id, v_target_user
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  -- 3. Verify caller is project owner or lead
  IF NOT public.can_manage_members(v_project_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only project owners and team leads can change member roles. Self-service privilege escalation is prohibited.';
  END IF;

  -- 4. Apply role change
  UPDATE public.project_members
  SET role = p_new_role
  WHERE id = p_member_id;

  -- 5. Log activity event
  INSERT INTO public.activity_events (project_id, kind, message)
  VALUES (v_project_id, 'member', 'Changed member role to ' || p_new_role);

  RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'role', p_new_role);
END;
$$;

-- 2. Create Server RPC Function: remove_member_from_project
CREATE OR REPLACE FUNCTION public.remove_member_from_project(
  p_member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_target_user text;
  v_target_role text;
BEGIN
  -- 1. Lookup target member
  SELECT project_id, user_id, role INTO v_project_id, v_target_user, v_target_role
  FROM public.project_members
  WHERE id = p_member_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Member not found: %', p_member_id;
  END IF;

  -- 2. Protect project owner from removal
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the project owner.';
  END IF;

  -- 3. Verify caller is authorized (owner/lead or self-leaving)
  IF NOT (public.can_manage_members(v_project_id) OR v_target_user = auth.uid()::text) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to remove this member.';
  END IF;

  -- 4. Delete member record
  DELETE FROM public.project_members WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true, 'removed_member_id', p_member_id);
END;
$$;

-- 3. Create Server RPC Function: update_my_presence
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

-- 4. Grant execute permissions on RPCs to authenticated users
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member_from_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_presence(uuid, text, text) TO authenticated;

-- 5. Hardened RLS Policies on project_members (strictly disallowing self-service role escalation)
DROP POLICY IF EXISTS "members update" ON public.project_members;
DROP POLICY IF EXISTS "members_update_role_lead_only" ON public.project_members;
DROP POLICY IF EXISTS "members_update_presence_self_only" ON public.project_members;

-- Only Lead/Owner can update member records via direct table update
CREATE POLICY "members_update_role_lead_only" ON public.project_members
  FOR UPDATE TO authenticated USING (public.can_manage_members(project_id));
