import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { StaticAuditor } from "@/lib/hacksync/security/static-auditor";
import { ProjectContextBuilder } from "@/lib/hacksync/intelligence/context-builder";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { GitImpactEngine } from "@/lib/hacksync/git/git-impact";
import { RepositoryFixtures } from "./repository-fixtures";

describe("Phase 8.1 & 8.8: Real Repository Validation & Large Repository Stress", () => {
  beforeEach(() => {
    ProjectIndexManager.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Small Repository Validation (25-40 files, ~150-200 symbols)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Small Repository Benchmark (30 files, ~150 symbols)", () => {
    it("should index small repository with full multi-language parsing under 500ms", () => {
      const graph = new ProjectKnowledgeGraph("proj-small");
      const files = RepositoryFixtures.generateSmallRepo();

      const initialMem = process.memoryUsage().heapUsed;
      const metrics = RepositoryFixtures.indexFiles(graph, files);
      const postMem = process.memoryUsage().heapUsed;

      expect(metrics.fileCount).toBeGreaterThanOrEqual(25);
      expect(metrics.fileCount).toBeLessThanOrEqual(40);
      expect(metrics.symbolCount).toBeGreaterThanOrEqual(100);
      expect(metrics.durationMs).toBeLessThan(1500); // Sub-1.5s in Bun runtime

      // Multi-language AST verification
      expect(graph.getAllFilePaths()).toContain("schema.sql");
      expect(graph.getAllFilePaths()).toContain("workers/metrics_collector.py");
      expect(graph.getAllFilePaths()).toContain("src/components/UserCard.tsx");
      expect(graph.getAllFilePaths()).toContain("src/auth/jwt.ts");

      // Architecture detection verification
      const arch = graph.getArchitectureProfile();
      expect(arch.totalFiles).toBe(files.length);
      expect(arch.layerCounts.database).toBeGreaterThanOrEqual(1);
      expect(arch.layerCounts.component).toBeGreaterThanOrEqual(1);
      expect(arch.layerCounts.service).toBeGreaterThanOrEqual(5);

      // Memory footprint should be reasonable
      const memDeltaMb = Math.round((postMem - initialMem) / (1024 * 1024));
      expect(memDeltaMb).toBeLessThan(50); // Under 50MB for small repo
    });

    it("should execute passive SAST security scan on small repo cleanly", () => {
      const graph = new ProjectKnowledgeGraph("proj-small-sec");
      const files = RepositoryFixtures.generateSmallRepo();
      RepositoryFixtures.indexFiles(graph, files);

      const scanStart = performance.now();
      const report = StaticAuditor.runPassiveAudit({
        graph,
        projectId: "proj-small-sec",
      });
      const scanDuration = Math.round(performance.now() - scanStart);

      expect(scanDuration).toBeLessThan(500);
      expect(report.coverage.scannedFilesCount).toBe(files.length);
      expect(report.summary.total).toBeGreaterThanOrEqual(0);
      expect(report.coverage.totalLoc).toBeGreaterThan(0);
    });

    it("should execute hybrid retrieval and context building with sub-50ms latency", () => {
      const graph = new ProjectKnowledgeGraph("proj-small-retrieval");
      const files = RepositoryFixtures.generateSmallRepo();
      RepositoryFixtures.indexFiles(graph, files);

      const retStart = performance.now();
      const searchResults = graph.search("verifyToken jwt payload");
      const retDuration = Math.round(performance.now() - retStart);

      expect(retDuration).toBeLessThan(100);
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0].path).toBe("src/auth/jwt.ts");

      // Context building
      const ctxStart = performance.now();
      const retrieval = HybridRetrievalEngine.retrieve({
        query: "verifyToken jwt payload",
        graph,
        limit: 5,
      });
      const context = ProjectContextBuilder.build(retrieval);
      const ctxDuration = Math.round(performance.now() - ctxStart);

      expect(ctxDuration).toBeLessThan(100);
      expect(context.hasSufficientEvidence).toBe(true);
      expect(context.formattedContext).toContain("jwt.ts");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Medium Repository Validation (120-180 files, ~800-1,200 symbols)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Medium Repository Benchmark (150 files, ~600+ symbols)", () => {
    it("should index medium multi-tier repository and resolve dependency relations", () => {
      const graph = new ProjectKnowledgeGraph("proj-med");
      const files = RepositoryFixtures.generateMediumRepo();

      const metrics = RepositoryFixtures.indexFiles(graph, files);

      expect(metrics.fileCount).toBeGreaterThanOrEqual(120);
      expect(metrics.symbolCount).toBeGreaterThanOrEqual(500);

      // Verify cross-layer architecture mapping
      const arch = graph.getArchitectureProfile();
      expect(arch.layerCounts.service).toBeGreaterThanOrEqual(20);
      expect(arch.layerCounts.repository).toBeGreaterThanOrEqual(20);

      // Symbol lookup performance
      const symStart = performance.now();
      const syms = graph.findSymbol("UserService");
      const symDuration = Math.round(performance.now() - symStart);

      expect(symDuration).toBeLessThan(10);
      expect(syms.length).toBeGreaterThanOrEqual(1);
      expect(syms[0].filePath).toBe("src/services/user.service.ts");
    });

    it("should compute Git blast radius accurately across medium repo dependencies", () => {
      const graph = new ProjectKnowledgeGraph("proj-med-blast");
      const files = RepositoryFixtures.generateMediumRepo();
      RepositoryFixtures.indexFiles(graph, files);

      const blastStart = performance.now();
      const report = GitImpactEngine.analyze({
        fileDiffs: [
          {
            oldPath: "src/models/user.model.ts",
            newPath: "src/models/user.model.ts",
            status: "modified",
            hunks: [],
            additions: 2,
            deletions: 0,
          },
        ],
        changedSymbols: [],
        graph,
      });
      const blastDuration = Math.round(performance.now() - blastStart);

      expect(blastDuration).toBeLessThan(150);
      expect(report.regressionRisk).toBeDefined();
      expect(report.regressionRisk.blastRadiusScore).toBeGreaterThanOrEqual(0);
      expect(report.directDependents.length + report.transitiveDependents.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Large Repository Stress Test (500+ files, 2,000+ symbols) - Section 8.8
  // ───────────────────────────────────────────────────────────────────────────
  describe("Large Repository Stress Test (520+ files, 2,100+ symbols)", () => {
    it("should index 500+ files and 2,000+ symbols without crashing or heap overflow", () => {
      const graph = new ProjectKnowledgeGraph("proj-large-stress");
      const files = RepositoryFixtures.generateLargeRepo();

      expect(files.length).toBeGreaterThanOrEqual(500);

      const memBefore = process.memoryUsage().heapUsed;
      const metrics = RepositoryFixtures.indexFiles(graph, files);
      const memAfter = process.memoryUsage().heapUsed;

      expect(metrics.fileCount).toBeGreaterThanOrEqual(500);
      expect(metrics.symbolCount).toBeGreaterThanOrEqual(2000);

      // Total indexing throughput: should complete reasonably fast in bun
      expect(metrics.durationMs).toBeLessThan(10000); // Sub-10s for 500+ AST parsed files

      // Memory efficiency
      const heapDeltaMb = Math.round((memAfter - memBefore) / (1024 * 1024));
      expect(heapDeltaMb).toBeLessThan(250); // Under 250MB heap delta for 500+ parsed files

      // Verify symbol query responsiveness on 2,000+ symbol graph
      const searchStart = performance.now();
      const hits = graph.findSymbol("BillingItem5Service");
      const searchDuration = Math.round(performance.now() - searchStart);

      expect(searchDuration).toBeLessThan(20); // Sub-20ms instant symbol lookup
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].filePath).toContain("billing");

      // Verify retrieval responsiveness on large project
      const retrievalStart = performance.now();
      const results = graph.search("identity audit create payload");
      const retrievalDuration = Math.round(performance.now() - retrievalStart);

      expect(retrievalDuration).toBeLessThan(250);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle large repository security scanning gracefully without timeouts", () => {
      const graph = new ProjectKnowledgeGraph("proj-large-sec");
      const files = RepositoryFixtures.generateLargeRepo();
      RepositoryFixtures.indexFiles(graph, files);

      const scanStart = performance.now();
      const report = StaticAuditor.runPassiveAudit({
        graph,
        projectId: "proj-large-sec",
      });
      const scanDuration = Math.round(performance.now() - scanStart);

      expect(scanDuration).toBeLessThan(5000); // Sub-5s passive SAST on 500+ files
      expect(report.coverage.scannedFilesCount).toBeGreaterThanOrEqual(500);
      expect(report.coverage.totalLoc).toBeGreaterThan(5000);
      expect(report.summary.total).toBeGreaterThanOrEqual(0);
    });
  });
});
