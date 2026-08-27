-- ============================================================================
-- HackSync: Member Local Files, CodeSync Engine & GitHub Push History
-- Migration: 20260827140000_member_files_and_codesync_history.sql
-- ============================================================================

-- 1. Member Local Files (Private staged files per team member before CodeSync)
CREATE TABLE IF NOT EXISTS public.member_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id text,
  member_id uuid REFERENCES public.project_members(id) ON DELETE CASCADE,
  owner_role text CHECK (owner_role IN ('frontend', 'backend', 'database', 'lead', 'member', 'owner')),
  file_name text NOT NULL,
  relative_path text NOT NULL,
  file_type text,
  language text,
  content text,
  sync_status text NOT NULL DEFAULT 'local_modified' CHECK (sync_status IN ('synced', 'pending_upload', 'local_modified', 'conflict', 'unlinked')),
  last_modified timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_files_project ON public.member_files(project_id);
CREATE INDEX IF NOT EXISTS idx_member_files_user ON public.member_files(user_id);
CREATE INDEX IF NOT EXISTS idx_member_files_path ON public.member_files(project_id, relative_path);

-- 2. CodeSync Sessions Log
CREATE TABLE IF NOT EXISTS public.sync_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  synced_by text,
  actor_name text NOT NULL DEFAULT 'Team Member',
  actor_role text DEFAULT 'lead',
  files_count integer NOT NULL DEFAULT 0,
  conflicts_resolved integer NOT NULL DEFAULT 0,
  summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_project ON public.sync_sessions(project_id);

-- 3. GitHub Push History
CREATE TABLE IF NOT EXISTS public.github_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  repo_url text NOT NULL,
  branch text NOT NULL DEFAULT 'main',
  commit_sha text NOT NULL,
  commit_message text NOT NULL,
  files_count integer NOT NULL DEFAULT 0,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_pushes_project ON public.github_pushes(project_id);

-- 4. Enable RLS on all newly created tables
ALTER TABLE public.member_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_pushes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for member_files (Project Members can view and manage their files)
CREATE POLICY "member_files_select_policy" ON public.member_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = member_files.project_id
        AND (pm.user_id = auth.uid()::text OR auth.uid() IS NULL)
    )
  );

CREATE POLICY "member_files_insert_policy" ON public.member_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = member_files.project_id
        AND (pm.user_id = auth.uid()::text OR auth.uid() IS NULL)
    )
  );

CREATE POLICY "member_files_update_policy" ON public.member_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = member_files.project_id
        AND (pm.user_id = auth.uid()::text OR auth.uid() IS NULL)
    )
  );

CREATE POLICY "member_files_delete_policy" ON public.member_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = member_files.project_id
        AND (pm.user_id = auth.uid()::text OR auth.uid() IS NULL)
    )
  );

-- 6. RLS Policies for sync_sessions & github_pushes
CREATE POLICY "sync_sessions_select_policy" ON public.sync_sessions
  FOR SELECT USING (true);

CREATE POLICY "sync_sessions_insert_policy" ON public.sync_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "github_pushes_select_policy" ON public.github_pushes
  FOR SELECT USING (true);

CREATE POLICY "github_pushes_insert_policy" ON public.github_pushes
  FOR INSERT WITH CHECK (true);
