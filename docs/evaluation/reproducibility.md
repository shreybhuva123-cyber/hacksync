# HackSync Phase 6: Benchmark Reproducibility & Hashing

## 1. The Reproducibility Mandate

Benchmark results must be cryptographically verifiable and reproducible over time. If a benchmark is run twice with identical code, datasets, and configurations, the recorded run must be attributable to the exact same dataset and configuration inputs.

To guarantee reproducibility, HackSync implements:
1. **Canonical JSON Serialization**: Object keys are recursively sorted alphabetically, undefined values are stripped, and whitespace is normalized.
2. **Deterministic Dataset Hash**: A SHA-256 digest of the canonically serialized test cases.
3. **Deterministic Configuration Hash**: A SHA-256 digest of the model parameters, provider settings, scoring weights, and evaluation options.

---

## 2. Canonical Serialization Algorithm

```typescript
export class BenchmarkVersionManager {
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
}
```

Two objects with identical contents in different key orders (e.g. `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }`) produce identical canonical representations and identical SHA-256 hashes.

---

## 3. Benchmark Dataset Versioning Schema

The database table `benchmark_versions` stores versioned datasets:

| Field | Type | Description |
| :--- | :--- | :--- |
| `version` | text (PK) | SemVer string (e.g. `2.0.0`) |
| `dataset_id` | text | Unique identifier for dataset family |
| `dataset_hash` | text | SHA-256 digest of canonical dataset JSON |
| `created_at` | timestamptz | Immutable timestamp of creation |
| `case_count` | integer | Number of benchmark cases |
| `schema_version` | text | Version of the benchmark case schema |

Benchmark runs link directly to their corresponding `benchmarkVersion` and record `configHash` on every execution record.
