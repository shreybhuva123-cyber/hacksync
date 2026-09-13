# HackSync — System Limitations & Trade-Offs

This document provides an honest, un-hyped accounting of HackSync's current limitations, architectural trade-offs, and conditions under which specific features degrade.

---

## 1. Static Security Analysis Boundaries

1. **Static AST vs. Dynamic Taint Tracking**:
   - HackSync's static analyzer uses AST traversal, regex signatures, and source-to-sink heuristic mapping.
   - It cannot track complex dynamic data flow across asynchronous message queues, inter-process communication (IPC), or dynamic reflection (`eval()`, dynamic imports).
2. **Not a Certified Compliance Scanner**:
   - HackSync Security Health is an internal heuristic score designed to catch common hackathon/developer mistakes (hardcoded API keys, unparameterized queries, open CORS).
   - It is not certified for PCI-DSS, SOC 2, ISO 27001, or FedRAMP compliance auditing.

---

## 2. Test Execution & Workspace Isolation

1. **Process-Level vs. Kernel-Level Isolation**:
   - Test execution uses `execFileAsync` with `shell: false`, argument allowlisting, and sensitive environment variable stripping.
   - It does NOT provide kernel-level virtualization, network namespace isolation, or memory caps (e.g. gVisor, Firecracker, or Docker).
2. **Binary Dependencies**:
   - The test runner assumes required runtimes (e.g. `bun`, `node`, `python`) are available in the host environment. If an uninstalled runtime is requested, the test run fails with a process spawn error.

---

## 3. Git Operations & Repository Scale

1. **Strictly Read-Only Git Policy**:
   - HackSync intentionally contains zero code paths for `git push`, `git commit`, `git merge`, or `git checkout`.
   - Teams must perform commits and pushes via their standard local Git CLI or CI/CD pipelines.
2. **Repository Size Thresholds**:
   - In-memory AST indexing performs with sub-second latency for repositories up to ~500 files and ~2,500 symbols.
   - For massive monorepos (>5,000 files), initial full-tree parsing can consume >300MB RAM. Large repos should rely on folder-scoped sub-indexing or persistent disk-backed caching.

---

## 4. LLM & External AI Dependencies

1. **Provider Outages & Rate Limits**:
   - If OpenAI, Anthropic, or Gemini experience upstream HTTP 503 or 429 rate limit errors, HackSync's circuit breaker trips and cascades to fallbacks.
   - When all external providers fail, the system falls back to **HackSync Built-in Intelligence**, which produces deterministic AST-backed analysis reports but cannot generate open-ended natural language prose.
2. **Context Window Constraints**:
   - Even with modern 128k+ context windows, HackSync enforces a 15,000-character context budget for code snippets to preserve prompt token economy and low latency. Very broad questions (e.g. *"Explain every single file in the repository"*) are truncated to top-ranked architectural entry points.

---

## 5. Architectural Trade-offs Summary

| Architectural Choice | Benefit | Trade-off / Limitation |
|---|---|---|
| **In-memory Knowledge Graph** | Ultra-fast sub-50ms hybrid retrieval | Requires RAM; rebuilds index on cold process restart |
| **Shell-Free Process Spawning** | Immune to shell metacharacter injection | Cannot use shell pipes (`|`), redirections (`>`), or compound commands in tests |
| **PostgreSQL RLS-Authoritative Approvals** | Multi-tenant cryptographic security | Requires database round-trip for approval resolution |
| **Strict Read-Only Tool Registry** | Zero risk of autonomous AI code corruption | Human must explicitly approve and merge code changes |
