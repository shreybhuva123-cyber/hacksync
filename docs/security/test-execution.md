# Test Execution Security Architecture & Threat Mitigation — HackSync Phase 4

## Overview

Executing automated tests involves invoking external binaries and scripts. In an enterprise setting, test execution presents severe attack surfaces:
- Arbitrary code execution via shell metacharacters
- Argument injection into test binaries
- Environment variable / secret exfiltration via test scripts
- Infinite loops or denial-of-service via runaway test processes

HackSync Phase 4 applies strict defensive controls to isolate and neutralize these risks.

---

## Defensive Controls

### 1. Zero Shell Wrapping (`shell: false`)
- All commands are invoked using direct binary execution (`node:child_process.execFile` or `spawn`) with an explicit argument array.
- Shell interpreters (`sh`, `bash`, `cmd.exe`, `powershell.exe`) are never invoked.
- This renders shell chaining operators (`&&`, `||`, `;`, `|`, `&`) inert.

---

### 2. Allowlisted Binaries & Strict Command Validation
- Commands must match an explicit allowlist of authorized development binaries:
  - `bun`, `npm`, `npx`, `pnpm`, `yarn`, `vitest`, `jest`, `pytest`, `python`, `node`
- Commands containing prohibited characters or patterns are rejected immediately before invocation:
  - Metacharacters: `|`, `&`, `;`, `$`, `` ` ``, `<`, `>`, `\n`, `\r`
  - Injection attempts: `--eval`, `-e`, `--interactive`, `--inspect`

---

### 3. Sandboxed Execution (`SandboxRunner`)
When sandboxing is enabled:
1. **Isolated Copy**: The target project files are copied into an isolated temporary workspace (`os.tmpdir()`).
2. **Secret Stripping**: Real `.env`, `.env.local`, `.env.production`, and credential files are purged or replaced with non-sensitive stubs (`TEST_ENV=mock`).
3. **Guaranteed Cleanup**: The sandbox directory is recursively deleted in a guaranteed `finally` block, ensuring no temporary files persist.

---

### 4. Process Sandboxing & Resource Constraints
- **Execution Timeout**: Every test process is bound to a strict timeout (default: 30 seconds). Runaway processes are killed via `SIGKILL`.
- **Output Truncation**: Stdout and stderr buffers are capped to prevent memory exhaustion attacks from noisy test loops.

---

### 5. Output Secret Redaction
All test output streams are passed through the HackSync secret redactor:
- API keys (Anthropic, OpenAI, GitHub, AWS, Stripe)
- Database credentials (PostgreSQL, MySQL, Redis connection URIs)
- Private keys and JWT tokens
- Strings matching redacted patterns are replaced with `[REDACTED_*]` tokens before entering logs or AI contexts.
