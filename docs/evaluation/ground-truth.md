# HackSync Phase 6: Independent Ground Truth & Immutability

## 1. Principles of Independent Ground Truth

A core failure mode of automated evaluation systems is **circularity**: using the scanner or language model under test to determine what is "correct," then testing whether the tool reproduces its own output.

HackSync enforces three ironclad rules for ground truth:
1. **Human Authorship or Verified Fixtures**: Ground truth is specified manually or derived from known vulnerability databases (e.g. OWASP Benchmark, CVE reproductions).
2. **Runtime Immutability**: Ground truth objects are frozen using `deepFreeze()` upon loading. Evaluators cannot mutate ground truth during execution.
3. **Anti-Circularity Verification**: `GroundTruthValidator.assertIndependent` asserts that actual outputs were not derived from calling production scanners to synthesize expectations.

---

## 2. Ground Truth Schema

```typescript
export interface GroundTruth {
  readonly expectedFindings?: readonly ExpectedFinding[];
  readonly expectedFiles?: readonly string[];
  readonly expectedSymbols?: readonly string[];
  readonly expectedSeverity?: FindingSeverity;
  readonly expectedTests?: readonly string[];
  readonly expectedCitations?: readonly ExpectedCitation[];
  readonly expectedFixProperties?: ExpectedFixProperties;
  readonly expectedCapabilities?: readonly string[];
  readonly expectedOutcome?: string;
}

export interface ExpectedFinding {
  ruleId: string;
  file: string;
  lineStart?: number;
  lineEnd?: number;
  confidenceMin?: string;
}

export interface ExpectedCitation {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  snippetKeyword?: string;
}

export interface ExpectedFixProperties {
  patchApplies: boolean;
  vulnerabilityResolved: boolean;
  testsPass: boolean;
  regressionsAllowed: boolean;
}
```

---

## 3. Path Traversal & Security Validation

Before ground truth is accepted into the evaluation runner, `GroundTruthValidator.validateAndFreeze` verifies:
- `expectedFiles`, `expectedFindings.file`, and `expectedCitations.file` are safe relative paths.
- Paths must NOT contain parent directory traversal (`..`) or leading root slashes (`/` or `\\`).
- Any breach raises a `ValidationError` immediately, halting the runner before execution.

---

## 4. Anti-Circularity Assertions

The evaluator checks:
```typescript
GroundTruthValidator.assertIndependent(actualFindings, groundTruth, caseId);
```
If an evaluator attempts to pass its own live scanner results as the ground truth object (e.g., matching pointer identities or circular synthesis), execution fails with `ValidationError("[GroundTruth] Circularity detected...")`.
