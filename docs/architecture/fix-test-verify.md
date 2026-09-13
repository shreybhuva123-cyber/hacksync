# Fix → Test → Verify Closed Loop Architecture — HackSync Phase 4

## Overview

The **Fix → Test → Verify** pipeline provides HackSync with a disciplined, deterministic engineering cycle for code defect remediation. It enforces human-in-the-loop authorization, atomic rollback on failure, and multi-dimensional verification.

---

## The Closed-Loop Flow

```text
Finding / Defect Detected
         ↓
Root Cause Analysis & Fix Plan
         ↓
Patch Generation (Diff + Cryptographic Hashes)
         ↓
Patch Validation (Boundary, Syntax, Hash Match)
         ↓
Approval Gate (Human Explicit Approval Required)
         ↓
Atomic Patch Application (Rollback Snapshot Stored)
         ↓
Targeted Test Execution (Sandboxed or Verified Runner)
         ↓
Multi-Dimensional Verification (Static Analysis + Rescan + Tests)
         ↓
Final Status (Verified / Rollback on Failure)
```

---

## Core Components

### 1. Patch Generator (`PatchGenerator`)
- Formats proposed fixes into standard Git unified diffs (`--- a/... +++ b/...`).
- Computes SHA-256 base hash of target files before modification.
- Computes SHA-256 diff hash for tamper detection and approval binding.
- Rejects patch generation targeting sensitive files (`.env`, `.git`, credentials).

---

### 2. Patch Validator (`PatchValidator`)
Validates patches against the live filesystem before presentation to the user:
- **Boundary Verification**: Checks that all file paths resolve within the project root. Rejects relative traversal (`../`).
- **Base State Consistency**: Validates that target files on disk match the expected `oldHash` to prevent race conditions or applying patches on stale code.
- **Syntactic Validity**: Rejects malformed hunk headers, unbalanced line counts, and empty diffs.

---

### 3. Human Approval Gate (`ApprovalGate`)
- Enforces strict human approval before any file modification can take place.
- Binds approval tokens to the exact SHA-256 diff hash and user identity.
- Sets strict time-to-live (TTL, default 15 minutes) for approvals.
- Rejects expired, mismatched, or already used approval tokens.

---

### 4. Atomic Patch Applier (`PatchApplier`)
- Verifies that approval token is valid and active.
- Creates an in-memory or on-disk rollback snapshot before applying edits.
- Applies patch changes atomically:
  - If all hunks apply cleanly, commits changes.
  - If any hunk fails or encounters an error, performs an immediate rollback to the exact prior snapshot.
- Records patch audit record in PostgreSQL database.

---

### 5. Multi-Dimensional Verification (`FixVerification`)
Verifies the fix across three independent dimensions:
1. **Targeted Tests**: Runs tests identified by `TestPlanner` for the modified symbols/files.
2. **Security Re-scan**: Runs Phase 3 `SecurityScanner` to ensure the vulnerability is resolved and no new issues were introduced.
3. **AST Integrity**: Verifies that the modified file can still be parsed into a valid AST with clean symbols.

---

### 6. Iteration Safety Cap
- The autonomous fix loop is strictly bounded to a **maximum of 3 iterations**.
- If a patch fails verification after 3 attempts, the system halts, restores the original state, and emits a comprehensive explanation to the user.
- Any further fix attempts require explicit new human approval.
