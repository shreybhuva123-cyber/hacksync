# HackSync Phase 6: Model Comparison & Privacy Policy

## 1. Multi-Dimensional Head-to-Head Comparison

The `ModelComparisonEngine` evaluates two or more models across 6 independent capability dimensions:

1. **Retrieval**: Accuracy of symbol indexing and Hit@K scores.
2. **Security**: Precision, recall, and F1 score on vulnerability benchmarks.
3. **Fix Generation**: Syntactic validity, vulnerability resolution, and regression avoidance.
4. **Citation Accuracy**: Validity of citations and absence of hallucinated files.
5. **Latency**: Average execution time per query or patch.
6. **Cost Efficiency**: Estimated dollar cost per benchmark suite run.

---

## 2. Weighted Overall Score Calculation

To produce an objective comparison winner, individual dimension scores are normalized to a 0–100 scale and weighted:

| Dimension | Default Weight | Description |
| :--- | :--- | :--- |
| Security | 30% | Correctness of vulnerability identification |
| Fix Generation | 25% | Reliability and safety of proposed patches |
| Citation & Grounding | 15% | Freedom from hallucinations |
| Retrieval | 15% | Finding relevant code symbols |
| Latency | 10% | Execution speed |
| Cost Efficiency | 5% | Model API expense |

The winner is determined by:
```typescript
const winner = scoreA > scoreB ? modelA.modelName : scoreB > scoreA ? modelB.modelName : "tie";
```

---

## 3. Privacy Policy & Local-Only Enforcement

Projects may designate a strict `localOnly` privacy setting (`privacyPolicy.localOnly = true`).

When `localOnly = true`:
- All requests targeting cloud LLM providers (e.g. `openai`, `anthropic`, `gemini`) are rejected with an `AuthorizationError`.
- Only locally hosted models (e.g., `ollama`, local ONNX, or deterministic builtin engines) are permitted.
- Benchmark runners and model comparison routines enforce this policy prior to dispatching any prompt or benchmark case.

```typescript
ModelComparisonEngine.assertPrivacyPolicy(config, projectPolicy);
// Throws AuthorizationError: Cloud model 'gpt-4o' violates local-only privacy policy.
```

---

## 4. Self-Evaluation Detection

When a model is used both to generate code/explanations and to evaluate its own output (generator model === judge model), a conflict of interest exists.

`EvaluationContext` detects this condition automatically:
```typescript
const isSelfEval = context.generatorModel === context.judgeModel;
```
When `isSelfEval` is true:
- The scorecard flags `selfEvaluation: true`.
- An informative note is appended: `"Self-evaluation detected: Generator and judge models are identical. Potential positive bias."`
- The system prevents self-evaluation scores from overriding independent judge evaluations.
