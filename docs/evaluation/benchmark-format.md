# HackSync Benchmark Dataset Specification

## Overview

The HackSync Benchmark Dataset format defines deterministic, verifiable test cases used to evaluate the intelligence, accuracy, and safety of HackSync's static analysis, retrieval, citation, fix generation, and verification engines.

---

## Benchmark Case Schema (`BenchmarkCase`)

Every benchmark case in `src/lib/hacksync/evaluation/types.ts` adheres to the following specification:

```typescript
export interface BenchmarkCase {
  id: string;                         // Unique identifier (e.g., "BM-SEC-SQLI-1")
  name: string;                       // Human-readable benchmark title
  category: BenchmarkCategory;        // Functional area being evaluated
  description: string;                // Detailed explanation of evaluation goal
  difficulty: "easy" | "medium" | "hard";
  tags: string[];                     // Categorization and search tags

  // Sandboxed project environment fixture
  projectFixture?: {
    id: string;                       // Fixture identifier
    name: string;                     // Synthetic project name
    files: Array<{
      path: string;                   // Relative project file path (no ../)
      content: string;                // Synthetic source code
    }>;
    gitDiff?: string;                 // Unified diff string for Git cases
    tests?: Array<{                   // Test suites
      path: string;
      content: string;
    }>;
  };

  // Evaluation task
  task: {
    type: string;                     // "security_scan" | "retrieve" | "generate_fix" | ...
    query: string;                    // The prompt or action request
    targetFiles?: string[];           // Scoped files for execution
  };

  // Deterministic Ground Truth Expectations
  expectedOutcome: string;
  expectedFiles?: string[];           // Files expected to be retrieved or changed
  expectedSymbols?: string[];         // Symbols expected in retrieval results
  expectedFindings?: Array<{          // Expected security findings
    ruleId?: string;
    category?: string;
    severity?: FindingSeverity;
    file?: string;
    lineStart?: number;
    lineEnd?: number;
  }>;
  expectedSecurityCategories?: string[];
  expectedSeverity?: FindingSeverity;
  expectedFixBehavior?: {
    patchApplies: boolean;
    vulnerabilityResolved: boolean;
    testsPass: boolean;
    regressionsAllowed: boolean;
  };
  expectedTests?: string[];
}
```

---

## Safety Guidelines for Benchmark Fixtures

1. **Synthetic Fixtures Only**: Fixtures must never include real customer or proprietary code.
2. **Strictly Non-Functional Credentials**:
   - For secret scanning tests, only synthetic keys matching generic regex patterns (constructed dynamically at test runtime) are permitted.
   - Live production keys, private RSA keys, or active database connection strings are strictly prohibited.
3. **Path Safety**:
   - All `file.path` entries must be relative.
   - Absolute paths or directory traversal tokens (`../`) cause validation failure in `BenchmarkLoader.validateCases()`.
