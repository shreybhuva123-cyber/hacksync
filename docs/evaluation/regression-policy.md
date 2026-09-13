# HackSync Evaluation Regression Policy & Quality Gates

## Overview

The HackSync Regression Detection Engine (`RegressionDetector`) acts as an automated quality gate between benchmark runs. When a new model, prompt, heuristic, or architectural change is introduced, running a comparison benchmark prevents silent degradation of accuracy, precision, or safety.

---

## Default Regression Thresholds

A candidate run is flagged with a regression if any of the following boundaries are breached relative to the baseline run:

| Metric | Threshold | Severity | Description |
| :--- | :--- | :--- | :--- |
| **Security F1** | $\Delta < -5\%$ | CRITICAL | Significant degradation in vulnerability detection accuracy. |
| **Security Precision** | $\Delta < -5\%$ | HIGH | Increase in false positive noise reported to engineers. |
| **Security Recall** | $\Delta < -5\%$ | CRITICAL | Undetected vulnerabilities introduced into scanning. |
| **Retrieval Hit@1** | $\Delta < -5\%$ | HIGH | Top-ranked retrieval result quality degradation. |
| **Retrieval Hit@3 / Hit@5** | $\Delta < -5\%$ | MEDIUM | Secondary retrieval candidate quality loss. |
| **Mean Reciprocal Rank (MRR)** | $\Delta < -5\%$ | HIGH | Average rank of relevant items dropped. |
| **Hallucinated Citations** | $\Delta > 0$ | CRITICAL | Any citation to non-existent file or out-of-bounds line is forbidden. |
| **Hallucinated Files** | $\Delta > 0$ | CRITICAL | Any reference to non-existent project files in generated answers. |
| **Fix Success Rate** | $\Delta < 0\%$ | CRITICAL | Failure to apply or verify fixes that previously passed. |
| **Patch Applier Failures** | $\Delta > 0$ | CRITICAL | Atomic rollback or patch application failure. |
| **Latency Increase** | $\Delta > +50\%$ and $> 1000\text{ms}$ | MEDIUM | Unacceptable performance degradation. |

---

## Quality Gate Outcomes

The `RegressionDetector` classifies comparison outcomes into two operational statuses:

1. **`PASSED`**:
   - No critical or high severity regressions detected.
   - All metric changes fall within configured tolerance windows.
   - Safe to proceed with release or PR merge.

2. **`REGRESSION_DETECTED`**:
   - One or more critical/high regressions flagged.
   - An itemized list of regressions with baseline vs. current values and percentage deltas is emitted.
   - Blocks automated deployment pipelines or notifies engineering team.
