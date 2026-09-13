# HackSync — Phase 7: Frontend Backend Integration Guide

**Document Status:** Production Baseline  
**Phase:** 7 — Complete Productization + Professional UI/UX Redesign  
**Scope:** Wiring Frontend Components to Phases 0–6 Intelligence Pipelines

---

## 1. Integration Topology

The HackSync frontend acts as the unified control plane across all capabilities built in Phases 0 through 6. It does not perform heavy computation in the browser; rather, it invokes deterministic server-side and service-layer engines, consuming strongly-typed contracts.

```
+-------------------------------------------------------------------------------+
|                       Phase 7 Frontend Control Platform                       |
|   [Overview]  [Code Intel]  [Security]  [Testing]  [Evaluation]  [Git Intel]  |
+-------+-----------+-------------+-----------+------------+------------+-------+
        |           |             |           |            |            |
        v           v             v           v            v            v
    +-------+   +-------+     +-------+   +-------+    +-------+    +-------+
    |Phase 0|   |Phase 1|     |Phase 3|   |Phase 4|    |Phase 5|    |Phase 6|
    |Gateway|   | AST   |     | SAST  |   | Fix & |    | Eval  |    | Model |
    |& RBAC |   | Graph |     | Audit |   | Test  |    | Radar |    | Bench |
    +-------+   +-------+     +-------+   +-------+    +-------+    +-------+
```

---

## 2. Phase-by-Phase Service Wiring

### 2.1 Phase 0: Authenticated AI Gateway & RBAC
- **Service Layer**: `@/lib/services/security-authorization.ts`, `@/lib/services/rate-limiter.ts`.
- **Frontend Touchpoints**:
  - `AppShell.tsx`: Displays active user role badge (`owner`, `lead`, `backend`, `frontend`, `database`).
  - Action buttons conditionally enable/disable based on role capabilities (e.g., project deletion restricted to `owner`, schema modification restricted to `lead`/`database`).
  - Request rate-limiting handled transparently with exponential backoff on `429 Too Many Requests`.

### 2.2 Phase 1: AST Knowledge Graph & Symbol Dependencies
- **Service Layer**: `@/lib/hacksync/intelligence/ast-parser.ts`, `@/lib/hacksync/intelligence/knowledge-graph.ts`.
- **Frontend Touchpoints**:
  - `src/routes/_authenticated/code.tsx`: Renders file tree, AST symbol browser (`fn`, `class`, `interface`), and incoming/outgoing dependency edges.
  - `src/routes/_authenticated/dashboard.tsx`: Aggregates total code nodes, AST symbol count, and module hierarchy.

### 2.3 Phase 2: Real-time Multi-User CodeSync
- **Service Layer**: `@/lib/services/smart-merge-engine.ts`, `@/lib/services/codesync-engine.ts`.
- **Frontend Touchpoints**:
  - TopBar: Displays real-time synchronization pulse indicator (`Live Sync Active`).
  - `src/routes/_authenticated/git.tsx`: Displays live collaborator branches, ahead/behind counts, and 3-way merge statuses (`clean`, `conflict`, `merged`).

### 2.4 Phase 3: SAST Security Intelligence & Git Blast Radius
- **Service Layer**: `@/lib/hacksync/ai-security.ts`, `@/lib/hacksync/git/git-impact.ts`.
- **Frontend Touchpoints**:
  - `src/routes/_authenticated/security.tsx`: Invokes `auditWorkspaceSecurity(ws)` to generate 0–100 security score, letter grade (`A+` to `F`), and detailed vulnerability findings with CWE/OWASP metadata.
  - `src/routes/_authenticated/git.tsx`: Invokes `GitImpactEngine` to compute affected AST symbols and regression risk for divergent branches.

### 2.5 Phase 4: Targeted Testing & Fix-Test-Verify Closed Loop
- **Service Layer**: `@/lib/hacksync/testing/test-planner.ts`, `@/lib/hacksync/fixing/fix-types.ts`.
- **Frontend Touchpoints**:
  - `src/routes/_authenticated/testing.tsx`: Invokes `TestPlanner` to generate test cases for modified files, runs tests in virtual sandboxes, and maps symbol coverage.
  - `ApprovalGate.tsx`: Renders unified diffs via `DiffViewer.tsx`, enforces `requiresApproval: true`, and triggers test verification before committing.

### 2.6 Phases 5 & 6: Evaluation Benchmarks, Regression Radar & Observability
- **Service Layer**: `@/lib/hacksync/evaluation/`, `@/lib/hacksync/evaluation/observability/`.
- **Frontend Touchpoints**:
  - `src/routes/_authenticated/evaluation.tsx`:
    - Renders BM-1 through BM-7 benchmark suite execution matrix.
    - Displays multi-model scorecard across 6 dimensions (accuracy, AST grounding, security, latency, cost, format).
    - Visualizes dual-delta regression radar with 5-tier severity thresholds.
    - Exposes token consumption, cumulative API cost, and P50/P95/P99 latency tracking.

---

## 3. Data Contracts & State Management

### 3.1 Workspace Query Contract
The application uses TanStack Query (`useWorkspaceData`) to maintain an in-memory cache of the active workspace:
```typescript
interface Workspace {
  project: Project;
  members: Member[];
  codeNodes: CodeNode[];
  contracts: ApiContract[];
  tables: DbTable[];
  columns: DbColumn[];
  links: IntegrationLink[];
  branches: GitBranch[];
  envVars: EnvVar[];
  checks: HealthCheck[];
  tasks: Task[];
  activity: ActivityEvent[];
  notes: Note[];
  handoffs: Handoff[];
  comments: ContractComment[];
}
```

### 3.2 Optimistic Updates & Realtime Invalidation
- All write operations execute via `useRowMutation()`.
- Upon successful mutation, the query cache is updated immediately to reflect changes without a full page reload.
- Real-time Supabase channels push remote updates to peer clients, ensuring all connected developers view synchronized state.
