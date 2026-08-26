import { describe, it, expect, beforeEach } from "bun:test";
import { metrics } from "@/lib/observability/metrics";
import { alertManager } from "@/lib/observability/alerts";
import { auditLogger } from "@/lib/security/audit-logger";

describe("Observability & Metrics Engine", () => {
  beforeEach(() => {
    metrics.clear();
    alertManager.clear();
    auditLogger.clear();
  });

  it("should record latencies and compute P50, P95, and P99 percentiles correctly", () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const lat of latencies) {
      metrics.recordLatency("api_latency_ms", lat);
    }

    const summary = metrics.getSummary("api_latency_ms");
    expect(summary.count).toBe(10);
    expect(summary.min).toBe(10);
    expect(summary.max).toBe(100);
    expect(summary.p50).toBeGreaterThanOrEqual(50);
    expect(summary.p95).toBeGreaterThanOrEqual(90);
  });

  it("should increment event counters accurately", () => {
    expect(metrics.getCounter("auth_failures")).toBe(0);
    metrics.incrementCounter("auth_failures");
    metrics.incrementCounter("auth_failures");
    expect(metrics.getCounter("auth_failures")).toBe(2);
  });

  it("should trigger automated alerts when metrics breach thresholds", () => {
    // Record latencies exceeding threshold (threshold = 500ms)
    for (let i = 0; i < 20; i++) {
      metrics.recordLatency("api_latency_ms", 650);
    }

    const alerts = alertManager.evaluate();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => a.ruleId === "p95-api-latency")).toBe(true);
  });

  it("should record structured security audit logs", () => {
    const entry = auditLogger.log({
      action: "AUTH_LOGIN_SUCCESS",
      actorId: "usr-99",
      status: "SUCCESS",
      metadata: { method: "oauth" },
    });

    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.action).toBe("AUTH_LOGIN_SUCCESS");

    const recent = auditLogger.getRecentLogs();
    expect(recent.length).toBe(1);
    expect(recent[0].actorId).toBe("usr-99");
  });
});
