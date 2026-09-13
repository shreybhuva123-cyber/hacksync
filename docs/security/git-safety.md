# Git Safety & Sandbox Boundary Specification — HackSync Phase 3

## Overview

HackSync interacts with Git repositories strictly under the **Principle of Least Privilege**.

Phase 3 is exclusively **READ-ONLY**. Under no circumstances can AI agents or tools execute mutating Git operations or escape project directory bounds.

---

## 1. Allowed Git Subcommands

Only the following subcommands are permitted by `GitSafety`:

| Subcommand | Purpose | Safe Flags Enforced |
| :--- | :--- | :--- |
| `status` | Retrieve current repository state | `--porcelain=v1`, `-u` |
| `diff` | Inspect uncommitted changes or commit ranges | `--unified=3`, `--cached`, `--` |
| `log` | Inspect commit history | `-n <count>`, `--oneline`, `--format` |
| `branch` | Detect active branch name | `--show-current` |
| `rev-parse` | Read commit hashes or head references | `HEAD` |

---

## 2. Forbidden Git Operations

The following commands are strictly blocked. Any invocation triggers an `AuthorizationError`:

- `git push`
- `git commit`
- `git checkout`
- `git reset`
- `git clean`
- `git merge`
- `git rebase`
- `git apply`
- `git rm`
- `git mv`
- `git init`
- `git clone`
- `git remote`
- `git config`
- `git fetch`
- `git pull`

---

## 3. Sandboxing & Confinement Rules

### A. Repository Path Canonicalization
Before any Git process is executed, target repository paths undergo strict normalization:
```typescript
const canonicalRoot = path.normalize(path.resolve(authorizedProjectRoot));
const canonicalTarget = path.normalize(path.resolve(requestedPath));

if (!canonicalTarget.startsWith(canonicalRoot)) {
  throw new AuthorizationError("Cross-project directory escape prevented.");
}
```

### B. Shell-Free Process Spawning
Git CLI execution uses `node:child_process.execFile`:
- Arguments are passed as an array of discrete strings (`string[]`).
- The OS shell (`/bin/sh`, `bash`, `cmd.exe`) is bypassed completely.
- Shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `>`, `<`) cannot trigger command chaining or argument injection.

### C. Resource Bounding & Timeouts
- All Git operations have a hard 10-second timeout.
- Maximum stdout buffer is capped at 10 MB to prevent memory exhaustion from massive diffs.
