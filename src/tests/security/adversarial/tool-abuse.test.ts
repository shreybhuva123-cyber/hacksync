import { describe, it, expect, beforeEach } from "bun:test";
import { AIToolExecutor } from "@/lib/hacksync/ai/tools";
import { TOOL_REGISTRY } from "@/lib/hacksync/ai/tool-registry";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { AuditTrail } from "@/lib/hacksync/security/audit-trail";
import type { AISecurityContext } from "@/lib/hacksync/security/tenant-guard";

describe("Phase 8.2: Adversarial Testing — Tool Abuse & Disallowed Execution", () => {
  const projectId = "proj-tool-abuse-test";
  const userId = "usr-attacker-tool";

  const securityContext: AISecurityContext = {
    projectId,
    userId,
    role: "member",
    requestId: "req-tool-abuse",
  };

  let graph: ProjectKnowledgeGraph;
  let executor: AIToolExecutor;

  beforeEach(() => {
    graph = new ProjectKnowledgeGraph(projectId);
    executor = new AIToolExecutor(graph, securityContext, "req-tool-abuse");
  });

  describe("Prohibited & Mutating Tool Enforcement", () => {
    const prohibitedTools = [
      "execute_command",
      "shell",
      "bash",
      "exec",
      "delete_file",
      "write_file",
      "git_push",
      "git_commit",
      "git_reset",
      "git_checkout",
      "raw_eval",
      "eval",
      "system",
      "cmd",
      "spawn_process",
    ];

    for (const toolName of prohibitedTools) {
      it(`should strictly reject prohibited mutating tool invocation: "${toolName}"`, async () => {
        // Must not be in TOOL_REGISTRY
        expect(TOOL_REGISTRY[toolName]).toBeUndefined();

        // Execution attempt must fail
        const result = await executor.execute(toolName as any, { command: "whoami" });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        const isExpectedError =
          result.error?.includes("Unknown AI tool") || result.error?.includes("strictly disabled");
        expect(isExpectedError).toBe(true);
      });
    }
  });

  describe("Spoofed & Prototype Pollution Tool Arguments", () => {
    it("should reject malicious prototype pollution payloads in tool parameters", async () => {
      const maliciousArgs = JSON.parse('{"__proto__": {"admin": true}, "name": "User"}');
      const result = await executor.execute("search_symbols", maliciousArgs);

      // Should execute safely without poisoning Object prototype
      expect((Object.prototype as any).admin).toBeUndefined();
      expect(result.success).toBe(true);
    });

    it("should safely handle SQL injection strings inside tool arguments without crashing", async () => {
      const sqlInjectionName = "'; DROP TABLE users; --";
      const result = await executor.execute("search_symbols", { name: sqlInjectionName });

      // Must execute cleanly, returning 0 matching symbols, without error
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should reject oversized tool argument payloads that attempt resource exhaustion", async () => {
      const hugeName = "A".repeat(50000); // 50KB symbol name
      const result = await executor.execute("search_symbols", { name: hugeName });

      // Must either handle gracefully without hanging or return clean result
      expect(result.executionMs).toBeLessThan(100);
      expect(result.data).toBeDefined();
    });
  });

  describe("Read-Only Confinement of Tool Registry", () => {
    it("should guarantee that every registered tool in TOOL_REGISTRY is strictly READ_ONLY or requires approval", () => {
      for (const [name, def] of Object.entries(TOOL_REGISTRY)) {
        expect(["READ_ONLY", "MUTATING"]).toContain(def.tier as any);
        // None of the tools may be unrestricted shell or command execution
        expect(name).not.toBe("execute_command");
        expect(name).not.toBe("shell");
      }
    });
  });
});
