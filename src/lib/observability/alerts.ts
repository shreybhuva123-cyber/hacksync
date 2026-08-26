import { metrics } from "./metrics";
import { logger } from "./logger";

export interface AlertRule {
  id: string;
  name: string;
  metricName: string;
  threshold: number;
  type: "latency_p95" | "counter_above";
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface TriggeredAlert {
  ruleId: string;
  name: string;
  severity: "critical" | "warning" | "info";
  currentValue: number;
  threshold: number;
  triggeredAt: string;
  message: string;
}

export const PRODUCTION_ALERT_RULES: AlertRule[] = [
  {
    id: "p95-api-latency",
    name: "P95 API Latency Breach",
    metricName: "api_latency_ms",
    threshold: 500,
    type: "latency_p95",
    severity: "warning",
    message: "P95 API latency exceeded 500ms SLA target.",
  },
  {
    id: "auth-brute-force",
    name: "Excessive Auth Failures",
    metricName: "auth_failures",
    threshold: 5,
    type: "counter_above",
    severity: "critical",
    message: "High volume of failed authentication attempts detected.",
  },
  {
    id: "rate-limit-breach",
    name: "Rate Limit Spike",
    metricName: "rate_limit_exceeded",
    threshold: 10,
    type: "counter_above",
    severity: "warning",
    message: "Rate limit breaches exceeded safety threshold.",
  },
];

export class AlertManager {
  private rules: AlertRule[] = [...PRODUCTION_ALERT_RULES];
  private triggeredAlerts: TriggeredAlert[] = [];

  /**
   * Evaluate all rules against live metrics and return active alerts
   */
  evaluate(): TriggeredAlert[] {
    const active: TriggeredAlert[] = [];

    for (const rule of this.rules) {
      let value = 0;

      if (rule.type === "latency_p95") {
        value = metrics.getPercentile(rule.metricName, 95);
      } else if (rule.type === "counter_above") {
        value = metrics.getCounter(rule.metricName);
      }

      if (value > rule.threshold) {
        const alert: TriggeredAlert = {
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          currentValue: value,
          threshold: rule.threshold,
          triggeredAt: new Date().toISOString(),
          message: `${rule.message} (Current value: ${value}, Threshold: ${rule.threshold})`,
        };
        active.push(alert);
        this.triggeredAlerts.unshift(alert);

        logger.warn(`[ALERT_TRIGGERED] ${rule.name}`, {
          ruleId: rule.id,
          currentValue: value,
          threshold: rule.threshold,
          severity: rule.severity,
        });
      }
    }

    return active;
  }

  getTriggeredAlerts(): TriggeredAlert[] {
    return this.triggeredAlerts;
  }

  clear(): void {
    this.triggeredAlerts = [];
  }
}

export const alertManager = new AlertManager();
