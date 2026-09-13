# HackSync AI Security Architecture (Phase 0)

## 1. Executive Summary

HackSync provides real-time collaborative hackathon workspaces with integrated AI assistance, automated AST code intelligence, and passive cyber security auditing. This document establishes the security architecture, threat model, permission tiers, and tenant isolation guarantees governing all AI operations within HackSync.

In Phase 0, all external AI model communications are strictly centralized within a backend **AI Gateway**. Client browsers never receive, store, or transmit provider API credentials. Every AI query and tool execution is bounded by authenticated tenant security contexts, verified through database policies, rate-limited per user and project, redacted of secrets, and logged to immutable audit trails.

---

## 2. Threat Model & Risk Vectors

HackSync's threat modeling evaluates untrusted actors, rogue participants, prompt injection, and multi-tenant boundary compromise:

| Threat Vector | Description | Countermeasure / Security Control |
|---|---|---|
| **Direct Credential Leakage** | Exposure of Gemini, OpenAI, or Anthropic API keys in browser network traffic, client JavaScript bundles, or `localStorage`. | **Zero Browser Credential Storage**: Server-only environment variables (`src/lib/server/env.ts`). All requests pass through the backend AI Gateway. Client storage is purged of legacy keys. |
| **Cross-Tenant Access** | User in Project A queries, modifies, or accesses symbols, files, or AST data belonging to Project B. | **Multi-Tenant Isolation**: `AISecurityContext` with project membership verification (`project_members` query). `ProjectIndexManager` maintains strictly partitioned, in-memory knowledge graphs per `projectId`. Cross-tenant attempts trigger `403 Forbidden` and security audit events. |
| **Arbitrary Host Command Execution** | LLM hallucinations or malicious prompts requesting execution of shell commands, process spawning, or binary execution on the hosting server. | **Host Execution Prohibited**: The `execute_command` tool is permanently disabled in the production execution boundary. Only sandbox AST parsers and deterministic static tools run. |
| **Path Traversal / LFI** | AI tools reading `/etc/passwd`, Windows system drives (`C:\Windows\...`), UNC network shares, or traversing up with `../`. | **Path Confinement**: `TenantGuard.sanitizeFilePath` enforces normalization, URL decoding, drive letter rejection, null-byte checks, and strict confinement within the project root. |
| **Prompt Injection & Secret Exfiltration** | Malicious comments or code inputs containing database connection strings, JWTs, or API keys exfiltrated via LLM prompts. | **Pre-Context Secret Redaction**: `SecretRedactor` sanitizes all code evidence, prompts, logs, and responses using high-precision regex matching for API keys, AWS credentials, JWTs, and bearer tokens before network dispatch. |
| **Unauthorized Code Mutations** | AI autonomously modifying project files without team consensus or peer review. | **Approval Gate & Tamper Detection**: All mutating tools (`apply_patch`, `create_file`, etc.) require human-in-the-loop approval stored in `ai_approval_requests`. Approvals verify user authorization, expiration, and cryptographic diff hash matching. |
| **Resource Exhaustion / DoS** | Malicious users or runaway loops flooding AI endpoints to exhaust API quotas or incur cloud billing spikes. | **Two-Tier Rate Limiting**: Token-bucket rate limiters enforce limits per individual `userId` (15 req/min) and per `projectId` (60 req/min) returning `429 Too Many Requests` with standard `Retry-After` headers. |

---

## 3. Architecture & Trust Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER (UNTRUSTED)                      │
│                                                                        │
│   • HackSync UI & Code Editor                                         │
│   • AiCopilotModal (Model Preference & Intent Controls)               │
│   • Supabase Session JWT Storage                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS POST /api/ai/query
                                    │ Authorization: Bearer <Supabase JWT>
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   HACKSYNC BACKEND AI GATEWAY (TRUSTED)                │
│                                                                        │
│   1. Authentication Gate: Verify Supabase JWT (eliminate anon users)  │
│   2. Tenant Authorization: Verify membership in target project_members │
│   3. Rate Limiter: Per-user (15/min) & Per-project (60/min)            │
│   4. Audit Logger: Correlation UUID (requestId) across all actions    │
│   5. Secret Redactor: Pre-dispatch secret scrubbing                   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│       AI ORCHESTRATOR & TOOLS        │ │   SERVER-ONLY MODEL ROUTER    │
│                                      │ │                               │
│ • ProjectIndexManager (Scoped Graph) │ │ • Google Gemini 2.0 Flash     │
│ • AIToolExecutor (READ_ONLY sandbox) │ │ • OpenAI GPT-4o Mini          │
│ • ApprovalGate (Diff Hash & Expiry)  │ │ • Anthropic Claude 3.5 Sonnet │
│ • AST Parsers (TS, JS, Py, SQL, JSON)│ │ • HackSync Builtin Engine     │
└──────────────────────────────────────┘ └───────────────────────────────┘
```

---

## 4. Security Controls Implementation

### 4.1 Authentication & Identity Assurance
- Anonymous identities (such as `"client-user"`) are strictly eliminated in the AI Gateway.
- Every incoming request must supply a valid `Authorization: Bearer <token>`.
- The token is verified against Supabase Auth (`supabase.auth.getUser`).
- Missing or invalid tokens immediately abort processing with `401 Unauthorized` (`AI_UNAUTHORIZED`).

### 4.2 Multi-Tenant Project Isolation
- Requests specify `projectId`. The gateway verifies that the authenticated user is a registered member of that project (or the project owner) via `project_members`.
- Any attempt to access a project without valid membership immediately aborts with `403 Forbidden` (`AI_FORBIDDEN`) and writes a security audit event to `public.security_audit_events`.
- In-memory knowledge graphs are isolated via `ProjectIndexManager.getGraph(projectId)`. Project A's symbols, files, and metrics are never accessible to Project B. Stale entries are evicted via LRU and 1-hour TTL.

### 4.3 AI Tool Permission Matrix

| Tool Name | Permission Tier | Mutating? | Approval Required? | Description |
|---|---|---|---|---|
| `search_project` | READ | No | No | Searches workspace files using BM25 index |
| `read_file` | READ | No | No | Reads confined project file content |
| `find_references` | READ | No | No | Queries AST symbol references in project graph |
| `analyze_code` | READ | No | No | Parses AST nodes for syntax & logic faults |
| `analyze_security` | READ | No | No | Scans for hardcoded secrets, injection vectors |
| `analyze_dependencies` | READ | No | No | Audits `package.json` for known advisories |
| `get_project_structure`| READ | No | No | Returns file hierarchy and language distribution |
| `generate_fix` | READ | No | No | Proposes diff without applying it |
| `apply_patch` | WRITE | Yes | **YES** | Modifies workspace code file |
| `create_file` | WRITE | Yes | **YES** | Creates new file in project tree |
| `execute_command` | EXECUTE | Yes | **BLOCKED** | Host shell execution (permanently disabled) |

### 4.4 Approval Gate & Diff Integrity
Mutating tools generate a pending approval record stored both in-memory and persistently in `public.ai_approval_requests`:
- Contains: `approvalId`, `requestId`, `projectId`, `userId`, `toolName`, `diffPreview`, `diffHash`, `expiresAt`.
- The `diffHash` is calculated using SHA-256 over the proposed diff.
- Resolution requires user confirmation, verifies expiration (default 15-minute TTL), verifies project match, and validates that `expectedDiffHash === diffHash` to prevent race-condition tampering.

### 4.5 Secret Redaction
The `SecretRedactor` strips credentials before LLM context construction, in logs, and in API responses:
- Google Gemini API keys (`AIzaSy...`)
- OpenAI API keys (`sk-...`, `sk-proj-...`)
- Anthropic API keys (`sk-ant-...`)
- GitHub Personal Access Tokens (`ghp_...`, `github_pat_...`)
- Bearer tokens (`Bearer ...`)
- Supabase Service Role and Anonymous keys
- AWS Access Key IDs (`AKIA...`)
- Generic high-entropy API secrets and private keys

### 4.6 Correlation & Observability
Every gateway request generates a cryptographically secure UUID `requestId`:
- Attached to outgoing HTTP response headers (`x-request-id`).
- Propagated to all `security_audit_events` entries.
- Recorded in `AIObservability` latency, token, and cost metrics.
- Returned in all sanitized error responses for user support tracing.

---

## 5. Non-Goals & Future Hardening (Phase 1+)

1. **Firecracker / WebAssembly MicroVM Sandbox**: In future phases, command execution (e.g. running test runners like `bun test`) will be re-enabled inside ephemeral, network-isolated microVMs or container sandboxes rather than the host system.
2. **Bring-Your-Own-Key (BYOK) Encryption**: If individual teams desire using their own API keys, client-side WebCrypto AES-GCM envelope encryption will be implemented so keys are never stored plaintext on the server.
3. **Advanced Semantic Content Filtering**: Integration of automated model output moderation classifiers (e.g. LLM guardrails for toxic or malicious code output).
