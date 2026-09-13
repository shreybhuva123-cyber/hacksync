/**
 * Git Safety Boundary & Sandbox Confinement — HackSync Phase 3
 * Enforces strict read-only execution, project path confinement, and argument whitelisting.
 * Completely blocks git push, commit, checkout, reset, clean, merge, rebase, and arbitrary commands.
 */

import { resolve, normalize, isAbsolute } from "node:path";
import { realpathSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AuthorizationError } from "@/lib/errors";

const execFileAsync = promisify(execFile);

export interface SafeGitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitSafety {
  // Fixed allowlist of read-only subcommands
  private static readonly ALLOWED_SUBCOMMANDS = new Set([
    "status",
    "diff",
    "log",
    "branch",
    "rev-parse",
  ]);

  // Forbidden mutating subcommands and flags
  private static readonly FORBIDDEN_OPERATIONS = new Set([
    "push",
    "commit",
    "checkout",
    "reset",
    "clean",
    "merge",
    "rebase",
    "apply",
    "config",
    "remote",
    "fetch",
    "pull",
    "tag",
    "cherry-pick",
    "revert",
    "rm",
    "mv",
    "init",
    "clone",
  ]);

  // Approved options and flags starting with '-'
  private static readonly ALLOWED_FLAG_PATTERNS: RegExp[] = [
    /^--porcelain(?:=v[12])?$/,
    /^-u(?:normal|all|no)?$/,
    /^-s$/,
    /^--short$/,
    /^-b$/,
    /^--branch$/,
    /^--unified=\d+$/,
    /^-U\d*$/,
    /^-u$/,
    /^-p$/,
    /^--cached$/,
    /^--staged$/,
    /^--stat$/,
    /^--name-only$/,
    /^--name-status$/,
    /^--oneline$/,
    /^-n\d*$/,
    /^--max-count=\d+$/,
    /^--format=[a-zA-Z0-9_%|\-:\x1f]+$/,
    /^--show-current$/,
    /^--verify$/,
    /^--$/,
  ];

  private static readonly SAFE_REVISION_OR_ARG_REGEX = /^[a-zA-Z0-9_./~^@:+-]+$/;

  /**
   * Resolves and validates that a repository path is confined to the authorized project directory.
   * Enforces symlink resolution using realpath to prevent filesystem breakout.
   */
  static validateProjectRepoPath(authorizedProjectRoot: string, requestedPath?: string): string {
    if (!authorizedProjectRoot || authorizedProjectRoot.trim() === "") {
      throw new AuthorizationError("[GitSafety] Authorized project root path is required.");
    }

    const canonicalRoot = normalize(resolve(authorizedProjectRoot));
    let realRoot = canonicalRoot;
    if (existsSync(canonicalRoot)) {
      try {
        realRoot = normalize(realpathSync(canonicalRoot));
      } catch {
        realRoot = canonicalRoot;
      }
    }

    // If requested path is supplied, it must resolve within canonicalRoot and realRoot
    if (requestedPath && requestedPath.trim() !== "") {
      const trimmed = requestedPath.trim();

      // Cross-platform alien absolute path detection:
      // A Windows drive path (e.g. C:\...) on POSIX is outside POSIX root
      if (process.platform !== "win32" && /^[a-zA-Z]:[\\/]/.test(trimmed)) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal / cross-project escape prevented. Target '${requestedPath}' is outside authorized root '${authorizedProjectRoot}'.`,
        );
      }

      // A POSIX root path (e.g. /etc/...) on Windows is outside Windows root
      if (process.platform === "win32" && (trimmed.startsWith("/") || trimmed.startsWith("\\\\"))) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal / cross-project escape prevented. Target '${requestedPath}' is outside authorized root '${authorizedProjectRoot}'.`,
        );
      }

      const canonicalRequested = isAbsolute(trimmed)
        ? normalize(resolve(trimmed))
        : normalize(resolve(canonicalRoot, trimmed));

      const sep = process.platform === "win32" ? "\\" : "/";
      const rootWithSep = canonicalRoot.endsWith(sep) ? canonicalRoot : canonicalRoot + sep;

      // 1. Textual path prefix check (exact match or proper subpath)
      const isExactMatch = canonicalRequested.toLowerCase() === canonicalRoot.toLowerCase();
      const isSubpath = canonicalRequested.toLowerCase().startsWith(rootWithSep.toLowerCase());

      if (!isExactMatch && !isSubpath) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal / cross-project escape prevented. Target '${requestedPath}' is outside authorized root '${authorizedProjectRoot}'.`,
        );
      }

      // 2. Realpath symlink resolution check
      let realRequested = canonicalRequested;
      if (existsSync(canonicalRequested)) {
        try {
          realRequested = normalize(realpathSync(canonicalRequested));
        } catch {
          realRequested = canonicalRequested;
        }
      }

      const realRootWithSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
      const isRealExactMatch = realRequested.toLowerCase() === realRoot.toLowerCase();
      const isRealSubpath = realRequested.toLowerCase().startsWith(realRootWithSep.toLowerCase());

      if (!isRealExactMatch && !isRealSubpath) {
        throw new AuthorizationError(
          `[GitSafety] Symlink traversal escape prevented. Real target '${realRequested}' resolves outside authorized root '${realRoot}'.`,
        );
      }

      return canonicalRequested;
    }

    return canonicalRoot;
  }

  /**
   * Validates structured Git CLI arguments against the strict read-only allowlist.
   * Every single argument is independently validated; unexpected flags or revisions starting with '-' are rejected.
   */
  static validateGitArgs(args: string[]): string[] {
    if (!args || args.length === 0) {
      throw new AuthorizationError("[GitSafety] No Git arguments provided.");
    }

    const subcommand = args[0]?.toLowerCase().trim();
    if (!subcommand) {
      throw new AuthorizationError("[GitSafety] Missing Git subcommand.");
    }

    // 1. Check against forbidden mutating operations
    if (this.FORBIDDEN_OPERATIONS.has(subcommand)) {
      throw new AuthorizationError(
        `[GitSafety] Operation 'git ${subcommand}' is strictly forbidden. HackSync Phase 3 is exclusively READ-ONLY.`,
      );
    }

    // 2. Check against allowed read-only subcommands
    if (!this.ALLOWED_SUBCOMMANDS.has(subcommand)) {
      throw new AuthorizationError(
        `[GitSafety] Subcommand 'git ${subcommand}' is not in the approved read-only Git allowlist.`,
      );
    }

    // 3. Inspect every parameter independently
    let pastDashDash = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]!;

      // Reject dangerous shell metacharacters
      if (/[;&|`$<>]/.test(arg)) {
        throw new AuthorizationError(
          `[GitSafety] Disallowed metacharacters detected in Git argument '${arg}'.`,
        );
      }

      // Reject path traversal tokens in file filters or revisions
      if (arg.includes("../") || arg.includes("..\\")) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal sequence detected in Git argument '${arg}'.`,
        );
      }

      if (arg === "--") {
        pastDashDash = true;
        continue;
      }

      if (pastDashDash) {
        // Path argument after '--'
        if (arg.startsWith("-")) {
          throw new AuthorizationError(
            `[GitSafety] Path argument cannot begin with '-': '${arg}'.`,
          );
        }
        continue;
      }

      // Arguments before '--'
      if (arg.startsWith("-")) {
        // Option/flag argument: must strictly match approved flag patterns
        const isAllowedFlag = this.ALLOWED_FLAG_PATTERNS.some((pattern) => pattern.test(arg));
        if (!isAllowedFlag) {
          throw new AuthorizationError(
            `[GitSafety] Disallowed Git option '${arg}'. All options must be strictly allowlisted.`,
          );
        }
      } else {
        // Non-option argument: revision, commit, branch, or tag
        // Ensure safe revision syntax (cannot begin with -)
        if (!this.SAFE_REVISION_OR_ARG_REGEX.test(arg)) {
          throw new AuthorizationError(
            `[GitSafety] Malicious or invalid Git revision/argument: '${arg}'.`,
          );
        }
      }
    }

    return args;
  }

  /**
   * Safely executes a read-only Git CLI command without shell interpolation.
   */
  static async runSafeGit(
    repoPath: string,
    args: string[],
    options?: { timeoutMs?: number | undefined },
  ): Promise<SafeGitResult> {
    const validatedArgs = this.validateGitArgs(args);
    const timeout = options?.timeoutMs || 5000;

    try {
      const { stdout, stderr } = await execFileAsync("git", validatedArgs, {
        cwd: repoPath,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB limit
        windowsHide: true,
      });

      return {
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
      };
    } catch (err: any) {
      // If git exited with non-zero or error
      return {
        stdout: err?.stdout || "",
        stderr: err?.stderr || err?.message || String(err),
        exitCode: err?.code || 1,
      };
    }
  }
}
