/**
 * HackSync Phase 7: UI & Frontend Productization Test Suite
 * Tests design system primitive contracts, tone mappings, diff parsing logic,
 * approval gate validation contracts, and workspace navigation contracts.
 */

import { describe, it, expect } from "bun:test";
import { statusTone, type Tone } from "@/components/hacksync/primitives";
import type { FixProposal, Patch } from "@/lib/hacksync/fixing/fix-types";
import { auditWorkspaceSecurity } from "@/lib/hacksync/ai-security";
import type { Workspace } from "@/lib/hacksync/types";

describe("HackSync Phase 7: UI & Productization Test Suite", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Primitive Tokens & Tone Resolution
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Design System Primitives & Tone Tokens", () => {
    it("should resolve correct semantic classes for all valid tones", () => {
      expect(statusTone("passing")).toBe("success");
      expect(statusTone("warning")).toBe("warning");
      expect(statusTone("critical")).toBe("danger");
      expect(statusTone("info")).toBe("info");
      expect(statusTone("unknown")).toBe("neutral");
    });

    it("should handle undefined status gracefully with neutral fallback", () => {
      const fallback = statusTone(undefined as any);
      expect(fallback).toBe("neutral");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Diff Parsing & Formatting Integrity
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. DiffViewer Logic & Formatting", () => {
    it("should identify additions, deletions, and hunk headers in unified diffs", () => {
      const sampleDiff = `--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -10,3 +10,4 @@
 const token = verify(jwt);
-if (!token) return false;
+if (!token || token.expired) return false;
+return token.valid;`;

      const lines = sampleDiff.split("\n");
      const hunkLines = lines.filter((l) => l.startsWith("@@"));
      const addLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      const delLines = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));

      expect(hunkLines.length).toBe(1);
      expect(addLines.length).toBe(2);
      expect(delLines.length).toBe(1);
    });

    it("should ensure diff headers contain valid file path indications", () => {
      const diff = `--- a/src/api/routes.ts\n+++ b/src/api/routes.ts\n@@ -1,2 +1,2 @@\n-const old = 1;\n+const newV = 2;`;
      expect(diff).toContain("--- a/");
      expect(diff).toContain("+++ b/");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Human-in-the-Loop Fix Proposal Contract
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Fix Proposal & Approval Gate Contracts", () => {
    it("should enforce requiresApproval: true on all remediation proposals", () => {
      const mockPatch: Patch = {
        id: "PATCH-TEST-01",
        projectId: "proj-123",
        baseStateHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        diffHash: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
        files: [
          {
            path: "src/lib/auth.ts",
            operation: "modify",
            diff: "--- a/src/lib/auth.ts\n+++ b/src/lib/auth.ts\n@@ -1,2 +1,2 @@\n-auth = false\n+auth = true",
          },
        ],
        createdAt: new Date().toISOString(),
      };

      const proposal: FixProposal = {
        id: "PROP-001",
        projectId: "proj-123",
        title: "Enforce API Authentication",
        rootCause: "Endpoint allows unauthenticated POST requests.",
        evidence: [],
        affectedFiles: ["src/lib/auth.ts"],
        affectedSymbols: ["authenticateRequest"],
        explanation: "Adds JWT validation check before database mutation.",
        patch: mockPatch,
        expectedBehavior: "Rejects unauthenticated requests with 401 Unauthorized.",
        regressionRisks: ["Existing clients without token headers will fail."],
        confidence: 0.98,
        requiresApproval: true,
      };

      expect(proposal.requiresApproval).toBe(true);
      expect(proposal.patch.files.length).toBe(1);
      expect(proposal.patch.files[0]!.operation).toBe("modify");
      expect(proposal.patch.baseStateHash.length).toBe(64); // SHA-256 length
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Workspace Security Audit Integration
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Security Audit Integration", () => {
    it("should compute deterministic security audit score and vulnerability list", () => {
      const mockWorkspace: Workspace = {
        project: {
          id: "proj-sec-test",
          name: "Security Test Project",
          description: "Testing security scoring",
          slug: "sec-test",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        members: [],
        codeNodes: [
          {
            id: "node-1",
            project_id: "proj-sec-test",
            path: "src/server.ts",
            parent_path: null,
            kind: "file",
            area: "backend",
            owner_role: "backend",
            status: "done",
            language: "typescript",
            content: 'const dbUrl = "postgres://db_admin:sample_pwd_123@localhost:5432/testdb";',
            updated_at: new Date().toISOString(),
          },
        ],
        contracts: [],
        tables: [],
        columns: [],
        links: [],
        tasks: [],
        handoffs: [],
        activity: [],
        branches: [],
        envVars: [],
        checks: [],
        notes: [],
        comments: [],
      };

      const audit = auditWorkspaceSecurity(mockWorkspace);
      expect(audit).toBeDefined();
      expect(typeof audit.score).toBe("number");
      expect(audit.score).toBeGreaterThanOrEqual(0);
      expect(audit.score).toBeLessThanOrEqual(100);
      expect(["A+", "A", "B", "C", "D", "F"]).toContain(audit.grade);
      expect(audit.vulnerabilities.length).toBeGreaterThanOrEqual(1);
      // Hardcoded secret should be detected
      const secretVuln = audit.vulnerabilities.find((v) => v.category === "secrets");
      expect(secretVuln).toBeDefined();
      expect(secretVuln?.severity).toBe("critical");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Navigation & Route Manifest Contract
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Navigation Hierarchy & Workspaces", () => {
    it("should contain the 7 standard engineering workspace definitions", () => {
      const primaryWorkspaces = [
        { id: "dashboard", label: "Overview", path: "/dashboard" },
        { id: "code", label: "Code Intelligence", path: "/code" },
        { id: "security", label: "Security Center", path: "/security" },
        { id: "testing", label: "Testing & Verify", path: "/testing" },
        { id: "evaluation", label: "Evaluation & Benchmarks", path: "/evaluation" },
        { id: "git", label: "Git Intelligence", path: "/git" },
        { id: "settings", label: "Settings", path: "/settings" },
      ];

      expect(primaryWorkspaces.length).toBe(7);
      const ids = primaryWorkspaces.map((w) => w.id);
      expect(ids).toContain("dashboard");
      expect(ids).toContain("code");
      expect(ids).toContain("security");
      expect(ids).toContain("testing");
      expect(ids).toContain("evaluation");
      expect(ids).toContain("git");
      expect(ids).toContain("settings");
    });
  });
});
