import { describe, it, expect } from "bun:test";
import { GitSafety } from "@/lib/hacksync/git/git-safety";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { AuthorizationError } from "@/lib/errors";

describe("Phase 8.10: Git Read-Only Confinement & Mutation Defense", () => {
  const currentRepoRoot = process.cwd();

  describe("1. Direct Git Command & Subcommand Boundary Defense", () => {
    it("should strictly reject 'git push' through any argument combination", () => {
      expect(() => GitSafety.validateGitArgs(["push", "origin", "main"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["push", "--force"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["push"])).toThrow(AuthorizationError);
    });

    it("should strictly reject 'git commit' through any argument combination", () => {
      expect(() => GitSafety.validateGitArgs(["commit", "-m", "automated commit"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["commit", "--amend"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["commit"])).toThrow(AuthorizationError);
    });

    it("should strictly reject 'git checkout' and 'git switch'", () => {
      expect(() => GitSafety.validateGitArgs(["checkout", "-b", "evil-branch"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["checkout", "main"])).toThrow(AuthorizationError);
    });

    it("should strictly reject destructive Git operations (reset, clean, merge, rebase, rm, mv)", () => {
      const forbiddenSubcommands = [
        ["reset", "--hard", "HEAD~1"],
        ["clean", "-fdx"],
        ["merge", "origin/feature"],
        ["rebase", "origin/main"],
        ["revert", "HEAD"],
        ["rm", "important.ts"],
        ["mv", "src", "dest"],
        ["tag", "v1.0.0"],
        ["remote", "add", "attacker", "https://attacker.com/repo.git"],
      ];

      for (const args of forbiddenSubcommands) {
        expect(() => GitSafety.validateGitArgs(args)).toThrow(AuthorizationError);
      }
    });

    it("should reject branch deletion attempts (git branch -D or -d)", () => {
      // Deletion flag is not in the approved flag whitelist
      expect(() => GitSafety.validateGitArgs(["branch", "-D", "main"])).toThrow(AuthorizationError);
      expect(() => GitSafety.validateGitArgs(["branch", "-d", "staging"])).toThrow(AuthorizationError);
    });
  });

  describe("2. Legitimate Read-Only Git Operations Allowlist", () => {
    it("should allow safe 'status' operations", () => {
      const args = GitSafety.validateGitArgs(["status", "--porcelain"]);
      expect(args).toEqual(["status", "--porcelain"]);
    });

    it("should allow safe 'diff' operations with approved flags", () => {
      const args = GitSafety.validateGitArgs(["diff", "--stat"]);
      expect(args).toEqual(["diff", "--stat"]);

      const args2 = GitSafety.validateGitArgs(["diff", "--name-only"]);
      expect(args2).toEqual(["diff", "--name-only"]);
    });

    it("should allow safe 'log' operations with approved formatting", () => {
      const args = GitSafety.validateGitArgs(["log", "--oneline", "-n10"]);
      expect(args).toEqual(["log", "--oneline", "-n10"]);
    });

    it("should allow safe 'branch' listing (read-only without flags)", () => {
      const args = GitSafety.validateGitArgs(["branch", "--show-current"]);
      expect(args).toEqual(["branch", "--show-current"]);
    });
  });

  describe("3. Safe Execution in Sandbox Workspace", () => {
    it("should execute read-only git status on current workspace successfully", async () => {
      const result = await GitSafety.runSafeGit(currentRepoRoot, ["status", "--porcelain"]);
      expect(result.exitCode).toBe(0);
      expect(typeof result.stdout).toBe("string");
    });

    it("should block execution before spawning process if mutating subcommand is attempted", async () => {
      let executionError: any = null;
      try {
        await GitSafety.runSafeGit(currentRepoRoot, ["push", "origin", "main"]);
      } catch (err: any) {
        executionError = err;
      }

      expect(executionError).not.toBeNull();
      expect(executionError.message).toContain("strictly forbidden");
    });
  });

  describe("4. AI Tool Confinement Against Git Mutation", () => {
    it("should verify that AI tool executor cannot execute git push or commit tools", async () => {
      const projectId = "proj-git-tool-test";
      const userId = "usr-lead";
      const { registerTestMembership, clearTestMemberships } = await import("@/lib/security/tenant-verifier");
      clearTestMemberships();
      registerTestMembership(projectId, userId, "owner");

      const graph = new ProjectKnowledgeGraph(projectId);
      const executor = new AIToolExecutor(
        graph,
        { userId, projectId, role: "owner", requestId: "req-git-001" },
        "req-git-001",
      );

      // Prohibited Git write tools
      const mutatingGitTools = ["git_push", "git_commit", "git_reset", "git_checkout"];

      for (const toolName of mutatingGitTools) {
        const result = await executor.execute(toolName, {});
        expect(result.success).toBe(false);
        expect(result.error).toContain("Unknown AI tool");
      }
    });
  });
});
