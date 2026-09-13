# HackSync Evaluation Metrics & Mathematical Formulations

## Overview

The HackSync Evaluation Engine implements formal mathematical formulas for assessing classification accuracy, ranking performance, citation validity, and fix reliability.

---

## 1. Classification Metrics (Security & SAST)

Given:
- $TP$ = True Positives (actual vulnerability correctly identified)
- $FP$ = False Positives (reported finding where no vulnerability exists)
- $TN$ = True Negatives (clean code correctly identified as non-vulnerable)
- $FN$ = False Negatives (actual vulnerability missed by scanner)

### Precision
$$\text{Precision} = \frac{TP}{TP + FP}$$
- **Zero-denominator safety**: Returns `'not_applicable'` if $TP + FP = 0$.

### Recall (True Positive Rate / Sensitivity)
$$\text{Recall} = \frac{TP}{TP + FN}$$
- **Zero-denominator safety**: Returns `'not_applicable'` if $TP + FN = 0$.

### F1 Score
$$\text{F1} = \frac{2 \times \text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}} = \frac{2 \times TP}{2 \times TP + FP + FN}$$
- Returns `0.0` if Precision + Recall = 0.
- Returns `'not_applicable'` if both Precision and Recall are `'not_applicable'`.

### False Positive Rate (FPR / Fall-out)
$$\text{FPR} = \frac{FP}{FP + TN}$$
- Measures the proportion of benign code flagged as vulnerable.

### False Discovery Rate (FDR)
$$\text{FDR} = \frac{FP}{TP + FP} = 1 - \text{Precision}$$

---

## 2. Ranking & Retrieval Metrics

### Hit@K
$$\text{Hit@K} = \begin{cases} 1.0 & \text{if any relevant item appears in top } K \text{ results} \\ 0.0 & \text{otherwise} \end{cases}$$
- Calculated for $K \in \{1, 3, 5\}$.
- Returns `'not_applicable'` if the query defines zero relevant targets.

### Reciprocal Rank (RR)
$$\text{RR} = \begin{cases} \frac{1}{\text{rank}} & \text{where rank is the 1-based index of the first relevant item} \\ 0.0 & \text{if no relevant item appears in results} \end{cases}$$

### Mean Reciprocal Rank (MRR)
$$\text{MRR} = \frac{1}{|Q|} \sum_{i=1}^{|Q|} \text{RR}_i$$

---

## 3. Citation & Groundedness Metrics

- **Citation Validity Rate**:
  $$\frac{\text{Valid Citations}}{\text{Total Citations Generated}}$$
- **Hallucinated Citation Rate**:
  $$\frac{\text{Hallucinated Citations (non-existent file or out-of-bounds line)}}{\text{Total Citations Generated}}$$
- **Evidence Coverage Rate**:
  $$\frac{\text{Supported Claims}}{\text{Total Factual Claims}}$$

---

## 4. Fix & Verification Metrics

- **Patch Generation Rate**: Proportion of defects for which syntactically valid unified diffs are produced.
- **Patch Validity Rate**: Proportion of patches satisfying path confinement and base-state SHA-256 consistency.
- **Vulnerability Resolution Rate**: Proportion of patches where post-fix security re-scan confirms zero remaining vulnerabilities of that rule.
- **Regression Introduction Rate**: Proportion of patches that introduce new security findings or break existing test suites.
