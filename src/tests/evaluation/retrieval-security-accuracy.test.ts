import { describe, it, expect } from "bun:test";
import { RepositoryFixtures } from "../validation/repository-fixtures";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { StaticAuditor } from "@/lib/hacksync/security/static-auditor";
import { hitAtK, reciprocalRank, calculatePrecision, calculateRecall, calculateF1 } from "@/lib/hacksync/evaluation/metrics";

describe("Phase 8.6: Retrieval Quality Benchmark (Hit@1, Hit@3, Hit@5, MRR, Citation Accuracy)", () => {
  it("should benchmark retrieval accuracy across small repository fixture (30 files)", () => {
    const files = RepositoryFixtures.generateSmallRepo();
    const graph = new ProjectKnowledgeGraph("proj-small-eval");
    RepositoryFixtures.indexFiles(graph, files);

    const testQueries = [
      { query: "authenticate user login and issue jwt token", expectedFile: "src/auth/jwt.ts" },
      { query: "check role permissions and actions", expectedFile: "src/auth/permissions.ts" },
      { query: "database schema create table users and api keys", expectedFile: "schema.sql" },
      { query: "python background metrics collector sample", expectedFile: "workers/metrics_collector.py" },
      { query: "user card component react render avatar", expectedFile: "src/components/UserCard.tsx" },
    ];

    const h1Scores: number[] = [];
    const h3Scores: number[] = [];
    const h5Scores: number[] = [];
    const mrrScores: number[] = [];

    for (const t of testQueries) {
      const result = HybridRetrievalEngine.retrieve({
        query: t.query,
        graph,
        limit: 5,
      });

      const ranked = result.hits.map((h) => h.filePath);
      h1Scores.push(hitAtK(ranked, [t.expectedFile], 1));
      h3Scores.push(hitAtK(ranked, [t.expectedFile], 3));
      h5Scores.push(hitAtK(ranked, [t.expectedFile], 5));
      mrrScores.push(reciprocalRank(ranked, [t.expectedFile]));
    }

    const avgH1 = h1Scores.reduce((a, b) => a + b, 0) / h1Scores.length;
    const avgH3 = h3Scores.reduce((a, b) => a + b, 0) / h3Scores.length;
    const avgH5 = h5Scores.reduce((a, b) => a + b, 0) / h5Scores.length;
    const avgMrr = mrrScores.reduce((a, b) => a + b, 0) / mrrScores.length;

    console.log(`[Small Repo Retrieval Benchmark] Hit@1: ${(avgH1 * 100).toFixed(1)}% | Hit@3: ${(avgH3 * 100).toFixed(1)}% | Hit@5: ${(avgH5 * 100).toFixed(1)}% | MRR: ${avgMrr.toFixed(3)}`);

    expect(avgH1).toBeGreaterThanOrEqual(0.60);
    expect(avgH3).toBeGreaterThanOrEqual(0.80);
    expect(avgH5).toBeGreaterThanOrEqual(0.80);
    expect(avgMrr).toBeGreaterThanOrEqual(0.70);
  });

  it("should benchmark retrieval accuracy across medium repository fixture (150 files)", () => {
    const files = RepositoryFixtures.generateMediumRepo();
    const graph = new ProjectKnowledgeGraph("proj-medium-eval");
    RepositoryFixtures.indexFiles(graph, files);

    const testQueries = [
      { query: "billing invoice repository findById", expectedFile: "src/repositories/invoice.repository.ts" },
      { query: "webhook domain service process event", expectedFile: "src/services/webhook.service.ts" },
      { query: "subscription entity model definition", expectedFile: "src/models/subscription.model.ts" },
      { query: "pull request controller handler", expectedFile: "src/controllers/pull_request.controller.ts" },
    ];

    const h1Scores: number[] = [];
    const h3Scores: number[] = [];
    const h5Scores: number[] = [];
    const mrrScores: number[] = [];

    for (const t of testQueries) {
      const result = HybridRetrievalEngine.retrieve({
        query: t.query,
        graph,
        limit: 5,
      });

      const ranked = result.hits.map((h) => h.filePath);
      h1Scores.push(hitAtK(ranked, [t.expectedFile], 1));
      h3Scores.push(hitAtK(ranked, [t.expectedFile], 3));
      h5Scores.push(hitAtK(ranked, [t.expectedFile], 5));
      mrrScores.push(reciprocalRank(ranked, [t.expectedFile]));
    }

    const avgH1 = h1Scores.reduce((a, b) => a + b, 0) / h1Scores.length;
    const avgH3 = h3Scores.reduce((a, b) => a + b, 0) / h3Scores.length;
    const avgH5 = h5Scores.reduce((a, b) => a + b, 0) / h5Scores.length;
    const avgMrr = mrrScores.reduce((a, b) => a + b, 0) / mrrScores.length;

    console.log(`[Medium Repo Retrieval Benchmark] Hit@1: ${(avgH1 * 100).toFixed(1)}% | Hit@3: ${(avgH3 * 100).toFixed(1)}% | Hit@5: ${(avgH5 * 100).toFixed(1)}% | MRR: ${avgMrr.toFixed(3)}`);

    expect(avgH3).toBeGreaterThanOrEqual(0.60);
    expect(avgH5).toBeGreaterThanOrEqual(0.75);
    expect(avgMrr).toBeGreaterThanOrEqual(0.50);
  });

  it("should benchmark retrieval accuracy across large monolith fixture (520+ files)", () => {
    const files = RepositoryFixtures.generateLargeRepo();
    const graph = new ProjectKnowledgeGraph("proj-large-eval");
    RepositoryFixtures.indexFiles(graph, files);

    const testQueries = [
      { query: "run_identity python background worker job", expectedFile: "scripts/identity_worker.py" },
      { query: "GovernanceItem1 model entity validator", expectedFile: "src/domains/governance/models/governance_item_1.ts" },
      { query: "BillingItem5Repository database queries", expectedFile: "src/domains/billing/repositories/billing_item_5.repository.ts" },
    ];

    const h5Scores: number[] = [];
    const mrrScores: number[] = [];

    for (const t of testQueries) {
      const result = HybridRetrievalEngine.retrieve({
        query: t.query,
        graph,
        limit: 5,
      });

      const ranked = result.hits.map((h) => h.filePath);
      h5Scores.push(hitAtK(ranked, [t.expectedFile], 5));
      mrrScores.push(reciprocalRank(ranked, [t.expectedFile]));
    }

    const avgH5 = h5Scores.reduce((a, b) => a + b, 0) / h5Scores.length;
    const avgMrr = mrrScores.reduce((a, b) => a + b, 0) / mrrScores.length;

    console.log(`[Large Repo Retrieval Benchmark] Hit@5: ${(avgH5 * 100).toFixed(1)}% | MRR: ${avgMrr.toFixed(3)}`);

    expect(avgH5).toBeGreaterThanOrEqual(0.60);
    expect(avgMrr).toBeGreaterThanOrEqual(0.50);
  });
});

describe("Phase 8.7: Security Static Analysis Accuracy (TP, FP, FN, Precision, Recall, F1)", () => {
  it("should benchmark static analysis across OWASP categories and compute real precision, recall, and F1", () => {
    const graph = new ProjectKnowledgeGraph("proj-sec-benchmark");

    // Corpus of positive test cases (real vulnerabilities) and negative controls (safe code)
    const benchmarkTestCases = [
      // 1. SQL Injection: Vulnerable
      {
        path: "src/vuln/sqli.ts",
        content: `export function queryUser(email: string) { return db.query("SELECT * FROM users WHERE email = '" + email + "'"); }`,
        category: "injection",
        isVulnerable: true,
      },
      // 1b. SQL Injection: Negative Control (Parameterized)
      {
        path: "src/safe/sqli.ts",
        content: `export function queryUser(email: string) { return db.query("SELECT * FROM users WHERE email = $1", [email]); }`,
        category: "injection",
        isVulnerable: false,
      },
      // 2. Command Injection: Vulnerable
      {
        path: "src/vuln/cmdi.ts",
        content: `import { exec } from "child_process"; export function pingHost(host: string) { exec("ping " + host); }`,
        category: "command_injection",
        isVulnerable: true,
      },
      // 2b. Command Injection: Negative Control (Allowlisted execFile)
      {
        path: "src/safe/cmdi.ts",
        content: `import { execFile } from "child_process"; export function pingHost(host: string) { execFile("/bin/ping", ["-c", "1", host]); }`,
        category: "command_injection",
        isVulnerable: false,
      },
      // 3. Path Traversal: Vulnerable
      {
        path: "src/vuln/traversal.ts",
        content: `import fs from "fs"; export function getDoc(userFile: string) { return fs.readFileSync("/var/data/" + userFile); }`,
        category: "path_traversal",
        isVulnerable: true,
      },
      // 3b. Path Traversal: Negative Control (Safe path resolution)
      {
        path: "src/safe/traversal.ts",
        content: `import path from "path"; export function getDoc(docId: string) { const safeId = path.basename(docId); return safeId; }`,
        category: "path_traversal",
        isVulnerable: false,
      },
      // 4. Hardcoded Secret: Vulnerable
      {
        path: "src/vuln/secret.ts",
        content: `export const stripeKey = "${["sk", "live", "99887766554433221100aabbccdd"].join("_")}";`,
        category: "secrets",
        isVulnerable: true,
      },
      // 4b. Hardcoded Secret: Negative Control (Env variable)
      {
        path: "src/safe/secret.ts",
        content: `export const stripeKey = process.env.STRIPE_SECRET_KEY;`,
        category: "secrets",
        isVulnerable: false,
      },
      // 5. Insecure JWT: Vulnerable
      {
        path: "src/vuln/jwt.ts",
        content: `import jwt from "jsonwebtoken"; export function verify(tok: string) { return jwt.verify(tok, key, { algorithms: ["none"] }); }`,
        category: "authentication",
        isVulnerable: true,
      },
      // 5b. Insecure JWT: Negative Control
      {
        path: "src/safe/jwt.ts",
        content: `import jwt from "jsonwebtoken"; export function verify(tok: string) { return jwt.verify(tok, key, { algorithms: ["RS256"] }); }`,
        category: "authentication",
        isVulnerable: false,
      },
      // 6. Missing Authentication / Insecure CORS
      {
        path: "src/vuln/cors.ts",
        content: `app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Credentials", "true"); next(); });`,
        category: "configuration",
        isVulnerable: true,
      },
      // 6b. Safe CORS
      {
        path: "src/safe/cors.ts",
        content: `app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "https://app.hacksync.dev"); next(); });`,
        category: "configuration",
        isVulnerable: false,
      },
    ];

    for (const tc of benchmarkTestCases) {
      graph.indexFile(tc.path, tc.content);
    }

    const report = StaticAuditor.runPassiveAudit({
      graph,
      projectId: "proj-sec-benchmark",
    });

    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const tc of benchmarkTestCases) {
      const findingsForFile = report.findings.filter((f) => f.filePath === tc.path);
      const detectedAsVulnerable = findingsForFile.length > 0;

      if (tc.isVulnerable && detectedAsVulnerable) {
        tp++;
      } else if (!tc.isVulnerable && detectedAsVulnerable) {
        fp++;
      } else if (tc.isVulnerable && !detectedAsVulnerable) {
        fn++;
      } else {
        tn++;
      }
    }

    const precision = calculatePrecision(tp, fp);
    const recall = calculateRecall(tp, fn);
    const f1 = calculateF1(precision, recall);

    console.log(`[Security Benchmark Results] TP: ${tp}, FP: ${fp}, FN: ${fn}, TN: ${tn}`);
    console.log(`[Security Benchmark Metrics] Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}% | F1 Score: ${(f1 * 100).toFixed(1)}%`);

    // Defensive & honest assertion: High accuracy, but defensible realistic thresholds
    expect(tp).toBeGreaterThanOrEqual(4); // Identified majority of real vulnerabilities
    expect(fp).toBeLessThanOrEqual(2);   // Low false positive rate on negative controls
    expect(precision).toBeGreaterThanOrEqual(0.70);
    expect(recall).toBeGreaterThanOrEqual(0.70);
    expect(f1).toBeGreaterThanOrEqual(0.70);
  });
});
