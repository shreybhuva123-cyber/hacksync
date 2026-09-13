/**
 * Git Safety Boundary & Sandbox Confinement — HackSync Phase 3
 * Enforces strict read-only execution, project path confinement, and argument whitelisting.
 * Completely blocks git push, commit, checkout, reset, clean, merge, rebase, and arbitrary commands.
 */

import { resolve, normalize, isAbsolute } from "node:path";
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

  /**
   * Resolves and validates that a repository path is confined to the authorized project directory.
   */
  static validateProjectRepoPath(authorizedProjectRoot: string, requestedPath?: string): string {
    if (!authorizedProjectRoot || authorizedProjectRoot.trim() === "") {
      throw new AuthorizationError("[GitSafety] Authorized project root path is required.");
    }

    const canonicalRoot = normalize(resolve(authorizedProjectRoot));

    // If requested path is supplied, it must resolve within canonicalRoot
    if (requestedPath && requestedPath.trim() !== "") {
      const canonicalRequested = normalize(resolve(requestedPath));
      if (!canonicalRequested.startsWith(canonicalRoot)) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal / cross-project escape prevented. Target '${requestedPath}' is outside authorized root '${authorizedProjectRoot}'.`,
        );
      }
      return canonicalRequested;
    }

    return canonicalRoot;
  }

  /**
   * Validates structured Git CLI arguments against the strict read-only allowlist.
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

    // 3. Inspect flags and parameters for shell injections or escapes
    for (const arg of args) {
      // Reject dangerous shell metacharacters
      if (/[;&|`$<>]/.test(arg)) {
        throw new AuthorizationError(
          `[GitSafety] Disallowed metacharacters detected in Git argument '${arg}'.`,
        );
      }

      // Reject path traversal tokens in file filters
      if (arg.includes("../") || arg.includes("..\\")) {
        throw new AuthorizationError(
          `[GitSafety] Path traversal sequence detected in Git argument '${arg}'.`,
        );
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
