-- HackSync Phase 4: Testing Intelligence + Fix -> Test -> Verify Persistence
-- Tables: test_runs, fix_proposals, patch_records, verification_results
-- Multi-tenant isolation enforced via Row-Level Security (RLS) referencing project_members.

-- 1. Test Runs Table
CREATE TABLE IF NOT EXISTS public.test_runs (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  framework text NOT NULL,
  command text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL, -- 'passed' | 'failed' | 'timeout' | 'blocked' | 'unavailable'
  exit_code integer,
  summary jsonb NOT NULL DEFAULT '{"total": 0, "passed": 0, "failed": 0, "skipped": 0}'::jsonb,
  stdout text NOT NULL DEFAULT '',
  stderr text NOT NULL DEFAULT '',
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(3, 2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_project_created
  ON public.test_runs (project_id, created_at DESC);

ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_runs_select_members"
  ON public.test_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = test_runs.project_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "test_runs_insert_members"
  ON public.test_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = test_runs.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- 2. Fix Proposals Table
CREATE TABLE IF NOT EXISTS public.fix_proposals (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  finding_id text,
  title text NOT NULL,
  root_cause text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text NOT NULL,
  patch_id text NOT NULL,
  expected_behavior text NOT NULL,
  regression_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  security_impact text,
  confidence numeric(3, 2) NOT NULL DEFAULT 0.90,
  status text NOT NULL DEFAULT 'proposed', -- 'proposed' | 'approved' | 'applied' | 'rejected' | 'failed'
  approval_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fix_proposals_project_created
  ON public.fix_proposals (project_id, created_at DESC);

ALTER TABLE public.fix_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fix_proposals_select_members"
  ON public.fix_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = fix_proposals.project_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "fix_proposals_insert_members"
  ON public.fix_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = fix_proposals.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- 3. Patch Records Table
CREATE TABLE IF NOT EXISTS public.patch_records (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  base_state_hash text NOT NULL,
  diff_hash text NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  applied_by uuid,
  rollback_backup jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patch_records_project_hash
  ON public.patch_records (project_id, diff_hash);

ALTER TABLE public.patch_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patch_records_select_members"
  ON public.patch_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = patch_records.project_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "patch_records_insert_members"
  ON public.patch_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = patch_records.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- 4. Verification Results Table
CREATE TABLE IF NOT EXISTS public.verification_results (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fix_proposal_id text,
  patch_id text,
  success boolean NOT NULL DEFAULT false,
  tests_passed boolean NOT NULL DEFAULT false,
  regression_passed boolean NOT NULL DEFAULT false,
  security_passed boolean NOT NULL DEFAULT false,
  reindex_passed boolean NOT NULL DEFAULT false,
  patch_integrity_passed boolean NOT NULL DEFAULT false,
  unexpected_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  remaining_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(3, 2) NOT NULL DEFAULT 1.00,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_results_project
  ON public.verification_results (project_id, created_at DESC);

ALTER TABLE public.verification_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_results_select_members"
  ON public.verification_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = verification_results.project_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "verification_results_insert_members"
  ON public.verification_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = verification_results.project_id
        AND project_members.user_id = auth.uid()
    )
  );
