/**
 * HackSync Performance Benchmark Suite
 * Verifies that core operations meet performance SLAs.
 * Measures: knowledge graph indexing, retrieval, security scanning, CodeSync preview, hash computation.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { computeDiffHash, computeDiffHashSync } from "@/lib/hacksync/ai/approval-gate";
import { PatchGenerator } from "@/lib/hacksync/fixing/patch-generator";

function measureMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureMsAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe("Performance Benchmark Suite", () => {
  beforeEach(() => {
    ProjectIndexManager.clear();
  });

  describe("1. Knowledge Graph Indexing Performance", () => {
    it("should index 50 files in under 2 seconds", () => {
      const graph = new ProjectKnowledgeGraph("perf-bench-1");
      const files = Array.from({ length: 50 }, (_, i) => ({
        path: `src/module${i}/index.ts`,
        content: `export class Module${i} {\n  private value: number = ${i};\n  getValue(): number { return this.value; }\n  setValue(v: number): void { this.value = v; }\n  static create(): Module${i} { return new Module${i}(); }\n}\nexport function helper${i}(x: number): number { return x * ${i}; }\nexport const CONST_${i} = ${i * 100};\nexport interface IModule${i} { value: number; }\nexport type Module${i}Type = Module${i} | null;`,
        language: "typescript" as const,
      }));

      const elapsed = measureMs(() => {
        for (const file of files) {
          graph.indexFile(file.path, file.content, file.language);
        }
      });

      expect(elapsed).toBeLessThan(2000);
      expect(graph.getAllFilePaths().length).toBe(50);
    });

    it("should index 100 files in under 5 seconds", () => {
      const graph = new ProjectKnowledgeGraph("perf-bench-2");
      const files = Array.from({ length: 100 }, (_, i) => ({
        path: `src/pkg${i}/handler.ts`,
        content: `export async function handle${i}(req: Request): Promise<Response> {\n  const data = await req.json();\n  return new Response(JSON.stringify({ ok: true, id: ${i} }));\n}\nexport class Service${i} { async process() { return ${i}; } }`,
        language: "typescript" as const,
      }));

      const elapsed = measureMs(() => {
        for (const file of files) {
          graph.indexFile(file.path, file.content, file.language);
        }
      });

      expect(elapsed).toBeLessThan(5000);
      expect(graph.getAllFilePaths().length).toBe(100);
    });
  });

  describe("2. Hash Computation Performance", () => {
    it("should compute SHA-256 hash of 1MB content in under 100ms", async () => {
      const largeContent = "x".repeat(1024 * 1024); // 1MB
      const elapsed = await measureMsAsync(async () => {
        await computeDiffHash(largeContent);
      });
      expect(elapsed).toBeLessThan(100);
    });

    it("should compute sync SHA-256 hash of 1MB content in under 100ms", () => {
      const largeContent = "y".repeat(1024 * 1024);
      const elapsed = measureMs(() => {
        computeDiffHashSync(largeContent);
      });
      expect(elapsed).toBeLessThan(100);
    });

    it("should compute PatchGenerator SHA-256 consistently", () => {
      const content = "function example() { return 42; }";
      const hash1 = PatchGenerator.sha256(content);
      const hash2 = PatchGenerator.sha256(content);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length
    });
  });

  describe("3. Retrieval Performance", () => {
    it("should retrieve context for a query in under 500ms", () => {
      const graph = new ProjectKnowledgeGraph("perf-bench-retrieval");

      // Index some files
      for (let i = 0; i < 30; i++) {
        graph.indexFile(
          `src/service${i}.ts`,
          `export class AuthService${i} {\n  async authenticate(token: string): Promise<boolean> { return !!token; }\n  async authorize(userId: string, resource: string): Promise<boolean> { return true; }\n}`,
          "typescript",
        );
      }

      const elapsed = measureMs(() => {
        const results = HybridRetrievalEngine.retrieve({
          query: "authentication service",
          graph,
          limit: 10,
        });
        expect(results.hits.length).toBeGreaterThan(0);
      });

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("4. Memory Usage", () => {
    it("should not exceed 50MB heap growth for 100-file index", () => {
      // Force GC if available
      if (typeof globalThis.gc === "function") globalThis.gc();
      const baselineHeap = process.memoryUsage().heapUsed;

      const graph = new ProjectKnowledgeGraph("perf-bench-mem");
      for (let i = 0; i < 100; i++) {
        graph.indexFile(
          `src/large${i}.ts`,
          `export const data${i} = ${JSON.stringify("a".repeat(1000))};\n`.repeat(10),
          "typescript",
        );
      }

      const afterHeap = process.memoryUsage().heapUsed;
      const growthMB = (afterHeap - baselineHeap) / (1024 * 1024);

      expect(growthMB).toBeLessThan(50);
    });
  });
});
