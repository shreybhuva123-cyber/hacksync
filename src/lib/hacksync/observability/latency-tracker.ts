/**
 * HackSync Phase 6: Layered Latency Tracker & Bottleneck Profiler
 * Tracks exact execution durations across the AI pipeline:
 * Gateway -> Classification -> Retrieval -> Tool Execution -> LLM -> Validation -> Total.
 */

export interface LayeredLatency {
  gatewayMs: number;
  classificationMs: number;
  retrievalMs: number;
  toolExecutionMs: number;
  llmMs: number;
  validationMs: number;
  totalMs: number;
  bottleneckLayer: string;
}

export class LatencyTracker {
  /**
   * Constructs a structured LayeredLatency record and identifies the primary bottleneck layer.
   */
  static recordLatency(layers: {
    gatewayMs?: number | undefined;
    classificationMs?: number | undefined;
    retrievalMs?: number | undefined;
    toolExecutionMs?: number | undefined;
    llmMs?: number | undefined;
    validationMs?: number | undefined;
    totalMs?: number | undefined;
  }): LayeredLatency {
    const gatewayMs = Math.max(0, layers.gatewayMs || 0);
    const classificationMs = Math.max(0, layers.classificationMs || 0);
    const retrievalMs = Math.max(0, layers.retrievalMs || 0);
    const toolExecutionMs = Math.max(0, layers.toolExecutionMs || 0);
    const llmMs = Math.max(0, layers.llmMs || 0);
    const validationMs = Math.max(0, layers.validationMs || 0);

    const sumMs = gatewayMs + classificationMs + retrievalMs + toolExecutionMs + llmMs + validationMs;
    const totalMs = layers.totalMs !== undefined ? Math.max(layers.totalMs, sumMs) : sumMs;

    // Identify bottleneck
    const layerMap: Record<string, number> = {
      gateway: gatewayMs,
      classification: classificationMs,
      retrieval: retrievalMs,
      tool_execution: toolExecutionMs,
      llm: llmMs,
      validation: validationMs,
    };

    let bottleneckLayer = "llm";
    let maxVal = -1;
    for (const [layer, val] of Object.entries(layerMap)) {
      if (val > maxVal) {
        maxVal = val;
        bottleneckLayer = layer;
      }
    }

    return {
      gatewayMs,
      classificationMs,
      retrievalMs,
      toolExecutionMs,
      llmMs,
      validationMs,
      totalMs,
      bottleneckLayer,
    };
  }

  /**
   * Computes P50, P90, P95, and P99 percentiles from a series of latencies.
   */
  static calculatePercentiles(latencies: number[]): {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    if (!latencies || latencies.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const getPercentile = (p: number): number => {
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] || 0;
    };

    return {
      p50: getPercentile(50),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }
}
