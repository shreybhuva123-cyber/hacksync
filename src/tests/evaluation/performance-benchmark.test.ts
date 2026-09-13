import { describe, expect, it } from "bun:test";
import { LargeProjectFixtureGenerator } from "@/lib/hacksync/evaluation/fixtures/large-project-fixture";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";

describe("Phase 6: Performance Benchmark & Large Synthetic Project Suite", () => {
  const fixture = LargeProjectFixtureGenerator.generate("perf-enterprise-app");

  it("should generate a large deterministic synthetic project with 100+ files", () => {
    expect(fixture.files.length).toBeGreaterThanOrEqual(100);
    expect(fixture.gitDiff).toBeDefined();
    expect(fixture.files.some((f) => f.path.includes("src/db/models/"))).toBe(true);
    expect(fixture.files.some((f) => f.path.includes("src/services/"))).toBe(true);
    expect(fixture.files.some((f) => f.path.includes("src/routes/"))).toBe(true);
    expect(fixture.files.some((f) => f.path.includes("src/tests/"))).toBe(true);
  });

  it("should index 100+ files into ProjectKnowledgeGraph within latency budget", () => {
    const graph = new ProjectKnowledgeGraph("proj-large-perf");
    const t0 = Date.now();

    for (const file of fixture.files) {
      graph.indexFile(file.path, file.content);
    }

    const indexingDurationMs = Date.now() - t0;
    // 100+ files should index efficiently in memory in under 2500ms
    expect(indexingDurationMs).toBeLessThan(2500);

    const metrics = graph.getMetrics();
    expect(metrics.indexedFilesCount).toBeGreaterThanOrEqual(100);
    // 100+ files must yield over 300 symbols (classes, interfaces, types, methods)
    expect(metrics.totalSymbolsCount).toBeGreaterThanOrEqual(300);
  });

  it("should perform fast symbol retrieval (< 50ms) across the indexed large project", () => {
    const graph = new ProjectKnowledgeGraph("proj-large-perf-retrieval");
    for (const file of fixture.files) {
      graph.indexFile(file.path, file.content);
    }

    const t0 = Date.now();
    const matches = graph.findSymbol("UserService");
    const lookupDurationMs = Date.now() - t0;

    expect(lookupDurationMs).toBeLessThan(50);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.filePath).toBe("src/services/user.service.ts");
  });

  it("should calculate blast radius impact across dependency layers", () => {
    const graph = new ProjectKnowledgeGraph("proj-large-blast-radius");
    for (const file of fixture.files) {
      graph.indexFile(file.path, file.content);
    }

    // Impact of modifying user model
    const dependents = graph.getDependents("src/db/models/user.model.ts");
    expect(dependents).toBeDefined();
    expect(Array.isArray(dependents)).toBe(true);
    // User repository, service, routes, or tests depend on user model
    expect(dependents.some((p) => p.includes("user"))).toBe(true);
  });

  it("should compare cold index creation vs warm symbol lookup latency", () => {
    const graph = new ProjectKnowledgeGraph("proj-perf-comparison");

    // Cold index
    const coldStart = Date.now();
    for (const file of fixture.files.slice(0, 50)) {
      graph.indexFile(file.path, file.content);
    }
    const coldDurationMs = Date.now() - coldStart;

    // Warm lookup
    const warmStart = Date.now();
    const results = graph.findSymbol("AccountService");
    const warmDurationMs = Date.now() - warmStart;

    expect(results.length).toBeGreaterThan(0);
    // Warm lookup should be significantly faster than indexing 50 files
    expect(warmDurationMs).toBeLessThanOrEqual(coldDurationMs);
    expect(warmDurationMs).toBeLessThan(50);
  });
});
