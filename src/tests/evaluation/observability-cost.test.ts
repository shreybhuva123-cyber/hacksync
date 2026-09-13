import { describe, expect, it } from "bun:test";
import { CostTracker } from "@/lib/hacksync/observability/cost-tracker";
import { LatencyTracker } from "@/lib/hacksync/observability/latency-tracker";
import { UsageTracker } from "@/lib/hacksync/observability/usage-tracker";

describe("Phase 6: Observability, Cost Tracking & Latency Profiling", () => {
  describe("CostTracker", () => {
    it("should calculate exact costs for known models in the pricing catalog", () => {
      // OpenAI gpt-4o: $2.50 / 1M in, $10.00 / 1M out
      const gpt4oCost = CostTracker.calculateCost("openai", "gpt-4o", 1_000_000, 500_000);
      expect(gpt4oCost).toBe(7.50); // 2.50 + 5.00 = 7.50

      // Anthropic claude-3-5-sonnet: $3.00 / 1M in, $15.00 / 1M out
      const claudeCost = CostTracker.calculateCost("anthropic", "claude-3-5-sonnet", 100_000, 20_000);
      // (100k / 1M)*3 + (20k / 1M)*15 = 0.30 + 0.30 = 0.60
      expect(claudeCost).toBe(0.60);

      // Ollama / local models: $0.00
      const ollamaCost = CostTracker.calculateCost("ollama", "llama3", 500_000, 200_000);
      expect(ollamaCost).toBe(0.0);
    });

    it("should return 'unavailable' and never invent numbers for unknown models or missing token counts", () => {
      // Unknown model
      const unknownCost = CostTracker.calculateCost("unknown_provider", "unknown_model", 10_000, 5_000);
      expect(unknownCost).toBe("unavailable");

      // Missing token counts
      const missingInputCost = CostTracker.calculateCost("openai", "gpt-4o", undefined, 5_000);
      expect(missingInputCost).toBe("unavailable");

      const missingOutputCost = CostTracker.calculateCost("openai", "gpt-4o", 10_000, undefined);
      expect(missingOutputCost).toBe("unavailable");
    });

    it("should allow dynamic registration of custom model pricing", () => {
      CostTracker.registerPricing({
        provider: "custom-cloud",
        model: "deepseek-coder",
        inputCostPerMillionTokens: 0.50,
        outputCostPerMillionTokens: 1.50,
        effectiveFrom: "2026-03-01",
      });

      const cost = CostTracker.calculateCost("custom-cloud", "deepseek-coder", 2_000_000, 1_000_000);
      expect(cost).toBe(2.50); // (2 * 0.5) + (1 * 1.5) = 2.50
    });
  });

  describe("LatencyTracker", () => {
    it("should record layered latencies and accurately identify the bottleneck layer", () => {
      const profile = LatencyTracker.recordLatency({
        gatewayMs: 15,
        classificationMs: 25,
        retrievalMs: 150,
        toolExecutionMs: 80,
        llmMs: 1850, // Major bottleneck
        validationMs: 30,
      });

      expect(profile.totalMs).toBe(2150);
      expect(profile.bottleneckLayer).toBe("llm");
      expect(profile.retrievalMs).toBe(150);
    });

    it("should identify retrieval or tool execution as bottleneck when applicable", () => {
      const profile = LatencyTracker.recordLatency({
        gatewayMs: 10,
        classificationMs: 10,
        retrievalMs: 850, // Heavy AST indexing bottleneck
        toolExecutionMs: 100,
        llmMs: 200,
        validationMs: 10,
      });

      expect(profile.bottleneckLayer).toBe("retrieval");
    });
  });

  describe("UsageTracker", () => {
    it("should record usage with correlation IDs and redact secrets from prompt summaries", () => {
      const syntheticToken = ["sk", "live", "99887766554433221100"].join("_");
      const sensitivePrompt = `Analyze user token: Bearer ${syntheticToken} for repository access.`;

      const record = UsageTracker.recordUsage({
        projectId: "proj-obs-001",
        requestId: "req-trace-12345",
        benchmarkRunId: "bench-run-99",
        caseId: "case-01",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        inputTokens: 1000,
        outputTokens: 200,
        latencyMs: 450,
        toolCalls: 2,
        promptSummary: sensitivePrompt,
      });

      expect(record.projectId).toBe("proj-obs-001");
      expect(record.requestId).toBe("req-trace-12345");
      expect(record.benchmarkRunId).toBe("bench-run-99");
      expect(record.caseId).toBe("case-01");
      expect(record.estimatedCost).toBeNumber();

      // Secrets must be redacted
      expect(record.redactedPromptSummary).toBeDefined();
      expect(record.redactedPromptSummary).not.toContain(syntheticToken);
      expect(record.redactedPromptSummary).toContain("[REDACTED_");
    });

    it("should retrieve correlated records by projectId or benchmarkRunId", () => {
      const projectId = "proj-filter-" + Date.now();
      const benchmarkRunId = "bench-filter-" + Date.now();

      UsageTracker.recordUsage({
        projectId,
        requestId: "req-1",
        benchmarkRunId,
        provider: "builtin",
        model: "deterministic",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 20,
      });

      const records = UsageTracker.getRecordsByProjectId(projectId);
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records[0]?.projectId).toBe(projectId);

      const runRecords = UsageTracker.getRecordsByRunId(benchmarkRunId);
      expect(runRecords.length).toBeGreaterThanOrEqual(1);
      expect(runRecords[0]?.benchmarkRunId).toBe(benchmarkRunId);
    });
  });
});
