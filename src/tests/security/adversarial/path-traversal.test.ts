import { describe, it, expect } from "bun:test";
import { TenantGuard } from "@/lib/hacksync/security/tenant-guard";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import type { AISecurityContext } from "@/lib/hacksync/security/tenant-guard";

describe("Phase 8.2: Adversarial Testing — Path Traversal & Boundary Escapes", () => {
  const securityContext: AISecurityContext = {
    projectId: "proj-traversal-test",
    userId: "user-attacker",
    role: "member",
    requestId: "req-traversal-attack",
  };

  const traversalPayloads = [
    "../../etc/passwd",
    "../../../var/log/syslog",
    "..\\..\\Windows\\System32\\cmd.exe",
    "..\\..\\Windows\\win.ini",
    "src/../../../secret.env",
    "src/../../.git/config",
    "/etc/shadow",
    "/root/.ssh/id_rsa",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    "D:\\secrets\\api-keys.txt",
    "\\\\attacker.com\\share\\payload.js",
    "//192.168.1.1/smb/leak",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "%2e%2e%5c%2e%2e%5cboot.ini",
    "src/null\0byte.ts",
  ];

  describe("TenantGuard.sanitizeFilePath Confinement", () => {
    for (const payload of traversalPayloads) {
      it(`should strictly reject path traversal vector: "${payload}"`, () => {
        expect(() => {
          TenantGuard.sanitizeFilePath(payload);
        }).toThrow();
      });
    }

    it("should accept valid, properly scoped project-relative paths", () => {
      expect(TenantGuard.sanitizeFilePath("src/index.ts")).toBe("src/index.ts");
      expect(TenantGuard.sanitizeFilePath("src/models/user.ts")).toBe("src/models/user.ts");
      expect(TenantGuard.sanitizeFilePath("package.json")).toBe("package.json");
      expect(TenantGuard.sanitizeFilePath("docs/architecture/ai-security.md")).toBe(
        "docs/architecture/ai-security.md"
      );
    });
  });

  describe("AIToolExecutor Tool Path Confinement", () => {
    it("should block path traversal attempts when executing retrieve_code tool", async () => {
      const graph = new ProjectKnowledgeGraph("proj-traversal-test");
      graph.indexFile("src/legit.ts", "export const legit = true;");

      const executor = new AIToolExecutor(graph, securityContext, "req-traversal-test");

      for (const payload of ["../../etc/passwd", "src/../../secret.env", "C:\\Windows\\System32"]) {
        const result = await executor.execute("retrieve_code", { path: payload });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should block path traversal attempts when executing security_scan tool", async () => {
      const graph = new ProjectKnowledgeGraph("proj-traversal-test");
      const executor = new AIToolExecutor(graph, securityContext, "req-traversal-test");

      const result = await executor.execute("security_scan", { targetFile: "../../etc/shadow" });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
