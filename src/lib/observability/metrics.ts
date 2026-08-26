/**
 * Production Metrics Engine
 * Tracks real-time API latencies, query durations, error counters,
 * and computes P50, P95, and P99 metrics.
 */

export interface MetricSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

class MetricsEngine {
  private histograms: Map<string, number[]> = new Map();
  private counters: Map<string, number> = new Map();
  private readonly maxSamples = 1000;

  /**
   * Record a latency measurement (in milliseconds)
   */
  recordLatency(name: string, durationMs: number): void {
    const samples = this.histograms.get(name) ?? [];
    samples.push(durationMs);
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
    this.histograms.set(name, samples);
  }

  /**
   * Increment an event counter (e.g. failed_logins, rate_limit_hits)
   */
  incrementCounter(name: string, amount = 1): number {
    const current = this.counters.get(name) ?? 0;
    const next = current + amount;
    this.counters.set(name, next);
    return next;
  }

  /**
   * Get total count for a named counter
   */
  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /**
   * Compute percentile for a named histogram
   */
  getPercentile(name: string, percentile: number): number {
    const samples = this.histograms.get(name);
    if (!samples || samples.length === 0) return 0;

    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor((percentile / 100) * sorted.length)),
    );
    return sorted[index] ?? 0;
  }

  /**
   * Get full summary metrics for a histogram
   */
  getSummary(name: string): MetricSummary {
    const samples = this.histograms.get(name) ?? [];
    if (samples.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sum = samples.reduce((acc, val) => acc + val, 0);
    const sorted = [...samples].sort((a, b) => a - b);

    return {
      count: samples.length,
      avg: Math.round((sum / samples.length) * 100) / 100,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      p50: this.getPercentile(name, 50),
      p95: this.getPercentile(name, 95),
      p99: this.getPercentile(name, 99),
    };
  }

  /**
   * Clear all recorded metrics (for test isolation)
   */
  clear(): void {
    this.histograms.clear();
    this.counters.clear();
  }
}

export const metrics = new MetricsEngine();
