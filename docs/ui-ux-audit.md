# HackSync — Phase 7: UI/UX Audit & Component Consolidation Matrix

**Document Status:** Production Baseline  
**Phase:** 7 — Complete Productization + Professional UI/UX Redesign  
**Scope:** Complete frontend architecture, routing, design system, component catalog, and interaction models.

---

## 1. Executive Summary & Objective

HackSync has developed powerful core intelligence capabilities across Phases 0 through 6:
- **Phase 0/0.1:** Authenticated AI Gateway, tenant security, rate limiting, and prompt injection defense.
- **Phase 1:** AST knowledge graph, symbol extraction, dependency graph, and semantic indexing.
- **Phase 2:** Multi-user CodeSync, CRDT conflict radar, and AST-aware smart merge engine.
- **Phase 3:** Passive SAST analysis, secret scanning, dependency CVE tracking, and project health calculation.
- **Phase 4:** Targeted test discovery, test planner, automated patch generator, validator, and Fix $\to$ Test $\to$ Verify closed loop.
- **Phase 5:** Ground truth evaluation engine, benchmark suites (BM-1 to BM-7), and scoring algorithms.
- **Phase 6:** Multi-model comparison engine, dual-delta regression detection, cost/latency observability, and multi-tenant evaluation APIs.

However, the existing user interface still reflects early hackathon prototypes:
1. **Chatbot-Centric Paradigm:** AI interaction is shoehorned into an oversized modal chat window with cartoonish emojis and predefined prompt bubbles rather than an evidence-driven, IDE-native engineering assistant.
2. **Navigation Bloat:** Over 20 flat navigation entries are listed under loosely categorized headers ("Overview", "Contracts", "Code & Git", "Team"), overwhelming the developer without clear workflow hierarchy.
3. **Missing Critical Surfaces:** The groundbreaking test intelligence from Phase 4 and evaluation/benchmarking intelligence from Phases 5 & 6 have no dedicated top-level workspaces; users must trigger them through mock buttons or sub-modals.
4. **Visual "AI Slop" & Clutter:** Use of generic SaaS gradients, arbitrary card glow utilities (`shadow-glow`, `pulse-ring`), inconsistent border radiuses, and rainbow badge colors that contradict an austere, high-craft engineering tool.
5. **Safety Disconnects:** In the security center, patches can be applied with a single click without the required human-in-the-loop Diff Review $\to$ Approval Gate $\to$ Test Verification flow.

Phase 7 systematically replaces these legacy patterns with a cohesive, professional engineering platform inspired by linear, high-craft developer tools like GitHub, Linear, Supabase, and VS Code.

---

## 2. Comprehensive Catalog of Existing Routes & Views

The application currently utilizes TanStack Start and TanStack Router (`@tanstack/react-router`):

| Route Path | Current Component | Primary Purpose | Deficiencies & Issues |
| :--- | :--- | :--- | :--- |
| `/__root.tsx` | Root layout | Global HTML shell, query client, router outlet | Lacks centralized command palette hook, global keyboard shortcut listener. |
| `/index.tsx` | Landing page | Public entry point / hero | Features marketing-style hero section; needs streamlined developer onboarding. |
| `/auth.tsx` | Auth page | Login / signup with Supabase | Functional but lacks consistent neutral typography and streamlined layout. |
| `/_authenticated/route.tsx` | Layout guard | Auth session check + `AppShell` | Good authentication boundary; wraps all protected routes. |
| `/_authenticated/dashboard.tsx` | Cockpit | Readiness score, team presence, tasks | "Cockpit" feels like hackathon demo; has "Judge Pitch Mode" and simulated sync triggers; lacks repository statistics, AST intelligence summary, and benchmark status. |
| `/_authenticated/code.tsx` | Files & Code | Multi-pane file manager, Monaco editor, sync modal | 1,222 lines in one file; mixes local filesystem handles, AI tabs, and GitHub pushes; cluttered layout. |
| `/_authenticated/security.tsx` | Cyber Security | SAST vulnerability list, score card | Applies fixes directly via database row updates without the Phase 4 Fix-Test-Verify approval gate. |
| `/_authenticated/git.tsx` | Git & Branches | Branch list, ahead/behind counts | Only 191 lines; completely ignores Phase 1 & 2 impact blast radius, commit history diffs, and AST symbol conflict radar. |
| `/_authenticated/api.tsx` | API Contracts | REST endpoints, payloads, auth flags | Clean, but isolated from the main code intelligence and testing workflows. |
| `/_authenticated/schema.tsx` | Database Schema | PostgreSQL tables, columns, constraints | Functional schema browser; lacks visual link to AST symbols and ORM models. |
| `/_authenticated/env.tsx` | Environment | Secret keys, config variables | Displays environment configs; needs strict secret masking and redaction. |
| `/_authenticated/health.tsx` | Health Center | 5-factor project health score | Redundant with dashboard health metrics; should be a cohesive sub-view. |
| `/_authenticated/handoffs.tsx` | Handoff Cards | Role-based sprint handoff notes | Hackathon artifact; low relevance for ongoing repository engineering. |
| `/_authenticated/pitch.tsx` | Judge Pitch & Demo | 3-minute hackathon pitch timer | Hackathon demo view; should be moved to secondary tool or demo drawer. |
| `/_authenticated/predemo.tsx` | Pre-Demo Checklist | Demo validation checklist | Hackathon specific; not an everyday developer engineering workflow. |
| `/_authenticated/architecture.tsx` | Architecture Map | Component dependency graph | Needs integration with Phase 1 `ProjectKnowledgeGraph`. |
| `/_authenticated/integrations.tsx`| Integration Map | Microservice & 3rd-party links | Useful architecture view; needs styling harmonization. |
| `/_authenticated/tasks.tsx` | Tasks | Kanban-style task cards | Useful task tracking; needs unified table/card design. |
| `/_authenticated/activity.tsx` | Activity Feed | Audit log of actions | Good audit trail; needs structured filtering and severity filters. |
| `/_authenticated/projects.tsx` | Projects | List and switch projects | Functional; should be accessible from the top bar project selector. |
| `/_authenticated/project-settings.tsx`| Project Settings | Project metadata and team | Clean; needs consolidation into unified `/settings`. |
| `/_authenticated/settings.tsx` | Settings | Profile and preferences | Clean; needs consolidation with project and AI provider settings. |
| `/_authenticated/setup.tsx` | Setup & Workflow | Initial workspace config | Onboarding workflow; should serve as first-time empty state. |

---

## 3. Critical Gaps & Missing Workspaces

### 3.1 Missing Primary Route: `/testing` (Phase 4 Testing Intelligence)
Currently, Phase 4's powerful test capabilities (`TestDiscovery`, `TestFrameworkDetector`, `TestPlanner`, `SandboxRunner`, `ExecutionTracker`) are invisible in the top navigation.
- **Requirement:** Implement `src/routes/_authenticated/testing.tsx`.
- **Core Views:**
  1. **Test Suite Overview:** Total tests, passing/failing status, test framework detection (Vitest/Jest/Bun), and execution duration.
  2. **Targeted Test Planner:** Generate prioritized test plans targeting specific modified files, AST symbols, or security vulnerabilities.
  3. **Live Test Runner:** Execute unit/integration suites in isolated sandboxes with real-time test run output, assertions, and stack traces.
  4. **Coverage & Impact Matrix:** Visual relationship between test cases, source files, and AST symbols.

### 3.2 Missing Primary Route: `/evaluation` (Phases 5 & 6 Benchmarks & Observability)
The ground truth evaluation engine, benchmark datasets (BM-1 to BM-7), dual-delta regression engine, model comparison matrix, and cost tracker currently lack an interactive frontend control center.
- **Requirement:** Implement `src/routes/_authenticated/evaluation.tsx`.
- **Core Views:**
  1. **Benchmark Suite Explorer:** View standard test cases (BM-1 to BM-7), expected ground truth, dataset immutability checksums, and version tags.
  2. **Benchmark Execution Station:** Run benchmarks against selected AI models (Claude 3.5 Sonnet, GPT-4o, Local Ollama, Builtin) using `EvaluationApi`.
  3. **Model Comparison Matrix:** Compare models across 6 dimensions (retrieval precision, AST accuracy, fix correctness, syntax validity, latency, cost).
  4. **Regression Radar & Severity Dashboard:** Inspect regressions across runs with dual-delta statistical protection and 5-tier severity classification.
  5. **Cost & Observability Tracker:** Token usage, cumulative cost, and latency breakdown by tool and model.

---

## 4. UI/UX Anti-Patterns & Visual Audit

### 4.1 "AI Slop" Design Tells
- **Gradients & Glows:** `styles.css` features `.text-gradient` (a 3-color pastel gradient) and `.shadow-glow` (`oklch(0.72 0.14 205 / 35%)` glowing drop shadows) that give cards an unpolished, neon aesthetic.
- **Pulsing Rings:** `@keyframes pulse-ring` adds unnecessary animated attention-grabbing rings on status pills.
- **Emoji Overuse:** Navigation and AI Copilot messages feature emojis (`👋`, `🛡️`, `⚡`, `🏆`) instead of precision SVG icons (`lucide-react`).
- **Inconsistent Card Geometry:** Border radiuses vary between `rounded-md` (6px), `rounded-lg` (8px), `rounded-xl` (12px), and `rounded-2xl` (16px) without systematic hierarchy.

### 4.2 Application Shell & Navigation Flaws
- **Sidebar Clutter:** 21 sidebar items create cognitive fatigue. The developer cannot distinguish everyday engineering workflows from one-time demo tools.
- **Unclear Information Architecture:** "API Contracts", "Database Schema", and "Architecture Map" are separated from "Files & Code", even though all three are derived from code intelligence and the AST knowledge graph.
- **Lack of Command Palette:** Power users have no rapid way to search files, jump to symbols, trigger tests, or navigate routes via keyboard (`Ctrl + K`).

### 4.3 AI Copilot UX Deficiencies
- **Chatbot Paradigm:** The current `AiCopilotModal` presents a classic chat history interface. Developers do not want to chat; they want evidence, line numbers, root cause explanations, diff proposals, and approval controls.
- **Zero Evidence Verification:** Answers lack clickable links to AST nodes, file lines, or commit hashes.
- **Missing Approval Gate:** No structured diff viewer or confirmation mechanism exists within the copilot dialog.

---

## 5. Design System Specifications (The Phase 7 Standard)

### 5.1 Color Palette
Strictly grounded in dark neutrals with a single restrained primary accent and semantic status indicators:

```css
/* Surface Hierarchy */
--bg-app:        #0B0F14; /* Deep void background */
--bg-subtle:     #11161D; /* Secondary surface, sidebar, panel backgrounds */
--bg-surface:    #171D26; /* Card backgrounds, active tab items, modal chrome */
--bg-raised:     #1F2633; /* Hovered surfaces, input backgrounds, dropdowns */

/* Borders */
--border-subtle: #252D38; /* Standard borders, dividers */
--border-strong: #374151; /* Focused inputs, active borders, card highlights */

/* Text Hierarchy */
--text-primary:   #F3F4F6; /* High contrast headers and primary body (gray-100) */
--text-secondary: #9CA3AF; /* Secondary descriptions, labels, breadcrumbs (gray-400) */
--text-muted:     #6B7280; /* Disabled text, line numbers, subtle timestamps (gray-500) */

/* Accents & Semantics */
--accent-primary: #4F8CFF; /* Single restrained electric blue accent */
--accent-hover:   #3B7CEE; /* Accent hover state */
--status-success: #22C55E; /* Passing tests, clean merges, healthy security */
--status-warning: #F59E0B; /* Medium vulnerabilities, pending approvals, warnings */
--status-danger:  #EF4444; /* Critical/High vulnerabilities, failing tests, merge conflicts */
--status-info:    #38BDF8; /* Informational notices, documentation links */
```

### 5.2 Typography
- **UI & Controls:** `Inter`, system fallback (`ui-sans-serif, system-ui, -apple-system, sans-serif`). Clean, compact, legible.
- **Code, Hashes, Metrics, Paths:** `JetBrains Mono`, monospace fallback (`ui-monospace, monospace`).
- **Hierarchy:**
  - Page Title: 20px / font-semibold / tracking-tight
  - Section Header: 15px / font-semibold
  - Body Text: 13px / font-normal / leading-relaxed
  - Small / Monospace Labels: 11px / font-medium / tabular-nums
  - Micro Badges: 10px / font-semibold / uppercase

### 5.3 Geometry & Elevation
- **Controls (Inputs, Buttons):** `rounded-[6px]` (radius-sm)
- **Cards & Sub-panels:** `rounded-[8px]` (radius-md)
- **Modals & Dialogs:** `rounded-[10px]` (radius-lg)
- **Root Containers:** `rounded-[12px]` (radius-xl)
- **Status Pills:** `rounded-full` (only exception)
- **Elevation:** Flat border-based elevation (`1px solid var(--border-subtle)`). Zero glowing box-shadows. Clean `0 4px 12px rgba(0, 0, 0, 0.4)` on modals and popovers.

---

## 6. Component Consolidation & Clean-Up Matrix

| Old Component | Path | Action | Target / Replacement |
| :--- | :--- | :--- | :--- |
| `AppShell.tsx` | `src/components/hacksync/AppShell.tsx` | **Refactor** | Redesign with 7 top-level groups, branch bar, and Command Palette integration. |
| `AiCopilotModal.tsx` | `src/components/hacksync/AiCopilotModal.tsx` | **Refactor** | Replace chat bubble UI with structured `AIAnswer`, `EvidenceList`, `DiffViewer`, and `ApprovalGate`. |
| `primitives.tsx` | `src/components/hacksync/primitives.tsx` | **Refactor** | Harmonize colors to Phase 7 tokens, remove glows, fix radiuses to 6/8/10px. |
| `SecurityFindingList.tsx` | `src/components/security/SecurityFindingList.tsx` | **Refactor** | Add "Propose Fix" button wiring into Phase 4 Fix Planner. |
| `SecurityScoreCard.tsx` | `src/components/security/SecurityScoreCard.tsx` | **Keep / Refine** | Clean up typography and color tokens. |
| `CodeEditorView.tsx` | `src/components/code/CodeEditorView.tsx` | **Refactor** | Improve breadcrumbs, file status indicator, and symbol jumping. |
| `CodeSyncModal.tsx` | `src/components/code/CodeSyncModal.tsx` | **Refine** | Clean up UI to match unified design tokens. |
| `GitHubPushModal.tsx` | `src/components/code/GitHubPushModal.tsx` | **Refine** | Integrate branch readiness check. |
| `MyWorkspaceView.tsx` | `src/components/code/MyWorkspaceView.tsx` | **Refactor** | Split out AST inspector and symbol tree into modular components. |
| `CommandPalette.tsx` | `src/components/hacksync/CommandPalette.tsx` | **NEW** | Global `Ctrl + K` command palette powered by `cmdk`. |
| `ApprovalGate.tsx` | `src/components/hacksync/ApprovalGate.tsx` | **NEW** | Human-in-the-loop patch approval and verification component. |
| `DiffViewer.tsx` | `src/components/hacksync/DiffViewer.tsx` | **NEW** | High-craft syntax-highlighted unified diff viewer. |
| `TestPlannerView.tsx` | `src/components/testing/TestPlannerView.tsx` | **NEW** | Targeted test planning and execution dashboard. |
| `BenchmarkView.tsx` | `src/components/evaluation/BenchmarkView.tsx` | **NEW** | Interactive model benchmark and regression dashboard. |

---

## 7. Migration & Backward Compatibility Guarantees

1. **Zero Backend Regressions:** All existing API endpoints, Supabase queries, and intelligence modules (`ProjectKnowledgeGraph`, `StaticAuditor`, `TestDiscovery`, `FixPlanner`, `EvaluationEngine`) remain completely untouched in logic; the UI connects directly to them.
2. **Safe Fallbacks:** In offline or mock demo environments, local state and mock providers gracefully furnish comprehensive test and benchmark data.
3. **Route Preservation:** Existing routes (`/code`, `/security`, `/git`, `/api`, `/schema`) will remain fully functional with their paths preserved, enhanced by the new design system and navigation hierarchy.
4. **Build & Type Safety:** Every component is strictly typed in TypeScript; `bunx tsc --noEmit` and `bun run build` must pass at every milestone.
