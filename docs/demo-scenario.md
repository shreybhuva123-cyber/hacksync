# HackSync — End-to-End Portfolio Demonstration Scenario

**Demonstration Goal:** Showcase the complete closed-loop intelligence, security, and fix verification lifecycle of HackSync on a real codebase with zero mocked success.

---

### Phase 1: Realistic Repository Setup (Known Vulnerability)
1. Initialize a project containing an express authentication endpoint:
   - File: `src/api/users.ts`
   - Code:
     ```typescript
     import { db } from "../db";

     export async function findUserByEmail(email: string) {
       // High-severity SQL Injection via string concatenation
       const query = "SELECT * FROM users WHERE email = '" + email + "'";
       return db.query(query);
     }
     ```
   - Accompanying unit test in `src/tests/users.test.ts`:
     ```typescript
     import { expect, test } from "bun:test";
     import { findUserByEmail } from "../api/users";

     test("findUserByEmail executes query for valid email", async () => {
       const user = await findUserByEmail("alice@example.com");
       expect(user).toBeDefined();
     });
     ```

---

### Phase 2: Project Indexing & AST Knowledge Graph
1. HackSync indexes the repository incrementally using tree-sitter / Babel AST parsers:
   - **Symbols Identified**: `findUserByEmail` (Function, `src/api/users.ts:3`), `db` (Import).
   - **Cross-References**: 1 consumer in test suite, 1 database dependency.
   - **Dependency Tree**: Maps caller-callee relationship between route controller and database layer.

---

### Phase 3: Passive Security Static Analysis (SAST)
1. Run passive security audit (`security_scan` tool):
   - **Detection**: Rule `SQL_INJECTION` (Category: `injection`, Severity: `CRITICAL`).
   - **Line-Level Evidence**:
     ```
     src/api/users.ts:5 -> const query = "SELECT * FROM users WHERE email = '" + email + "'";
     ```
   - **Heuristic Health Score**: Calculated without certifying absolute safety (Heuristic score: 72/100).

---

### Phase 4: AI Copilot Query with Verified Citations
1. Ask HackSync AI Copilot: *"What security risks exist in findUserByEmail and how should we fix them?"*
2. **AI Orchestrator Pipeline**:
   - Classifies intent as `security`.
   - Executes `retrieve_code` and `find_references` via `AIToolExecutor`.
   - Passes verified evidence snippets to the server-side model.
   - Output Validator verifies all file citations (`src/api/users.ts:5`) against the indexed project graph.
   - Returns response with verified citations and zero hallucinated phantom paths.

---

### Phase 5: Structured Fix Proposal & Cryptographic Hashing
1. Request fix proposal (`generate_fix` tool):
   - **Root Cause Analysis**: Direct concatenation of unsanitized string argument into raw SQL query.
   - **Unified Diff Generation**:
     ```diff
     --- a/src/api/users.ts
     +++ b/src/api/users.ts
     @@ -4,2 +4,2 @@
     -  const query = "SELECT * FROM users WHERE email = '" + email + "'";
     -  return db.query(query);
     +  const query = "SELECT * FROM users WHERE email = $1";
     +  return db.query(query, [email]);
     ```
   - **Cryptographic Diff Hash**: `SHA-256: 4a2f8c...`
   - **Base State Hash**: `SHA-256: 9e1b7d...`

---

### Phase 6: Human-in-the-Loop Approval Gate
1. The AI cannot apply the patch autonomously. A pending approval request is created:
   - Request ID: `appr_1710345000_a8c2`
   - Target File: `src/api/users.ts`
   - Diff Hash: Verified against proposed patch.
2. Team lead or project owner reviews diff in UI and signs approval:
   - `ApprovalGate.resolveApproval({ approvalId, decision: "approved", userId: "usr-lead" })`.

---

### Phase 7: Transactional Patch Application & Atomic Rollback
1. `PatchApplier.apply()` verifies:
   - Approval status is `approved` and not expired.
   - Diff hash matches current patch content.
   - Current file content matches base state hash (TOCTOU prevention).
2. Creates an in-memory transactional snapshot of target files before modifying.
3. If writing fails midway, all files are atomically restored to original content.

---

### Phase 8: Targeted Test Execution in Isolated Test Workspace
1. `TestRunner.run()` invokes the test command (`bun test src/tests/users.test.ts`):
   - Execution uses `execFile` with `shell: false` (no shell metacharacter injection possible).
   - Sensitive production environment variables are stripped.
   - Tests execute and pass in 28ms.

---

### Phase 9: Security Re-Scan & Verification
1. `FixVerificationEngine.verify()` triggers an incremental AST re-index and security re-scan:
   - `src/api/users.ts` is re-analyzed.
   - The SQL injection finding is confirmed resolved.
   - Zero new vulnerability regressions detected.
   - Fix status marked: **VERIFIED**.

---

### Phase 10: Git Intelligence & Blast Radius Calculation
1. Run `git_impact` tool:
   - Analyzes git diff against changed symbols.
   - Detects parameter signature change on `findUserByEmail`.
   - Computes Regression Risk Score: `LOW (0.15 blast radius)`.
   - Identifies all dependent routes and tests that must be smoke-tested.

---

### Phase 11: Evaluation & Model Benchmarking Dashboard
1. Navigate to `/evaluation` in HackSync web platform:
   - Displays evaluation run results comparing Claude 3.5 Sonnet, GPT-4o Mini, and Gemini 2.0 Flash.
   - Shows retrieval accuracy benchmarks: Hit@1, Hit@3, Hit@5, MRR.
   - Shows static analysis Precision (100%), Recall (83.3%), F1 (90.9%).

---

### Phase 12: End-to-End Observability & Audit Trail
1. Inspect the Security Audit Trail (`/security` -> Audit Log):
   - Every operation contains `requestId`, `timestamp`, `userId`, `projectId`, `toolName`, `latencyMs`.
   - All sensitive credentials and API keys are verified masked (`[REDACTED_STRIPE_KEY]`, `[REDACTED_AWS_KEY]`).
   - Audit trail is immutable (PostgreSQL default-deny on UPDATE and DELETE).

---

### Phase 13: Degraded & Offline State Verification
1. Simulate network disconnect / external AI provider outage:
   - External LLM throws 503 or times out.
   - Circuit breaker trips to `OPEN`.
   - AI Orchestrator seamlessly falls back to **HackSync Built-in Deterministic Intelligence**.
   - User receives a complete, structured analysis report with zero raw stack traces and zero broken UI components.
