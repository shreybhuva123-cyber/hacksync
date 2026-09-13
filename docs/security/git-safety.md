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

### A. Repository Path Canonicalization & Symlink Escape Protection
Before any Git process is executed, target repository paths undergo strict lexical and physical filesystem validation:
```typescript
const canonicalRoot = path.normalize(path.resolve(authorizedProjectRoot));
const canonicalTarget = path.normalize(path.resolve(requestedPath));

if (!canonicalTarget.startsWith(canonicalRoot)) {
  throw new AuthorizationError("Cross-project directory escape prevented.");
}

// Physical symlink resolution prevents symlinks within the project root from escaping to external directories
const realRoot = fs.realpathSync(canonicalRoot);
const realTarget = fs.realpathSync(canonicalTarget);
if (!realTarget.startsWith(realRoot)) {
  throw new AuthorizationError("Symlink escape outside project root detected.");
}
```

### B. Shell-Free Process Spawning & Per-Argument Allowlisting
Git CLI execution uses `node:child_process.execFile`:
- Arguments are passed as an array of discrete strings (`string[]`).
- The OS shell (`/bin/sh`, `bash`, `cmd.exe`) is bypassed completely.
- **Independent Argument Allowlisting**: Even with `execFile`, every individual argument beginning with `-` is independently validated against `ALLOWED_FLAG_PATTERNS` (e.g. `--porcelain=v1`, `--unified=3`, `-u`, `--cached`, `--oneline`, `-n\d+`, `--show-current`, `--`). Any unallowlisted option (e.g. `-o`, `--output`, `--exec`, `--upload-pack`, `-D`) is immediately rejected with an `AuthorizationError`.

### C. Revision & Path Safety
- Non-flag arguments (revisions, commit SHAs, file paths) are strictly forbidden from starting with `-` to ensure they cannot be interpreted by Git as options or flags.
- Revisions are validated against `SAFE_REVISION_OR_ARG_REGEX` (`^[a-zA-Z0-9_./~^@:+-]+$`).
- Path separation syntax (`--`) is preferred and enforced where revisions and filepaths are passed.

### D. Resource Bounding & Timeouts
- All Git operations have a hard 10-second timeout.
- Maximum stdout buffer is capped at 10 MB to prevent memory exhaustion from massive diffs.
