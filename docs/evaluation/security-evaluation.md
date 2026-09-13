# Security & Secrets Evaluation Methodology

## Overview

The Security Evaluator in HackSync Phase 5 provides disciplined, objective validation of both SAST (Static Application Security Testing) rules and the high-entropy Secret Scanner.

---

## 1. Ground Truth Fixture Categories

The benchmark suite includes targeted test fixtures across common high-risk vulnerability classes:

1. **SQL Injection (`BM-SEC-SQLI-1`)**: Raw string concatenation into SQL database execution sinks without parameterized queries.
2. **Cross-Site Scripting (`BM-SEC-XSS-1`)**: Unescaped user input passed directly into DOM sinks (`innerHTML`).
3. **Command Injection (`BM-SEC-CMD-1`)**: Untrusted query parameters passed directly to shell execution functions (`exec`).
4. **Path Traversal (`BM-SEC-TRAV-1`)**: Unsanitized relative file paths passed into filesystem read operations.
5. **Hardcoded Secrets (`BM-SEC-SECR-1`)**: Hardcoded API keys and credentials matching production provider patterns.
6. **Negative Control Clean Code (`BM-SEC-SAFE-1`)**: Parameterized queries with input validation, verifying zero false positive findings.

---

## 2. Separation of Severity and Confidence

HackSync explicitly distinguishes between:
- **Severity**: The potential impact or harm of the vulnerability if exploited (`critical`, `high`, `medium`, `low`, `info`).
- **Confidence**: The certainty that the finding is a true vulnerability rather than benign code (`high`, `medium`, `low`).

The `SecurityEvaluator` tests both attributes:
- Fails the case if the reported severity diverges from the ground-truth severity.
- Rejects findings where confidence is unpopulated or improperly merged with severity.

---

## 3. Secret Redaction Guarantee

When evaluating secret scanning:
- The raw secret substring is verified against the findings evidence.
- If the raw secret token appears in plaintext in any finding's evidence, description, or logs, the evaluation immediately fails with a `CRITICAL: Raw benchmark secret was not redacted in finding evidence!` violation.
- The `SecretRedactor` must mask the token with `[REDACTED_STRIPE_KEY]` or corresponding provider mask.

---

## 4. False Positive Prevention

Benchmark suite includes negative control fixtures (e.g. `BM-SEC-SAFE-1`). Any finding emitted on negative control code increments the false positive count $FP$ and severely penalizes the benchmark run score.
