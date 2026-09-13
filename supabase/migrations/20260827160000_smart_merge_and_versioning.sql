-- ============================================================================
-- HackSync: Git-like Version Tracking, 3-Way Merge History & Rollback System
-- Migration: 20260827160000_smart_merge_and_versioning.sql
-- ============================================================================

-- 1. Create File Versions History Table (Immutable log of file evolutions)
CREATE TABLE IF NOT EXISTS public.file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.code_nodes(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  content text NOT NULL,
  content_hash text NOT NULL,
  base_version_number integer,
  parent_version_number integer,
  created_by_user_id text,
  created_by_name text NOT NULL DEFAULT 'Developer',
  created_by_role text CHECK (created_by_role IN ('frontend', 'backend', 'database', 'lead', 'member', 'owner')),
  contributors text[] NOT NULL DEFAULT '{}',
  change_summary text NOT NULL DEFAULT 'Synchronized via CodeSync',
  change_type text NOT NULL DEFAULT 'edit' CHECK (change_type IN ('initial', 'edit', 'auto_merge', 'manual_merge', 'rollback', 'delete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_versions_project ON public.file_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_path ON public.file_versions(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_file_versions_lookup ON public.file_versions(project_id, file_path, version_number DESC);

-- 2. Enhance code_nodes with versioning and hash tracking
ALTER TABLE public.code_nodes 
  ADD COLUMN IF NOT EXISTS current_version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS last_synced_by text,
  ADD COLUMN IF NOT EXISTS contributors text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- 3. Enhance member_files with base versioning and hash tracking
ALTER TABLE public.member_files
  ADD COLUMN IF NOT EXISTS base_version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_content text,
  ADD COLUMN IF NOT EXISTS base_hash text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- 4. Enhance sync_sessions with detailed merge metadata
ALTER TABLE public.sync_sessions
  ADD COLUMN IF NOT EXISTS session_number integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS auto_merged_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conflicts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_files_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_files_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contributors text[] DEFAULT '{}';

-- 5. Enable Row Level Security & Grant Permissions
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.file_versions TO authenticated, service_role;

DROP POLICY IF EXISTS "file_versions_select_policy" ON public.file_versions;
CREATE POLICY "file_versions_select_policy" ON public.file_versions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "file_versions_insert_policy" ON public.file_versions;
CREATE POLICY "file_versions_insert_policy" ON public.file_versions
  FOR INSERT WITH CHECK (true);

-- 6. Safe Atomic Rollback Function: Restores a previous version by creating a NEW version
CREATE OR REPLACE FUNCTION public.restore_file_version(
  p_project_id uuid,
  p_file_path text,
  p_target_version integer,
  p_actor_name text,
  p_actor_role text DEFAULT 'lead'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_record record;
  v_latest_version integer := 1;
  v_new_version_id uuid;
  v_node_id uuid;
BEGIN
  -- 1. Locate historical target version
  SELECT * INTO v_target_record
  FROM public.file_versions
  WHERE project_id = p_project_id
    AND file_path = p_file_path
    AND version_number = p_target_version
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_target_record.id IS NULL THEN
    RAISE EXCEPTION 'Target version V% for file "%" was not found in project history.', p_target_version, p_file_path;
  END IF;

  -- 2. Find highest version number to increment
  SELECT COALESCE(MAX(version_number), 1) INTO v_latest_version
  FROM public.file_versions
  WHERE project_id = p_project_id AND file_path = p_file_path;

  -- 3. Update or create code_nodes record
  SELECT id INTO v_node_id FROM public.code_nodes
  WHERE project_id = p_project_id AND path = p_file_path;

  IF v_node_id IS NOT NULL THEN
    UPDATE public.code_nodes
    SET content = v_target_record.content,
        content_hash = v_target_record.content_hash,
        current_version_number = v_latest_version + 1,
        last_synced_by = p_actor_name,
        updated_at = now()
    WHERE id = v_node_id;
  END IF;

  -- 4. Create new version entry representing the rollback
  INSERT INTO public.file_versions (
    project_id,
    node_id,
    file_path,
    version_number,
    content,
    content_hash,
    base_version_number,
    parent_version_number,
    created_by_user_id,
    created_by_name,
    created_by_role,
    contributors,
    change_summary,
    change_type
  ) VALUES (
    p_project_id,
    v_node_id,
    p_file_path,
    v_latest_version + 1,
    v_target_record.content,
    v_target_record.content_hash,
    p_target_version,
    v_latest_version,
    auth.uid()::text,
    p_actor_name,
    p_actor_role,
    ARRAY[p_actor_name],
    'Rollback to historical version V' || p_target_version,
    'rollback'
  ) RETURNING id INTO v_new_version_id;

  -- 5. Record activity
  INSERT INTO public.activity_events (project_id, kind, actor, actor_role, message)
  VALUES (
    p_project_id,
    'code',
    p_actor_name,
    p_actor_role,
    'Restored file ' || p_file_path || ' to version V' || p_target_version || ' (now V' || (v_latest_version + 1) || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'file_path', p_file_path,
    'restored_from_version', p_target_version,
    'new_version', v_latest_version + 1,
    'version_id', v_new_version_id
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.restore_file_version(uuid, text, integer, text, text) TO authenticated;
