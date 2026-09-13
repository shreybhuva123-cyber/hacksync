# HackSync AI Orchestrator Architecture (Phase 2)

## 1. Overview

HackSync Phase 2 establishes a production-grade **Unified AI Orchestrator**, **Resilient Model Router with Multi-Provider Fallbacks**, and a **Secure Typed Tool System**. Grounded in Phase 1's Project Intelligence Engine and Phase 0/0.1's zero-trust security boundary, Phase 2 eliminates uncontrolled autonomous multi-agent loops and replaces heuristic routing with a deterministic, budget-guarded pipeline.

```
User / API Gateway (/api/ai/query)
               │
               ▼
   [Server AI Gateway]
   • Bearer JWT Verification
   • Authoritative DB Project Membership Lookup
   • Per-User & Per-Project Rate Limiting (Token Buckets)
   • Secret Redaction of Incoming Query
               │
               ▼
   [AIOrchestrator.process(request)]
   • TenantGuard Validation & Session Boundary Check
   • Multi-Turn Contextual Reference Resolution
               │
               ▼
   [Task Classifier & Planner]
   • 11 Typed Task Categories: explain, debug, security, architecture,
     test, code_search, impact, dependency, project_overview, git, general
   • Generates deterministic TaskPlan: goal, allowedTools, maxToolCalls
               │
               ▼
   [Context Planner]
   • High-signal extraction from Phase 1 Project Intelligence
   • Symbols, caller/callee graphs, architecture profile, contracts
   • Strict character limit (default 8,000 chars) with Secret Redaction
               │
               ▼
   [Secure Tool Execution Engine]
   • 8 Core Read-Only Tools (strict READ tier)
   • ExecutionBudgetManager (max 8 calls, deduplication, loop prevention)
   • AuditTrail recording every tool invocation
               │
               ▼
   [Multi-Provider Model Router]
   • Providers: Anthropic, OpenAI, Google Gemini, Local Ollama
   • Retries with exponential backoff & timeout via AbortController
   • Graceful Fallback Cascade: Primary → Secondary → Local Ollama → Deterministic Offline
   • Server-only credentials (process.env / server-env.ts)
               │
               ▼
   [Output Validator & Citation Checker]
   • Extracts file/line citations from generated text
   • Validates existence against project knowledge graph
   • Flags unverified citations under `uncertainty` & penalizes confidence
   • Ground truth fallback: "Insufficient project evidence."
               │
               ▼
   [Structured AIResult + Observability]
   • AIResult { requestId, taskType, answer, evidence, findings, uncertainty, confidence }
   • Metrics logged to AIObservability and AuditTrail
```

---

## 2. Core Components

### 2.1 Unified AI Orchestrator (`AIOrchestrator`)
- **Canonical Entry Point**: `AIOrchestrator.process(request: OrchestratorRequest): Promise<AIResult>`
- **Backward Compatibility**: `AIOrchestrator.processQuery(params): Promise<OrchestrationResult>` wraps `process()` to support existing UI components and benchmark test suites without code changes.
- **Tenant Confinement**: Rejects mismatched `request.projectId` against the verified `securityContext.projectId`.

### 2.2 Task Classifier & Planner (`TaskClassifier`)
Classifies engineering queries into 11 distinct task categories:
1. `explain`: Component and function walkthroughs, logic explanation.
2. `debug`: Runtime exceptions, 500 errors, null pointer dereferences.
3. `security`: Static security audits, OWASP vulnerabilities, credential exposure.
4. `architecture`: System layer analysis, component roles, framework detection.
5. `test`: Unit and regression test generation, test planning.
6. `code_search`: Symbol lookup, occurrence search across project files.
7. `impact`: Reverse dependency analysis, blast radius calculation.
8. `dependency`: Package manifest audit, GHSA advisories, unpinned versions.
9. `project_overview`: File tree, language breakdown, scale metrics.
10. `git`: Diff reviews, staged changes, pull request summaries.
11. `general`: Engineering queries grounded in project evidence.

### 2.3 Context Planner (`ContextPlanner`)
Pre-plans the minimal context required before calling LLMs:
- Locates matching symbol definitions and bounded code slices (max 60 lines per target).
- Extracts architecture profile summary and detected layers.
- Injects relevant API contracts and database table schemas.
- Scrubs credentials using `SecretRedactor`.
- Enforces strict character and token ceilings (default 8,000 chars) to prevent prompt bloat.

### 2.4 Secure Typed Read-Only Tool System
Tools are strictly sandboxed and execute exclusively in the `READ_ONLY` tier:

| Tool Name | Parameters | Description |
|---|---|---|
| `search_symbols` | `{ name: string }` | Looks up AST symbols (functions, classes, interfaces, components) with exact line spans. |
| `find_references` | `{ target: string }` | Traverses direct and transitive dependents of a file or symbol. |
| `get_project_structure` | `{}` | Returns complete file tree, line counts, metrics, and circular dependency cycles. |
| `retrieve_code` | `{ path: string, startLine?: number, endLine?: number }` | Reads bounded file slice (max 150 lines) with path sanitization and secret scrubbing. |
| `find_api_routes` | `{ method?: string, routePrefix?: string }` | Discovers registered API routes from AST parsers and workspace contracts. |
| `find_database_usage` | `{ tableName?: string }` | Discovers tables, columns, and project files referencing database schema. |
| `architecture_summary` | `{}` | Returns framework, database engine, auth system, and layer counts. |
| `dependency_impact` | `{ target: string }` | Computes blast radius score (0-100), affected API routes, and assigns risk tier (`LOW` to `CRITICAL`). |

#### Execution Budget & Loop Guard (`ExecutionBudgetManager`)
- **Max Tool Calls**: Hard limit of 8 tool calls per request (configurable via `maxBudgetCalls`).
- **Deduplication**: Computes deterministic hash `toolName#hash(args)` to suppress identical re-executions.
- **Loop Prevention**: Detects and halts when any single tool is invoked 3 times consecutively.
- **Timeouts**: Global timeout (15,000ms) and per-tool timeout (4,000ms).

### 2.5 Resilient Model Router (`ModelRouter`)
- **Providers Supported**:
  - `AnthropicProvider`: Claude 3.5 Sonnet
  - `OpenAIProvider`: GPT-4o Mini / GPT-4o
  - `GeminiProvider`: Google Gemini 2.0 Flash
  - `OllamaProvider`: Local private LLMs (`http://127.0.0.1:11434`, zero cloud egress)
- **Timeouts & Retries**: Every provider call uses an `AbortController` (25s timeout) with exponential backoff retries (max 2 retries).
- **Fallback Cascade**: Primary $\to$ Secondary $\to$ Local Ollama $\to$ Deterministic Built-in Intelligence (zero hallucination, offline static report).
- **Zero Client Credential Exposure**: All API keys are loaded strictly from server environment variables via `getServerEnv()`.

### 2.6 Evidence-First Output Validator (`OutputValidator`)
- Parses line and file citations from the generated answer.
- Verifies cited paths against `ProjectKnowledgeGraph.hasFile(path)`.
- Flags non-existent files under `uncertainty: ["Unverified citation: '...' does not exist"]` and applies a confidence penalty.
- Detects empty evidence cases and enforces honesty: `"Insufficient project evidence."` instead of hallucinating.

---

## 3. Verification & Metrics

- **Automated Tests**: 191 passing tests across 14 test suites in `bun test`.
- **TypeScript**: 0 errors under `bunx tsc --noEmit` with `exactOptionalPropertyTypes: true`.
- **Production Build**: Clean compilation under Vite/Nitro Cloudflare worker target (`bun run build`).
