import { describe, expect, it } from "bun:test";
import {
  deepFreeze,
  GroundTruthValidator,
  type GroundTruth,
} from "@/lib/hacksync/evaluation/ground-truth";
import { BenchmarkVersionManager } from "@/lib/hacksync/evaluation/benchmark-version";
import { ValidationError } from "@/lib/errors";

describe("Phase 6: Independent Ground Truth & Immutability Engine", () => {
  it("should freeze ground truth objects to enforce runtime immutability", () => {
    const rawGroundTruth: GroundTruth = {
      expectedFiles: ["src/routes/auth.ts"],
      expectedSymbols: ["loginHandler"],
      expectedOutcome: "vulnerability_detected",
    };

    const frozen = deepFreeze(rawGroundTruth);
    expect(Object.isFrozen(frozen)).toBe(true);

    // Modifying frozen object in strict mode throws TypeError
    expect(() => {
      (frozen as any).expectedOutcome = "tampered_outcome";
    }).toThrow();
  });

  it("should validate independent ground truth and reject path traversal", () => {
    const validGt: GroundTruth = {
      expectedFiles: ["src/lib/auth.ts", "src/routes/api.ts"],
      expectedFindings: [
        { ruleId: "sec-sql-injection", file: "src/routes/api.ts", lineStart: 42 },
      ],
      expectedCitations: [{ file: "src/lib/auth.ts", lineStart: 10, lineEnd: 20 }],
    };

    const validated = GroundTruthValidator.validateAndFreeze("test-case-001", validGt);
    expect(validated).toBeDefined();
    expect(Object.isFrozen(validated)).toBe(true);

    // Unsafe relative path traversal
    const traversalGt: GroundTruth = {
      expectedFiles: ["../../etc/passwd"],
    };
    expect(() => {
      GroundTruthValidator.validateAndFreeze("case-traversal", traversalGt);
    }).toThrow(ValidationError);

    // Unsafe absolute path
    const absoluteGt: GroundTruth = {
      expectedFiles: ["/var/run/secrets"],
    };
    expect(() => {
      GroundTruthValidator.validateAndFreeze("case-absolute", absoluteGt);
    }).toThrow(ValidationError);

    // Unsafe citation path
    const unsafeCitationGt: GroundTruth = {
      expectedCitations: [{ file: "../malicious.ts" }],
    };
    expect(() => {
      GroundTruthValidator.validateAndFreeze("case-unsafe-cite", unsafeCitationGt);
    }).toThrow(ValidationError);
  });

  it("should detect and reject circular ground truth derivation", () => {
    const findings = [
      {
        id: "f-1",
        ruleId: "sec-sqli",
        file: "src/db.ts",
        severity: "CRITICAL" as const,
        description: "SQL injection",
      },
    ];

    // Passing scanner output as ground truth should trigger circularity warning
    expect(() => {
      GroundTruthValidator.assertIndependent(findings, findings as any, "circular-test");
    }).toThrow(ValidationError);
  });

  it("should canonically serialize objects and produce identical SHA-256 hashes regardless of key order", () => {
    const objA = {
      model: "claude-3-5-sonnet",
      temperature: 0.2,
      maxTokens: 4096,
      categories: ["security", "retrieval"],
    };

    const objB = {
      categories: ["security", "retrieval"],
      maxTokens: 4096,
      temperature: 0.2,
      model: "claude-3-5-sonnet",
    };

    const serializedA = BenchmarkVersionManager.canonicalSerialize(objA);
    const serializedB = BenchmarkVersionManager.canonicalSerialize(objB);

    expect(serializedA).toBe(serializedB);

    const hashA = BenchmarkVersionManager.computeConfigurationHash({
      model: objA.model,
      options: { categories: objA.categories, temperature: objA.temperature },
    });
    const hashB = BenchmarkVersionManager.computeConfigurationHash({
      options: { temperature: objB.temperature, categories: objB.categories },
      model: objB.model,
    });

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should create formal benchmark version records with deterministic dataset hash", () => {
    const dataset = [
      { id: "case-1", category: "security", title: "SQLi test" },
      { id: "case-2", category: "retrieval", title: "Symbol lookup" },
    ];

    const versionRecord = BenchmarkVersionManager.createVersion({
      version: "2.0.0",
      datasetId: "hacksync-core-eval",
      dataset,
      metadata: { author: "HackSync Team", license: "Apache-2.0" },
    });

    expect(versionRecord.version).toBe("2.0.0");
    expect(versionRecord.datasetId).toBe("hacksync-core-eval");
    expect(versionRecord.caseCount).toBe(2);
    expect(versionRecord.datasetHash).toMatch(/^[a-f0-9]{64}$/);

    // Identical dataset produces identical hash
    const versionRecord2 = BenchmarkVersionManager.createVersion({
      version: "2.0.0",
      datasetId: "hacksync-core-eval",
      dataset: [...dataset],
    });
    expect(versionRecord2.datasetHash).toBe(versionRecord.datasetHash);
  });
});
