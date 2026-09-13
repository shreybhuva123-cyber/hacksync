# HackSync Phase 6: Regression Engine 2.0 Specification

## 1. Dual-Delta Regression Detection

`RegressionEngine2` prevents code or model degradation across revisions by evaluating two distinct deltas:

1. **Relative Drop ($\Delta_{rel}$)**:
   $$\Delta_{rel} = \frac{\text{Baseline} - \text{Current}}{\text{Baseline}}$$
2. **Absolute Drop ($\Delta_{abs}$)**:
   $$\Delta_{abs} = \text{Baseline} - \text{Current}$$

Both deltas are reported alongside the baseline and candidate values. This prevents small percentages on tiny numbers from causing misleading alerts, while catching severe drops regardless of scale.

---

## 2. Small-Sample Protection ($N < 5$)

Automated regression detection on small sample sizes ($N < 5$) frequently causes false alarms.

In `RegressionEngine2`:
- When a category has fewer than 5 evaluated cases (`MIN_CASES_FOR_CATEGORY_REGRESSION = 5`), score drops do NOT trigger `REGRESSION` or `CRITICAL_REGRESSION`.
- Instead, the engine classifies the severity as `INSUFFICIENT_SAMPLE`.
- This ensures CI pipelines and evaluation dashboards are not blocked by noisy, statistically underpowered comparisons.

---

## 3. Five-Tier Severity Classification

| Tier | Condition | Action |
| :--- | :--- | :--- |
| `NONE` | $\Delta_{rel} \le 0$ (performance improved or unchanged) | Clean pass |
| `INFO` | Minor fluctuation ($0 < \Delta_{rel} < 3\%$) | Logged in telemetry |
| `WARNING` | Moderate drop ($3\% \le \Delta_{rel} < 5\%$ or latency spike $> 50\%$) | Flagged for engineering review |
| `REGRESSION` | Significant drop ($\Delta_{rel} \ge 5\%$ or $\Delta_{abs} \ge 5.0$) | Fails benchmark run gate |
| `CRITICAL_REGRESSION` | Critical safety or security breach | Immediate blocking alarm |
| `INSUFFICIENT_SAMPLE` | Drop observed, but $N < 5$ | Informative warning; does not fail gate |

---

## 4. Critical Regression Triggers

The following events trigger `CRITICAL_REGRESSION` unconditionally:
1. **Hallucinated Citations**: Any increase in hallucinated citations ($> 0$).
2. **Security Recall Collapse**: Security category recall dropping by $> 10\%$.
3. **Patch Validation Bypass**: Any patch deemed valid by an evaluator that fails syntax validation or introduces known security flaws.
4. **Authorization Regressions**: Any failure in multi-tenant project isolation or RBAC permissions.
