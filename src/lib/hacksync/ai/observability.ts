/**
 * AI Observability & Cost Controller
 * Tracks request IDs, latency, token estimation, model costs, and usage limits.
 */

export interface AIRequestMetrics {
  requestId: string;
  userId: string;
  projectId: string;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  toolCallsCount: number;
  status: "success" | "error" | "rate_limited" | "timeout";
  errorMessage?: string | undefined;
  timestamp: string;
}

// Model pricing per 1M tokens ($USD)
const PRICING_TABLE: Record<string, { prompt: number; completion: number }> = {
  "gemini-2.0-flash": { prompt: 0.10, completion: 0.40 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.60 },
  "builtin": { prompt: 0.0, completion: 0.0 }, // Local deterministic analysis is $0.00
};

export class AIObservability {
  private static metricsStore: AIRequestMetrics[] = [];

  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  static estimateTokens(text: string): number {
    if (!text) return 0;
    // Standard rule-of-thumb: ~4 characters per token in code/English
    return Math.ceil(text.length / 4);
  }

  static calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const rate = PRICING_TABLE[model] || PRICING_TABLE["builtin"]!;
    const promptCost = (promptTokens / 1_000_000) * rate.prompt;
    const compCost = (completionTokens / 1_000_000) * rate.completion;
    return Number((promptCost + compCost).toFixed(6));
  }

  static recordMetrics(metrics: Omit<AIRequestMetrics, "timestamp">): AIRequestMetrics {
    const full: AIRequestMetrics = {
      ...metrics,
      timestamp: new Date().toISOString(),
    };
    this.metricsStore.unshift(full);
    if (this.metricsStore.length > 200) {
      this.metricsStore.pop();
    }
    return full;
  }

  static getMetricsSummary(projectId?: string) {
    const relevant = projectId
      ? this.metricsStore.filter((m) => m.projectId === projectId)
      : this.metricsStore;

    if (relevant.length === 0) {
      return {
        totalRequests: 0,
        avgLatencyMs: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        successRatePct: 100,
      };
    }

    const totalTokens = relevant.reduce((sum, m) => sum + m.totalTokens, 0);
    const totalCostUsd = Number(
      relevant.reduce((sum, m) => sum + m.estimatedCostUsd, 0).toFixed(4),
    );
    const avgLatencyMs = Math.round(
      relevant.reduce((sum, m) => sum + m.latencyMs, 0) / relevant.length,
    );
    const successful = relevant.filter((m) => m.status === "success").length;
    const successRatePct = Math.round((successful / relevant.length) * 100);

    return {
      totalRequests: relevant.length,
      avgLatencyMs,
      totalTokens,
      totalCostUsd,
      successRatePct,
    };
  }
}
