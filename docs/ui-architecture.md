# HackSync — Phase 7: UI Architecture & Component Hierarchy

**Document Status:** Production Baseline  
**Phase:** 7 — Complete Productization + Professional UI/UX Redesign  
**Scope:** Frontend Architecture, Routing, Component Tree, and State Pipeline

---

## 1. Architectural Overview

The HackSync frontend is structured as an evidence-first developer control platform built on React 18, Vite, TanStack Router, and Tailwind CSS. The interface directly exposes the intelligence pipelines created across Phases 0 through 6, enabling developers to navigate code structure, analyze security postures, plan and execute targeted tests, track benchmark regressions, and safely approve automated patches through human-in-the-loop gates.

```
+-------------------------------------------------------------------------------+
|                                  TopBar                                       |
|  [Logo HackSync] [Project: Core API] [Branch: main] [Search Ctrl+K] [Status]  |
+---------------+---------------------------------------------------------------+
|   Sidebar     |                         Main Workspace                        |
|               |                                                               |
|  * Overview   |  +---------------------------------------------------------+  |
|  * Code Intel |  | PageHeader (Title, Description, Quick Actions)          |  |
|  * Security   |  +---------------------------------------------------------+  |
|  * Testing    |  | Metrics Bar (Density-optimized KPIs, StatusPills)       |  |
|  * Evaluation |  +---------------------------------------------------------+  |
|  * Git Intel  |  | Main Grid / Split View                                  |  |
|  * Settings   |  |   - Primary Intelligence Explorer (Tables, Trees)       |  |
|               |  |   - Evidence & Inspector Panel (CodeBlock, DiffViewer)  |  |
|               |  +---------------------------------------------------------+  |
|               |                                                               |
+---------------+---------------------------------------------------------------+
| Dialog Layers: CommandPalette (Ctrl+K) | ApprovalGate | AiCopilotModal        |
+-------------------------------------------------------------------------------+
```

---

## 2. Routing Architecture (TanStack Router)

Routing is organized around an authenticated layout shell (`_authenticated`) that provides context for project selection, permissions, and workspace state.

### 2.1 Route Map
| Route Path | File Location | Workload / Intelligence Layer |
| :--- | :--- | :--- |
| `/_authenticated/dashboard` | `src/routes/_authenticated/dashboard.tsx` | Repository Health, AST Summary, Security Overview, Branch Drift |
| `/_authenticated/code` | `src/routes/_authenticated/code.tsx` | AST Knowledge Graph, Symbol Dependency Explorer, Code Editor |
| `/_authenticated/security` | `src/routes/_authenticated/security.tsx` | SAST Vulnerability Center, OWASP/CWE Audit, Remediation Proposals |
| `/_authenticated/testing` | `src/routes/_authenticated/testing.tsx` | Targeted Test Planner, Sandbox Runner, Symbol Coverage Mapping |
| `/_authenticated/evaluation`| `src/routes/_authenticated/evaluation.tsx` | Multi-Model Benchmarking (BM-1 to BM-7), Regression Radar, Observability |
| `/_authenticated/git` | `src/routes/_authenticated/git.tsx` | Branch Divergence, AST Merge Conflicts, Blast Radius Analyzer |
| `/_authenticated/settings`| `src/routes/_authenticated/settings.tsx` | Project Settings, Gateway Configuration, API Keys, Permissions |

### 2.2 Route Layout Tree
```
src/routes/
├── __root.tsx                    # Root provider shell (Theme, Toaster, Router context)
├── auth.tsx                      # Login, signup, and magic link authentication
├── index.tsx                     # Landing redirect to active project dashboard
└── _authenticated.tsx            # Authenticated AppShell wrapper (Sidebar + TopBar)
    ├── dashboard.tsx             # Overview & Repository Health
    ├── code.tsx                  # AST Code Intelligence
    ├── security.tsx              # SAST Security Center
    ├── testing.tsx               # Phase 4 Testing Intelligence
    ├── evaluation.tsx            # Phase 5 & 6 Benchmarks & Observability
    ├── git.tsx                   # Git Intelligence & Blast Radius
    └── settings.tsx              # Configuration & Tenant Administration
```

---

## 3. Core Component Hierarchy

### 3.1 Layout & Navigation Components
- **`AppShell` (`src/components/hacksync/AppShell.tsx`)**:
  - Manages global sidebar state (collapsed vs expanded).
  - Renders top navigation bar with project switcher, branch badge, command palette trigger (`Ctrl + K`), and real-time synchronization pulse indicator.
  - Hosts keyboard shortcuts listener (`Ctrl/Cmd + K` for Command Palette, `Ctrl/Cmd + B` for sidebar toggle).
- **`WorkspaceView` (`src/components/hacksync/WorkspaceView.tsx`)**:
  - Higher-order layout container providing standard padding, loading skeletons, and error boundary wrappers across all workspace views.
- **`CommandPalette` (`src/components/hacksync/CommandPalette.tsx`)**:
  - Global `cmdk`-powered modal providing instant fuzzy navigation across routes, code files, AST symbols, active vulnerabilities, and actions.

### 3.2 Evidence & Verification Components
- **`DiffViewer` (`src/components/hacksync/DiffViewer.tsx`)**:
  - Unified two-pane or unified diff renderer.
  - Line-numbered with distinct syntax coloring for additions (`rgba(34, 197, 94, 0.15)`), deletions (`rgba(239, 68, 68, 0.15)`), and hunk headers (`rgba(79, 140, 255, 0.10)`).
  - Displays file paths, base state SHA-256 hashes, and diff SHA-256 hashes.
- **`ApprovalGate` (`src/components/hacksync/ApprovalGate.tsx`)**:
  - Human-in-the-loop patch approval modal.
  - Requires explicit developer sign-off before applying any patch.
  - Shows root cause, affected files, regression risk assessment, security impact, unified diff, and live verification feedback.
- **`AiCopilotModal` (`src/components/hacksync/AiCopilotModal.tsx`)**:
  - Context-aware engineering assistant drawer.
  - Automatically captures active project ID, selected file path, and AST symbols as evidence tokens.
  - Rejects speculative suggestions without code references.

### 3.3 Design System Primitives (`src/components/hacksync/primitives.tsx`)
All UI primitives adhere to strict geometry and token constraints:
- `Panel` & `PanelHeader`: 8px radius, `#11161D` background, `#252D38` border.
- `Metric`: Condensed numeric metric tile with label, mono value, and optional status badge.
- `StatusPill`: 9999px radius pill with semantic tone (`success`, `warning`, `danger`, `info`, `neutral`).
- `CodeBlock`: Monospace formatted code block with copy action and syntax styling.
- `ScoreRing`: Circular progress indicator with color-coded grade tiers.

---

## 4. State Management & Real-Time Synchronization

```
+-----------------------------------------------------------------+
|                       Supabase PostgreSQL                       |
|   (projects, code_nodes, api_contracts, db_tables, git_branches)|
+--------------------------------+--------------------------------+
                                 | Realtime WebSockets / REST
                                 v
+--------------------------------+--------------------------------+
|                 TanStack Query Cache Layer                      |
|          ['workspace', projectId], ['branches', projectId]      |
+--------------------------------+--------------------------------+
                                 | Reactive hooks
                                 v
+--------------------------------+--------------------------------+
|                     Workspace State Context                     |
|           ws.project, ws.codeNodes, ws.contracts, ws.branches   |
+----------------+---------------+----------------+---------------+
                 |               |                |
                 v               v                v
            /dashboard         /code          /security
            /testing        /evaluation          /git
```

1. **Query Caching**: TanStack Query manages project workspace data with configurable stale time (10s) and automatic revalidation on window focus.
2. **Real-time Invalidation**: Supabase Realtime channels subscribe to table changes (`code_nodes`, `git_branches`, `activity_events`) and invalidate query keys immediately upon mutation.
3. **Optimistic Mutations**: Workspace mutations (`useRowMutation`) update local state optimistically, reverting on network failure with an accessible toast notification.

---

## 5. Security & Verification Guarantees

1. **No Autonomous Code Modification**: The UI has zero automated commit-and-push buttons. Every patch requires inspection via `DiffViewer` and explicit sign-off in `ApprovalGate`.
2. **Deterministic Evidence Display**: All metrics, benchmark scores, and test results display verifiable hash digests and execution timestamps.
3. **Strict Type Safety**: The entire frontend strictly checks types under TypeScript `exactOptionalPropertyTypes: true` and `noImplicitAny: true`.
