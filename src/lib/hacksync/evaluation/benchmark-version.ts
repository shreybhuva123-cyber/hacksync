/**
 * HackSync Phase 6: Benchmark Versioning & Reproducibility Hasher
 * Computes deterministic canonical SHA-256 hashes for datasets and evaluation configurations.
 * Two identical benchmark datasets or configurations must produce the exact same hash.
 */

import { createHash } from "crypto";

export interface BenchmarkVersion {
  version: string;
  datasetId: string;
  datasetHash: string;
  createdAt: string;
  schemaVersion: string;
  caseCount: number;
  metadata?: Record<string, unknown>;
}

export class BenchmarkVersionManager {
  /**
   * Canonically serializes any JavaScript object or array into a deterministic JSON string.
   * Recursively sorts all object keys alphabetically, ignores undefined properties,
   * and normalizes whitespace and newline representations.
   */
  static canonicalSerialize(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return "[" + value.map((item) => this.canonicalSerialize(item)).join(",") + "]";
    }

    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];

    for (const key of sortedKeys) {
      const val = obj[key];
      if (val !== undefined) {
        parts.push(JSON.stringify(key) + ":" + this.canonicalSerialize(val));
      }
    }

    return "{" + parts.join(",") + "}";
  }

  /**
   * Computes a deterministic SHA-256 hash of a canonical serialized dataset.
   */
  static computeDatasetHash(dataset: unknown): string {
    const canonical = this.canonicalSerialize(dataset);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Computes a deterministic SHA-256 configuration hash capturing model configuration,
   * evaluation thresholds, scoring weights, and benchmark options.
   */
  static computeConfigurationHash(config: {
    model?: string | undefined;
    provider?: string | undefined;
    scoringWeights?: Record<string, number> | undefined;
    thresholds?: Record<string, unknown> | undefined;
    options?: Record<string, unknown> | undefined;
  }): string {
    const canonical = this.canonicalSerialize(config);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Creates a formal BenchmarkVersion record from a dataset.
   */
  static createVersion(params: {
    version: string;
    datasetId: string;
    schemaVersion?: string | undefined;
    dataset: unknown[];
    metadata?: Record<string, unknown> | undefined;
  }): BenchmarkVersion {
    const datasetHash = this.computeDatasetHash(params.dataset);
    return {
      version: params.version,
      datasetId: params.datasetId,
      datasetHash,
      createdAt: new Date().toISOString(),
      schemaVersion: params.schemaVersion || "2.0.0",
      caseCount: params.dataset.length,
      metadata: params.metadata || {},
    };
  }
}
