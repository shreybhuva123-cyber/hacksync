-- ==============================================================================
-- HackSync Phase 6: Evaluation Hardening, Observability & Model Benchmarking
-- Migration: 20260914000000_phase6_evaluation_hardening.sql
-- ==============================================================================

-- 1. Benchmark Versions Table
CREATE TABLE IF NOT EXISTS public.benchmark_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  dataset_id TEXT NOT NULL,
  dataset_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  case_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Model Evaluation Runs Table
CREATE TABLE IF NOT EXISTS public.model_evaluation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  benchmark_version_id TEXT REFERENCES public.benchmark_versions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_version TEXT,
  configuration_hash TEXT NOT NULL,
  git_commit TEXT,
  accuracy NUMERIC(5, 4),
  groundedness NUMERIC(5, 4),
  security_score NUMERIC(5, 2),
  retrieval_score NUMERIC(5, 2),
  fix_score NUMERIC(5, 2),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  latency_p50 INTEGER,
  latency_p90 INTEGER,
  latency_p95 INTEGER,
  latency_p99 INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(10, 6),
  evaluation_method TEXT NOT NULL DEFAULT 'deterministic',
  generator_model TEXT,
  judge_model TEXT,
  self_evaluation BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'completed',
  diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Model Usage & Telemetry Table
CREATE TABLE IF NOT EXISTS public.model_usage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  benchmark_run_id TEXT,
  case_id TEXT,
  evaluation_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(10, 6),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  tool_calls_count INTEGER NOT NULL DEFAULT 0,
  latency_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Evaluation Regressions Table
CREATE TABLE IF NOT EXISTS public.evaluation_regressions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  baseline_run_id TEXT NOT NULL,
  candidate_run_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('NONE', 'INFO', 'WARNING', 'REGRESSION', 'CRITICAL_REGRESSION', 'INSUFFICIENT_SAMPLE')),
  baseline_value NUMERIC(10, 4),
  candidate_value NUMERIC(10, 4),
  absolute_delta NUMERIC(10, 4),
  relative_delta NUMERIC(7, 4),
  sample_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Evaluation Artifacts Table
CREATE TABLE IF NOT EXISTS public.evaluation_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  evaluation_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL, -- 'scorecard', 'markdown_report', 'json_export', 'reproducibility_spec'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries and tenant isolation
CREATE INDEX IF NOT EXISTS idx_model_eval_project ON public.model_evaluation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_model_eval_provider_model ON public.model_evaluation_runs(provider, model);
CREATE INDEX IF NOT EXISTS idx_model_usage_project ON public.model_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_request ON public.model_usage(request_id);
CREATE INDEX IF NOT EXISTS idx_eval_regressions_project ON public.evaluation_regressions(project_id);
CREATE INDEX IF NOT EXISTS idx_eval_artifacts_project ON public.evaluation_artifacts(project_id);

-- Enable Row Level Security (RLS) on all Phase 6 tables
ALTER TABLE public.benchmark_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_regressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_artifacts ENABLE ROW LEVEL SECURITY;

-- 1. Benchmark Versions: public read-only for authenticated users
CREATE POLICY benchmark_versions_read ON public.benchmark_versions
  FOR SELECT TO authenticated USING (true);

-- 2. Model Evaluation Runs: confined to project members
CREATE POLICY model_eval_runs_select ON public.model_evaluation_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = model_evaluation_runs.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY model_eval_runs_insert ON public.model_evaluation_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = model_evaluation_runs.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

-- 3. Model Usage: confined to project members
CREATE POLICY model_usage_select ON public.model_usage
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = model_usage.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY model_usage_insert ON public.model_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = model_usage.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

-- 4. Evaluation Regressions: confined to project members
CREATE POLICY eval_regressions_select ON public.evaluation_regressions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = evaluation_regressions.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY eval_regressions_insert ON public.evaluation_regressions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = evaluation_regressions.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

-- 5. Evaluation Artifacts: confined to project members
CREATE POLICY eval_artifacts_select ON public.evaluation_artifacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = evaluation_artifacts.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );

CREATE POLICY eval_artifacts_insert ON public.evaluation_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = evaluation_artifacts.project_id
        AND project_members.user_id = auth.uid()::text
    )
  );
