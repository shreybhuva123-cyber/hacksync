# Evaluation & Benchmarking Engine Architecture — HackSync Phase 5

## Overview

The **HackSync Evaluation & Benchmarking Engine** provides deterministic, objective, and reproducible measurement of intelligence and safety capabilities across all HackSync subsystems (Phases 0 through 4). It evaluates whether retrieval, semantic analysis, security auditing, secret scanning, fix generation, test intelligence, git diff intelligence, and closed-loop verification function accurately, safely, and without regressions.

---

## Architectural Principles

1. **Non-Mutating Evaluation**: The benchmark engine runs against sandboxed project fixtures and never alters user projects, production repositories, or published Git history.
2. **Deterministic Ground Truth**: All core evaluation cases rely on explicit ground truth specifications (expected findings, expected files, expected diffs, expected test outcomes).
3. **Separation of Concerns**:
   - **Severity vs. Confidence**: Severity (critical, high, medium, low) measures potential harm; confidence (high, medium, low) measures analysis certainty. They are tracked and scored independently.
   - **Evaluation vs. Autonomous Action**: The evaluation engine observes and measures existing system components; it does NOT introduce autonomous agents or unapproved mutations.
4. **Tenant Isolation & RBAC**: Executing benchmark runs or persisting evaluations requires verified project membership (`verifyProjectMembership`). Row-Level Security (RLS) is strictly enforced on all benchmark database tables.
5. **Zero Real Secrets**: All benchmark fixtures use synthetic, clearly non-functional mock tokens to guarantee that no production credentials are ever stored or processed.

---

## System Architecture

```text
Benchmark Case Dataset (Ground Truth Fixtures)
                    │
                    ▼
           Benchmark Loader & Validator
                    │
                    ▼
           Evaluation Service / API Gate (RBAC & Tenant Isolation)
                    │
                    ▼
            Benchmark Runner (Orchestrator & Timeouts)
                    │
   ┌────────────────┼────────────────┬────────────────┐
   ▼                ▼                ▼                ▼
Security        Retrieval        Citations        Fix Engine
Evaluator       Evaluator        Evaluator        Evaluator
   │                │                │                │
   ▼                ▼                ▼                ▼
Testing            Git             Answer        Verification
Evaluator       Evaluator        Evaluator        Evaluator
   └────────────────┬────────────────┴────────────────┘
                    │
                    ▼
          Scoring & Metrics Engine
  (Precision, Recall, F1, Hit@K, MRR, Redaction, Safe Division)
                    │
                    ▼
           Regression Detector
  (Tolerance Gates: F1 drops > 5%, Hallucinations > 0%, Latency spikes)
                    │
                    ▼
          Reporters & Outputs
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
Markdown       Structured      Run-to-Run
Summary JSON Report Comparison
```

---

## Core Components

### 1. Benchmark Dataset & Loader (`BenchmarkLoader`)
- Provides deterministic benchmark fixtures covering all 8 functional areas.
- Validates fixture integrity (safe paths, required queries, expected findings).
- Supports granular filtering by category (`security`, `retrieval`, `citations`, `fix_generation`, `testing`, `git_impact`), difficulty (`easy`, `medium`, `hard`), tags, and unique case IDs.

### 2. Domain Evaluators
- **`SecurityEvaluator`**: Validates SAST rules, secret detection, true positives, false positives, false discovery rate (FDR), and secret redaction enforcement.
- **`RetrievalEvaluator`**: Measures symbol and file retrieval precision, recall, Hit@1, Hit@3, Hit@5, MRR, and context budget adherence.
- **`CitationEvaluator`**: Verifies evidence grounding, line number accuracy, missing references, and flags hallucinated citations.
- **`AnswerEvaluator`**: Measures answer groundedness, flags hallucinated file claims, and verifies honest reporting when evidence is insufficient.
- **`FixEvaluator`**: Assesses patch generation, unified diff structure, patch validation, `ApprovalGate` cryptographic resolution, and atomic patch application with rollback safety.
- **`TestingEvaluator`**: Evaluates test framework detection (Jest, Vitest, Bun, Pytest), test discovery, and source-to-test mapping accuracy.
- **`GitEvaluator`**: Evaluates unified diff hunk parsing, added/deleted line tracking, changed symbols detection, and blast radius dependency impact analysis.
- **`VerificationEvaluator`**: Evaluates the complete closed-loop verification pipeline (fix proposal, approval, test pass, and security re-scan).

### 3. Scoring & Metrics Engine (`metrics.ts`, `scoring-engine.ts`)
- Implements mathematically rigorous metrics with zero-denominator safety returning `'not_applicable'`.
- Weighted category score aggregation:
  - Security & Secrets: 25%
  - Retrieval & Groundedness: 20%
  - Fix Engine: 20%
  - Testing Intelligence: 15%
  - Git Impact: 10%
  - Citations: 10%

### 4. Regression Detection Engine (`RegressionDetector`)
- Automatically flags quality regressions when comparing a candidate run against a baseline:
  - Any drop in Security F1 score > 5%
  - Any drop in Retrieval Hit@K or MRR > 5%
  - Any new hallucinated citations or files (0 tolerance)
  - Any regression in fix application or test success
  - Latency spikes exceeding 50% or 1000ms

### 5. Multi-Tenant Database Storage & RLS
- `benchmark_runs`: Records run metadata, configuration, overall score, summary metrics, and status.
- `benchmark_case_results`: Stores per-case metrics, passed status, score, latency, and detailed diagnostic logs.
- Strict PostgreSQL RLS policies linked through `public.project_members`.
