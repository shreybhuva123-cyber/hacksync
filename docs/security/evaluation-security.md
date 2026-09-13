# HackSync Phase 6: Evaluation Security & Isolation Model

## 1. Security Threat Model for Benchmarking

Benchmarking systems execute evaluation suites that intentionally contain vulnerability fixtures (SQL injection, XSS, command injection, path traversal, simulated secrets). This creates several potential attack vectors:

1. **Malicious Benchmark Fixtures**: Fixtures containing prompt injection or shell commands attempting to escape into the runner host.
2. **Tenant Data Leakage**: An unauthorized user executing a benchmark on another tenant's project to extract sensitive code structure or AST symbols.
3. **Circular Ground Truth Tampering**: Evaluators dynamically altering expected findings to falsely show 100% pass rates.
4. **Credential Leakage**: Evaluation logs or telemetry leaking simulated API tokens or real secrets.

---

## 2. Multi-Tenant Authorization & Row-Level Security (RLS)

- **API Gate**: `EvaluationApi` verifies project membership via `ProjectSecurityService.validateMemberRole` on every endpoint (`handleRun`, `handleListRuns`, `handleGetRun`, `handleCompareModels`, `handleGetMetrics`). Non-members receive an immediate `403 Forbidden` (`AuthorizationError`).
- **Database RLS**: In `supabase/migrations/20260914000000_phase6_evaluation_hardening.sql`, tables `benchmark_versions`, `model_evaluation_runs`, `model_usage`, `evaluation_regressions`, and `evaluation_artifacts` enforce multi-tenant RLS:
  ```sql
  CREATE POLICY "Project members can read benchmark runs"
    ON public.model_evaluation_runs FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_members.project_id = model_evaluation_runs.project_id
        AND project_members.user_id = auth.uid()
      )
    );
  ```

---

## 3. Sandboxing & Safe Evaluation Invariants

- **Read-Only Tool Execution**: Benchmarking tools registered in `ToolRegistry` (`run_benchmark`, `get_evaluation_history`, `compare_models`, `get_regressions`, `get_evaluation_metrics`) have `category: "READ"` and are strictly read-only.
- **Fixture Invariance**: Fixture code, prompts, and sample inputs are treated as inert strings for AST parsing. No `eval()`, unrestricted shell execution, or child process spawning is permitted on fixture data.
- **Path Traversal Shield**: `GroundTruthValidator` checks all paths in benchmark cases and ground truth. Paths with `..` or leading `/` are immediately rejected.
- **Secret Redaction**: All telemetry outputs run through `redactSecrets()`. Simulated test credentials use runtime assembly (e.g. `["sk", "live", ...].join("_")`) to prevent accidental leakage or scanner triggers.

---

## 4. Evaluator Error Isolation

Evaluators execute within a hardened try/catch harness:
- If a domain evaluator encounters an unhandled exception or network timeout, the case status is explicitly recorded as `status: "evaluator_error"`.
- Evaluator errors are NEVER converted to false `pass` or false `fail` scores.
- The failure count is incremented in run metrics, and the diagnostic details are recorded in the run log.
