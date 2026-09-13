# HackSync Phase 6: Observability & Cost Tracking

## 1. Cost Accounting Principles

Modern AI-powered engineering platforms incur real infrastructure and API costs. Phase 6 introduces strict observability and financial telemetry:
- **No Fabricated Numbers**: If token usage is missing or model pricing is unlisted, the system returns `"unavailable"`, never inventing hypothetical costs.
- **Granular Layer Latencies**: Profiling is divided into distinct execution layers so bottlenecks can be identified precisely.
- **Redaction by Default**: Token tracking records, prompts, and metadata are sanitized of secrets, API keys, and sensitive tokens before storage.

---

## 2. Model Pricing Catalog

The `CostTracker` maintains standardized pricing per million tokens ($/1M tokens):

| Model | Input Cost / 1M | Output Cost / 1M |
| :--- | :--- | :--- |
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `claude-3-5-sonnet` | $3.00 | $15.00 |
| `claude-3-5-haiku` | $0.80 | $4.00 |
| `gemini-1.5-pro` | $1.25 | $5.00 |
| `gemini-1.5-flash` | $0.075 | $0.30 |
| `ollama / local / builtin` | $0.00 | $0.00 |

### Cost Calculation Formula
$$\text{Cost} = \left(\frac{\text{Prompt Tokens}}{1{,}000{,}000} \times \text{Input Price}\right) + \left(\frac{\text{Completion Tokens}}{1{,}000{,}000} \times \text{Output Price}\right)$$

---

## 3. Layered Latency Breakdown

Every request traces latency across 6 pipeline stages:
1. `gateway`: Authentication, tenant authorization, and rate limiting.
2. `classification`: Task and intent classification.
3. `retrieval`: AST symbol mapping and vector/keyword retrieval.
4. `toolExecution`: AST scanning, git diff computation, test discovery.
5. `llm`: Language model network latency and inference generation.
6. `validation`: Patch syntax validation, evidence citation checking.

The `LatencyTracker` computes total latency, identifies the primary bottleneck layer, and aggregates `p50`, `p90`, `p95`, and `p99` percentiles.

---

## 4. Usage Telemetry & Correlation IDs

Every evaluation or query execution records a structured `UsageRecord`:
- `requestId`: Distributed tracing UUID.
- `projectId`: Multi-tenant project identifier.
- `benchmarkRunId`: Linked benchmark run (if executed during evaluation).
- `caseId`: Linked benchmark case (if applicable).
- `promptTokens` & `completionTokens`: Token counts.
- `estimatedCostUsd`: Computed financial cost.
- `redactedPromptSnippet`: Safe, secret-redacted preview for audit logs.
