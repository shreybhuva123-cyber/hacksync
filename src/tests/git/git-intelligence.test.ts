/**
 * HackSync Phase 3: Git Intelligence Test Suite
 * Tests Git safety boundaries, path confinement, diff parsing, porcelain status parsing,
 * AST symbol correlation, blast radius/regression impact, and project isolation.
 */

import { describe, it, expect } from "bun:test";
import { GitSafety } from "@/lib/hacksync/git/git-safety";
import { DiffParser } from "@/lib/hacksync/git/diff-parser";
import { GitStatusManager } from "@/lib/hacksync/git/git-status";
import { GitDiffEngine } from "@/lib/hacksync/git/git-diff";
import { GitLogManager } from "@/lib/hacksync/git/git-log";
import { ChangedSymbolsDetector } from "@/lib/hacksync/git/changed-symbols";
import { GitImpactEngine } from "@/lib/hacksync/git/git-impact";
import { GitAnalyzer } from "@/lib/hacksync/git/git-analyzer";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { AuthorizationError } from "@/lib/errors";
import { resolve } from "node:path";

describe("HackSync Phase 3: Git Intelligence", () => {
  const authorizedRoot = resolve(process.cwd());

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Git Safety Boundary & Sandbox Confinement
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Git Safety & Sandbox Confinement", () => {
    it("should strictly REJECT mutating Git commands", () => {
      const mutatingCommands = [
        ["push", "origin", "main"],
        ["commit", "-m", "unauthorized commit"],
        ["checkout", "feature-branch"],
        ["reset", "--hard", "HEAD~1"],
        ["clean", "-fd"],
        ["merge", "origin/dev"],
        ["rebase", "main"],
        ["apply", "patch.diff"],
        ["rm", "-rf", "src/"],
      ];

      for (const cmd of mutatingCommands) {
        expect(() => {
          GitSafety.validateGitArgs(cmd);
        }).toThrow(AuthorizationError);
      }
    });

    it("should strictly REJECT unauthorized subcommands not in allowlist", () => {
      const disallowed = [
        ["config", "--list"],
        ["remote", "-v"],
        ["fetch", "origin"],
        ["pull", "origin", "main"],
        ["clone", "https://example.com/repo.git"],
      ];

      for (const cmd of disallowed) {
        expect(() => {
          GitSafety.validateGitArgs(cmd);
        }).toThrow(AuthorizationError);
      }
    });

    it("should ALLOW approved read-only Git subcommands", () => {
      const allowed = [
        ["status", "--porcelain=v1"],
        ["diff", "HEAD~1", "HEAD"],
        ["log", "-n", "10", "--oneline"],
        ["branch", "--show-current"],
        ["rev-parse", "HEAD"],
      ];

      for (const cmd of allowed) {
        const validated = GitSafety.validateGitArgs(cmd);
        expect(validated).toEqual(cmd);
      }
    });

    it("should REJECT path traversal attempts outside authorized project root", () => {
      expect(() => {
        GitSafety.validateProjectRepoPath(authorizedRoot, "../../../secret-system-folder");
      }).toThrow(AuthorizationError);

      expect(() => {
        GitSafety.validateProjectRepoPath(authorizedRoot, "C:\\Windows\\System32");
      }).toThrow(AuthorizationError);
    });

    it("should ACCEPT paths strictly within authorized project root", () => {
      const subpath = resolve(authorizedRoot, "src/lib/hacksync");
      const valid = GitSafety.validateProjectRepoPath(authorizedRoot, subpath);
      expect(valid).toBe(subpath);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Unified Diff Parser
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Unified Diff Parser", () => {
    it("should parse modified file diff with additions and deletions", () => {
      const sampleDiff = `diff --git a/src/services/user.ts b/src/services/user.ts
index abc1234..def5678 100644
--- a/src/services/user.ts
+++ b/src/services/user.ts
@@ -10,6 +10,8 @@ export function getUserById(id: string) {
   const user = db.find(id);
+  // Added security logging
+  logger.info("User requested: " + id);
   return user;
 }
`;
      const parsed = DiffParser.parse(sampleDiff);
      expect(parsed.length).toBe(1);
      const file = parsed[0]!;
      expect(file.oldPath).toBe("src/services/user.ts");
      expect(file.newPath).toBe("src/services/user.ts");
      expect(file.changeType).toBe("modified");
      expect(file.additions).toBe(2);
      expect(file.deletions).toBe(0);
      expect(file.hunks.length).toBe(1);
      expect(file.hunks[0]!.oldStart).toBe(10);
      expect(file.hunks[0]!.newStart).toBe(10);
    });

    it("should parse newly added files", () => {
      const newFileDiff = `diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/auth/jwt.ts
@@ -0,0 +1,5 @@
+import jwt from "jsonwebtoken";
+export function signToken(payload: object) {
+  return jwt.sign(payload, process.env.JWT_SECRET!);
+}
`;
      const parsed = DiffParser.parse(newFileDiff);
      expect(parsed.length).toBe(1);
      const file = parsed[0]!;
      expect(file.changeType).toBe("added");
      expect(file.newPath).toBe("src/auth/jwt.ts");
      expect(file.additions).toBe(4);
    });

    it("should parse deleted files", () => {
      const deletedFileDiff = `diff --git a/src/legacy/old-auth.ts b/src/legacy/old-auth.ts
deleted file mode 100644
index 1234567..0000000
--- a/src/legacy/old-auth.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldLogin() {
-  return true;
-}
`;
      const parsed = DiffParser.parse(deletedFileDiff);
      expect(parsed.length).toBe(1);
      const file = parsed[0]!;
      expect(file.changeType).toBe("deleted");
      expect(file.oldPath).toBe("src/legacy/old-auth.ts");
      expect(file.deletions).toBe(3);
    });

    it("should parse binary file markers without failing", () => {
      const binaryDiff = `diff --git a/assets/logo.png b/assets/logo.png
index 1234567..89abcdef 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;
      const parsed = DiffParser.parse(binaryDiff);
      expect(parsed.length).toBe(1);
      const file = parsed[0]!;
      expect(file.binary).toBe(true);
      expect(file.changeType).toBe("binary");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Git Status Manager (Porcelain v1 Parsing & Workspace Fallback)
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Git Status Manager", () => {
    it("should parse porcelain v1 format into staged, unstaged, and untracked sets", () => {
      const porcelainOutput = `M  src/auth/session.ts
 M src/components/Header.tsx
?? src/tests/new-test.ts
A  src/api/routes.ts
D  src/deprecated/old.ts
`;
      const status = GitStatusManager.parsePorcelainOutput(porcelainOutput, "main");
      expect(status.branch).toBe("main");

      const stagedPaths = status.staged.map((s) => s.path);
      const unstagedPaths = status.unstaged.map((s) => s.path);

      expect(stagedPaths).toContain("src/auth/session.ts");
      expect(stagedPaths).toContain("src/api/routes.ts");
      expect(stagedPaths).toContain("src/deprecated/old.ts");
      expect(unstagedPaths).toContain("src/components/Header.tsx");
      expect(status.untracked).toContain("src/tests/new-test.ts");
      expect(status.isClean).toBe(false);
    });

    it("should correctly detect clean repository state", () => {
      const cleanPorcelain = "";
      const status = GitStatusManager.parsePorcelainOutput(cleanPorcelain, "main");
      expect(status.branch).toBe("main");
      expect(status.isClean).toBe(true);
      expect(status.staged.length).toBe(0);
      expect(status.unstaged.length).toBe(0);
      expect(status.untracked.length).toBe(0);
    });

    it("should support workspace fallback mode for in-memory files", () => {
      const mockWorkspace = {
        project: { id: "proj-virt", name: "Virtual", default_branch: "main" },
        codeNodes: [
          { path: "src/existing.ts", kind: "file", content: "export const x = 1;" },
        ],
      };
      const memberFiles = [
        { relative_path: "src/new-file.ts", content: "export const y = 2;" },
        { relative_path: "src/existing.ts", content: "export const x = 2;" },
      ];

      const fallbackStatus = GitStatusManager.getStatusFromWorkspace(
        mockWorkspace as any,
        memberFiles as any,
      );
      expect(fallbackStatus.isClean).toBe(false);
      expect(fallbackStatus.untracked).toContain("src/new-file.ts");
      expect(fallbackStatus.unstaged.some((u) => u.path === "src/existing.ts")).toBe(true);
      expect(fallbackStatus.branch).toBe("main");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Changed AST Symbols Correlation
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Changed AST Symbols Correlation", () => {
    it("should correlate diff hunks with AST symbols in the knowledge graph", () => {
      const graph = new ProjectKnowledgeGraph("proj-git-ast");
      const fileContent = `
export function computeTotal(items: number[]) {
  return items.reduce((a, b) => a + b, 0);
}

export class OrderService {
  processOrder(orderId: string) {
    return { status: "processed", orderId };
  }
}
`;
      graph.indexFile("src/services/order.ts", fileContent);

      // Diff modifies lines 8-10 (inside OrderService.processOrder)
      const diffText = `diff --git a/src/services/order.ts b/src/services/order.ts
--- a/src/services/order.ts
+++ b/src/services/order.ts
@@ -7,4 +7,6 @@ export class OrderService {
   processOrder(orderId: string) {
+    // Logging
+    console.log("Order processed");
     return { status: "processed", orderId };
   }
`;
      const fileDiffs = DiffParser.parse(diffText);
      const changedSymbols = ChangedSymbolsDetector.detectChangedSymbols(fileDiffs, graph);

      expect(changedSymbols.length).toBeGreaterThanOrEqual(1);
      const matched = changedSymbols.find((s) => s.symbolName === "processOrder" || s.symbolName === "OrderService");
      expect(matched).toBeDefined();
      expect(matched?.filePath).toBe("src/services/order.ts");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Git Impact Engine & Blast Radius Scoring
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Git Impact Engine & Blast Radius", () => {
    it("should compute downstream dependents, blast radius, and detect security-sensitive files", () => {
      const graph = new ProjectKnowledgeGraph("proj-git-impact");

      // Dependency: auth-service is imported by user-controller and payment-controller
      graph.indexFile("src/auth/auth-service.ts", `
        export function verifyAuthToken(token: string) {
          return { userId: "123" };
        }
      `);

      graph.indexFile("src/controllers/user-controller.ts", `
        import { verifyAuthToken } from "../auth/auth-service";
        export function handleUser(req, res) {
          return verifyAuthToken(req.headers.token);
        }
      `);

      graph.indexFile("src/controllers/payment-controller.ts", `
        import { verifyAuthToken } from "../auth/auth-service";
        export function handlePayment(req, res) {
          return verifyAuthToken(req.headers.token);
        }
      `);

      const diffText = `diff --git a/src/auth/auth-service.ts b/src/auth/auth-service.ts
--- a/src/auth/auth-service.ts
+++ b/src/auth/auth-service.ts
@@ -2,3 +2,4 @@
         export function verifyAuthToken(token: string) {
+          // Modified token verification
           return { userId: "123" };
`;
      const fileDiffs = DiffParser.parse(diffText);
      const changedSymbols = ChangedSymbolsDetector.detectChangedSymbols(fileDiffs, graph);

      const impact = GitImpactEngine.analyze({
        fileDiffs,
        changedSymbols,
        graph,
      });

      expect(impact.changedFilesCount).toBe(1);
      expect(impact.directDependents).toContain("src/controllers/user-controller.ts");
      expect(impact.directDependents).toContain("src/controllers/payment-controller.ts");
      expect(impact.securitySensitiveChanges.length).toBeGreaterThan(0);
      expect(impact.securitySensitiveChanges[0]!.securityCategory).toBe("authentication");
      expect(impact.regressionRisk.blastRadiusScore).toBeGreaterThan(0);
      expect(impact.disclaimer).toBe(GitImpactEngine.DISCLAIMER);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Project Confinement & Tenant Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Project Confinement & Multi-Tenant Isolation", () => {
    it("should isolate Git operations between different project contexts", () => {
      const projectARoot = resolve(authorizedRoot, "workspace-a");
      const projectBPath = resolve(authorizedRoot, "workspace-b/repo");

      // Validates that Project A cannot access Project B's repository directory
      expect(() => {
        GitSafety.validateProjectRepoPath(projectARoot, projectBPath);
      }).toThrow(AuthorizationError);

      // Verify that status queries for two workspaces evaluate independently
      const wsA = {
        project: { id: "proj-tenant-a", name: "Tenant A", default_branch: "main" },
        codeNodes: [{ path: "file-a.ts", kind: "file", content: "const a = 1;" }],
      };
      const wsB = {
        project: { id: "proj-tenant-b", name: "Tenant B", default_branch: "staging" },
        codeNodes: [{ path: "file-b.ts", kind: "file", content: "const b = 2;" }],
      };

      const statusA = GitAnalyzer.getStatus(wsA as any, [{ relative_path: "file-a.ts", content: "const a = 99;" }] as any);
      const statusB = GitAnalyzer.getStatus(wsB as any, []);

      expect(statusA.isClean).toBe(false);
      expect(statusA.branch).toBe("main");
      expect(statusB.isClean).toBe(true);
      expect(statusB.branch).toBe("staging");
    });
  });
});
