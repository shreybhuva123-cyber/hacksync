/**
 * Safe Test Runner — HackSync Phase 4
 * Executes allowlisted test commands with structured arguments via execFile.
 * Prohibits shell access, dangerous parameters, and redacts all secrets.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { AuthorizationError } from "@/lib/errors";
import { SecretRedactor } from "../security/secret-redactor";
import type { TestRun, TestFailure, TestRunnerOptions } from "./test-types";

const execFileAsync = promisify(execFile);

export class TestRunner {
  private static readonly ALLOWED_COMMANDS = new Set([
    "bun test",
    "bunx vitest",
    "bunx vitest run",
    "bunx jest",
    "pytest",
    "python -m pytest",
    "python3 -m pytest",
    "playwright test",
    "cypress run",
  ]);

  private static readonly DANGEROUS_PATTERNS = [
    /[;&|`$<>]/,
    /\$\(/,
    /\.\.\//,
    /\.\.\\/,
  ];

  private static readonly FORBIDDEN_TOKENS = [
    "npm install",
    "npm i",
    "npm add",
    "bun add",
    "bun install",
    "pip install",
    "curl",
    "wget",
    "ssh",
    "scp",
    "docker",
    "sudo",
    "rm",
    "del",
    "git push",
    "git reset",
    "git checkout",
    "git commit",
    "git merge",
  ];

  /**
   * Validates and sanitizes a requested test command and its arguments.
   */
  static validateCommand(baseCommand: string, extraArgs: string[] = []): { executable: string; args: string[] } {
    const trimmedBase = baseCommand.trim();

    // 1. Check if base command matches allowlist
    const isAllowed = Array.from(this.ALLOWED_COMMANDS).some(
      (cmd) => trimmedBase === cmd || trimmedBase.startsWith(`${cmd} `),
    );

    if (!isAllowed) {
      throw new AuthorizationError(
        `[TestRunner] Test command '${baseCommand}' is not in the approved allowlist. Allowed runners: bun test, vitest, jest, pytest, playwright, cypress.`,
      );
    }

    // 2. Reject forbidden package install or network/destructive tools
    const combinedStr = `${baseCommand} ${extraArgs.join(" ")}`.toLowerCase();
    for (const forbidden of this.FORBIDDEN_TOKENS) {
      if (combinedStr.includes(forbidden)) {
        throw new AuthorizationError(
          `[TestRunner] Forbidden operation '${forbidden}' detected in test command.`,
        );
      }
    }

    // 3. Reject shell injection metacharacters and directory traversal
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(baseCommand)) {
        throw new AuthorizationError(
          `[TestRunner] Shell metacharacter or traversal pattern detected in test command: '${baseCommand}'.`,
        );
      }
      for (const arg of extraArgs) {
        if (pattern.test(arg)) {
          throw new AuthorizationError(
            `[TestRunner] Shell metacharacter or traversal pattern detected in test argument: '${arg}'.`,
          );
        }
      }
    }

    // 4. Inspect arguments for dangerous flags altering execution or output redirection
    for (const arg of extraArgs) {
      if (
        arg.startsWith("-o") ||
        arg.startsWith("--output") ||
        arg.startsWith("--exec") ||
        arg.startsWith("--upload-pack") ||
        arg.startsWith("--config=") ||
        arg === "-D"
      ) {
        throw new AuthorizationError(
          `[TestRunner] Dangerous test runner option '${arg}' is prohibited.`,
        );
      }
    }

    // 5. Parse executable and base arguments
    const parts = trimmedBase.split(/\s+/);
    const executable = parts[0]!;
    const baseArgs = parts.slice(1);

    return {
      executable,
      args: [...baseArgs, ...extraArgs],
    };
  }

  /**
   * Executes a safe, allowlisted test suite in the specified workspace directory.
   */
  static async run(params: {
    projectId: string;
    command: string;
    cwd: string;
    extraArgs?: string[] | undefined;
    options?: TestRunnerOptions | undefined;
  }): Promise<TestRun> {
    const startedAt = new Date().toISOString();
    const timeoutMs = params.options?.timeoutMs || 15000;
    const maxBuffer = params.options?.maxBufferBytes || 5 * 1024 * 1024; // 5 MB

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { executable, args } = this.validateCommand(params.command, params.extraArgs || []);

    let rawStdout = "";
    let rawStderr = "";
    let exitCode: number | undefined = 0;
    let status: TestRun["status"] = "passed";

    try {
      const result = await execFileAsync(executable, args, {
        cwd: params.cwd,
        timeout: timeoutMs,
        maxBuffer,
        shell: false, // CRITICAL: strictly shell-free process spawning
        env: {
          ...process.env,
          // Strip sensitive production tokens from child process environment
          AWS_SECRET_ACCESS_KEY: undefined,
          STRIPE_SECRET_KEY: undefined,
          SUPABASE_SERVICE_ROLE_KEY: undefined,
          DATABASE_URL: undefined,
          NODE_ENV: "test",
          CI: "true",
        },
      });

      rawStdout = result.stdout || "";
      rawStderr = result.stderr || "";
    } catch (err: any) {
      exitCode = typeof err.code === "number" ? err.code : 1;
      rawStdout = err.stdout || "";
      rawStderr = err.stderr || err.message || "";

      if (err.killed && err.signal === "SIGTERM") {
        status = "timeout";
      } else {
        status = "failed";
      }
    }

    const finishedAt = new Date().toISOString();

    // Redact all sensitive tokens from outputs
    const stdout = SecretRedactor.redact(rawStdout).redactedText;
    const stderr = SecretRedactor.redact(rawStderr).redactedText;

    // Parse summary and failures from stdout/stderr
    const { summary, failures } = this.parseTestOutput(stdout, stderr);

    if (status === "passed" && (failures.length > 0 || (summary.failed > 0))) {
      status = "failed";
    }

    return {
      id: runId,
      projectId: params.projectId,
      framework: executable,
      command: `${executable} ${args.join(" ")}`,
      startedAt,
      finishedAt,
      status,
      exitCode,
      summary,
      stdout,
      stderr,
      failures,
      confidence: 0.95,
    };
  }

  /**
   * Parses test framework outputs (bun test, vitest, jest, pytest) into structured summaries.
   */
  static parseTestOutput(stdout: string, stderr: string): {
    summary: { total: number; passed: number; failed: number; skipped: number };
    failures: TestFailure[];
  } {
    const combined = SecretRedactor.redact(`${stdout}\n${stderr}`).redactedText;
    const failures: TestFailure[] = [];

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // 1. Bun test parsing: "X pass\nY fail"
    const bunPassMatch = combined.match(/(\d+)\s+pass/i);
    const bunFailMatch = combined.match(/(\d+)\s+fail/i);
    if (bunPassMatch && bunPassMatch[1]) passed = parseInt(bunPassMatch[1], 10);
    if (bunFailMatch && bunFailMatch[1]) failed = parseInt(bunFailMatch[1], 10);

    // 2. Vitest / Jest parsing: "Tests: X passed, Y failed, Z total"
    const jestTestsMatch = combined.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(\d+)\s+total/i);
    if (jestTestsMatch) {
      if (jestTestsMatch[1]) failed = parseInt(jestTestsMatch[1], 10);
      if (jestTestsMatch[2]) passed = parseInt(jestTestsMatch[2], 10);
      if (jestTestsMatch[3]) skipped = parseInt(jestTestsMatch[3], 10);
    }

    // 3. Pytest parsing: "X passed, Y failed, Z skipped in 0.5s"
    const pytestMatch = combined.match(/(?:(\d+)\s+passed)?(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?\s+in/i);
    if (pytestMatch) {
      if (pytestMatch[1]) passed = parseInt(pytestMatch[1], 10);
      if (pytestMatch[2]) failed = parseInt(pytestMatch[2], 10);
      if (pytestMatch[3]) skipped = parseInt(pytestMatch[3], 10);
    }

    // 4. Extract individual failure messages
    const failureLines = combined.split("\n").filter((l) => {
      const lower = l.toLowerCase();
      return (
        (lower.includes("fail") || lower.includes("error") || lower.includes("exception")) &&
        !lower.includes("0 fail") &&
        !lower.includes("0 error")
      );
    });

    for (const fl of failureLines.slice(0, 5)) {
      failures.push({
        testName: fl.trim(),
        message: fl.trim(),
        classification: fl.includes("AssertionError")
          ? "assertion"
          : fl.includes("timed out")
            ? "timeout"
            : fl.includes("Cannot find module")
              ? "dependency"
              : "runtime",
      });
    }

    const total = passed + failed + skipped;

    return {
      summary: {
        total: total > 0 ? total : failed > 0 ? failed : 1,
        passed,
        failed,
        skipped,
      },
      failures,
    };
  }
}
