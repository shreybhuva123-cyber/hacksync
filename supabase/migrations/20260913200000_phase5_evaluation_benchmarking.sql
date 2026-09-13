-- HackSync Phase 5: Evaluation & Benchmarking Engine Persistence
-- Tables: benchmark_runs, benchmark_case_results
-- Multi-tenant isolation enforced via Row-Level Security (RLS) referencing project_members.

-- 1. Benchmark Runs Table
CREATE TABLE IF NOT EXISTS public.benchmark_runs (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'development',
  version_commit text NOT NULL DEFAULT 'unknown',
  provider text NOT NULL DEFAULT 'builtin',
  model text NOT NULL DEFAULT 'deterministic',
  config_hash text NOT NULL,
  benchmark_version text NOT NULL DEFAULT '1.0.0',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'completed', -- 'completed' | 'failed' | 'cancelled' | 'unavailable'
  total_cases integer NOT NULL DEFAULT 0,
  passed_cases integer NOT NULL DEFAULT 0,
  failed_cases integer NOT NULL DEFAULT 0,
  overall_score numeric(5, 2) NOT NULL DEFAULT 0.00,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  regressions jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_project_created
  ON public.benchmark_runs (project_id, created_at DESC);

ALTER TABLE public.benchmark_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_runs_select_members"
  ON public.benchmark_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = benchmark_runs.project_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "benchmark_runs_insert_members"
  ON public.benchmark_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = benchmark_runs.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- 2. Benchmark Case Results Table
CREATE TABLE IF NOT EXISTS public.benchmark_case_results (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES public.benchmark_runs(id) ON DELETE CASCADE,
  case_id text NOT NULL,
  category text NOT NULL,
  evaluation_method text NOT NULL DEFAULT 'DETERMINISTIC', -- 'DETERMINISTIC' | 'HEURISTIC' | 'MODEL_BASED' | 'MANUAL_REVIEW'
  status text NOT NULL, -- 'passed' | 'failed' | 'skipped' | 'error' | 'unavailable'
  score numeric(5, 2) NOT NULL DEFAULT 0.00,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_cases_run
  ON public.benchmark_case_results (run_id);

ALTER TABLE public.benchmark_case_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_case_results_select_members"
  ON public.benchmark_case_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.benchmark_runs
      JOIN public.project_members ON project_members.project_id = benchmark_runs.project_id
      WHERE benchmark_runs.id = benchmark_case_results.run_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "benchmark_case_results_insert_members"
  ON public.benchmark_case_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.benchmark_runs
      JOIN public.project_members ON project_members.project_id = benchmark_runs.project_id
      WHERE benchmark_runs.id = benchmark_case_results.run_id
        AND project_members.user_id = auth.uid()
    )
  );
