# HackSync Phase 6: Evaluation & Observability V2 Architecture

## 1. Overview & Objective

HackSync Phase 6 introduces an independent, reproducible evaluation, intelligence, and observability layer. This subsystem objectively measures the effectiveness of HackSync's core intelligence capabilities:
- **Project Intelligence & AST Symbol Mapping** (Phase 1)
- **Code & Contract Retrieval** (Phase 1/2)
- **Security & Vulnerability Detection** (Phase 3)
- **Fix Generation, Testing, and Patch Verification** (Phase 4)
- **Citation & Groundedness Verification** (Phase 5)

Phase 6 answers four critical engineering and executive questions:
1. *How good is HackSync actually?*
2. *Which model/provider performs best across security, retrieval, fixing, and citation tasks?*
3. *What changed between versions and how much does each operation cost?*
4. *Did the latest code or model change introduce any relative or absolute regressions?*

---

## 2. Non-Negotiable Architecture & Boundaries

The architecture preserves all prior security invariants:
```text
User
  ↓
Authenticated AI Gateway
  ↓
Tenant / Project Authorization (RBAC & RLS)
  ↓
Unified AI Orchestrator
  ↓
Task Planner & Context Planner
  ↓
Secure Tool Registry (Read-only for Evaluation)
  ↓
Phase 1 Intelligence (AST / Symbol Index)
  ↓
Phase 3 Security Intelligence (Deterministic AST Scanners)
  ↓
Phase 4 Testing / Fix / Verify Engine
  ↓
Phase 5 Evaluation Engine
  ↓
Phase 6 Evaluation Hardening + Observability Layer
```

### Prohibited Patterns
- **No Autonomous Agents or Swarms**: Evaluation is deterministic, pipeline-driven, and reproducible.
- **No Unrestricted Shell Execution**: All test discovery and AST scans use structured APIs with argument allowlisting.
- **No Autonomous Git Push or Code Modification**: Evaluation runs are read-only.
- **No Circular Evaluation**: Evaluators must NEVER derive expected ground truth from the production scanners under test.
- **No Fabrication of Costs or Latencies**: If pricing data or token metrics are missing, report `"unavailable"` rather than inventing numbers.

---

## 3. Subsystem Decomposition

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Evaluation Engine 2.0                                │
├─────────────────────────┬────────────────────────────┬───────────────────────────┤
│  Independent Ground     │  Benchmark Versioning &    │  Regression Engine 2.0    │
│  Truth & Immutability   │  Reproducibility Hasher    │  - Dual-delta calculation │
│  - DeepFreeze enforcement│ - Canonical JSON serializer│ - Small-sample protection │
│  - Path traversal checks│ - SHA-256 Dataset Hash     │ - 5-tier severity         │
│  - Anti-circularity test│ - SHA-256 Config Hash      │ - Critical trigger guards │
├─────────────────────────┼────────────────────────────┼───────────────────────────┤
│  Model Comparison       │  Observability Layer       │  Safe AI Tool Registry    │
│  - 6-dimension matrix   │  - Cost Tracker (Pricing)  │  - `run_benchmark`        │
│  - Weighted scorecard   │  - Latency Tracker (Layers)│  - `compare_models`       │
│  - Local-only privacy   │  - Token Usage Tracker     │  - `get_regressions`      │
│  - Self-eval detection  │  - Context Correlation     │  - `get_evaluation_history`│
└─────────────────────────┴────────────────────────────┴───────────────────────────┘
```

---

## 4. Key Data Contracts & Database Schema

The database migration `20260914000000_phase6_evaluation_hardening.sql` defines:
- **`benchmark_versions`**: Tracks immutable benchmark datasets, canonical dataset SHA-256 hashes, and schema versions.
- **`model_evaluation_runs`**: Stores individual model runs with full configuration hashes, scores, metrics, and provider configurations.
- **`model_usage`**: Per-request token and dollar-cost telemetry correlated with `requestId`, `projectId`, `benchmarkRunId`, and `caseId`.
- **`evaluation_regressions`**: Detected regressions linking baseline and candidate runs with relative and absolute deltas.
- **`evaluation_artifacts`**: Serialized reports, diffs, and scorecards stored with multi-tenant Row-Level Security (RLS).

---

## 5. Security Invariants & Isolation

1. **Multi-Tenant Isolation**: Every query and database transaction enforces project membership via `public.project_members`. Cross-project benchmark access is denied.
2. **Safe Path Normalization**: Ground truth and case definitions reject all paths containing `..` or leading `/`.
3. **Secret Redaction**: Prompts, tool arguments, telemetry records, and benchmark logs run through the centralized `redactSecrets()` pipeline before logging or persistence.
4. **Human Gate for Mutations**: Benchmark runs can only execute read-only tools. Any mutating fix action proposed by Fix Evaluator requires human approval.
