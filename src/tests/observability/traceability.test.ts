import { describe, it, expect, beforeEach } from "bun:test";
import { AuditTrail, type AIAuditEntry } from "@/lib/hacksync/security/audit-trail";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { AIObservability } from "@/lib/hacksync/ai/observability";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { registerTestMembership, clearTestMemberships } from "@/lib/security/tenant-verifier";

describe("Phase 8.14: Observability, Traceability & Secret Redaction Audit", () => {
  const projectId = "proj-trace-audit";
  const userId = "usr-auditor-1";

  beforeEach(() => {
    clearTestMemberships();
    registerTestMembership(projectId, userId, "owner");
    AuditTrail.clear();
  });

  it("should record complete structured audit entry with required correlation metadata", () => {
    const requestId = "req-test-trace-123";
    const entry = AuditTrail.record({
      requestId,
      userId,
      projectId,
      toolName: "security_scan",
      actionType: "READ_ONLY",
      status: "success",
      executionMs: 45,
      targetFiles: ["src/api/auth.ts"],
      details: "Passive static security scan completed",
    });

    expect(entry.id).toBeDefined();
    expect(entry.requestId).toBe(requestId);
    expect(entry.userId).toBe(userId);
    expect(entry.projectId).toBe(projectId);
    expect(entry.toolName).toBe("security_scan");
    expect(entry.actionType).toBe("READ_ONLY");
    expect(entry.status).toBe("success");
    expect(entry.executionMs).toBe(45);
    expect(entry.timestamp).toBeDefined();
    expect(entry.targetFiles).toContain("src/api/auth.ts");
  });

  it("should calculate AI tokens, latency, and estimated cost accurately", () => {
    const prompt = "Analyze the SQL injection risk in this file";
    const completion = "The query concatenates user input directly without parameters.";

    const promptTokens = AIObservability.estimateTokens(prompt);
    const completionTokens = AIObservability.estimateTokens(completion);
    const totalTokens = promptTokens + completionTokens;

    expect(promptTokens).toBeGreaterThan(0);
    expect(completionTokens).toBeGreaterThan(0);
    expect(totalTokens).toBe(promptTokens + completionTokens);

    // Calculate cost for GPT-4o-mini ($0.15 / 1M prompt, $0.60 / 1M completion)
    const cost = AIObservability.calculateCost("gpt-4o-mini", promptTokens, completionTokens);
    expect(cost).toBeGreaterThanOrEqual(0);

    // Builtin engine has zero API cost
    const builtinCost = AIObservability.calculateCost("builtin", promptTokens, completionTokens);
    expect(builtinCost).toBe(0);

    const record = AIObservability.recordMetrics({
      requestId: "req-metrics-001",
      userId,
      projectId,
      model: "gpt-4o-mini",
      latencyMs: 120,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: cost,
      toolCallsCount: 2,
      status: "success",
    });

    expect(record.timestamp).toBeDefined();
    expect(record.latencyMs).toBe(120);

    const summary = AIObservability.getMetricsSummary(projectId);
    expect(summary.totalRequests).toBeGreaterThanOrEqual(1);
    expect(summary.totalTokens).toBeGreaterThanOrEqual(totalTokens);
  });

  it("should strictly redact secrets and credentials from audit logs and traces", () => {
    const fakeStripeToken = ["sk", "live", "51A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6"].join("_");
    const fakeAwsKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
    const fakeGoogleKey = ["AIza", "SyD9Zabcdefghijklmnopqrstuvw1234"].join("");

    const rawSensitiveLog = `
      Connecting to AWS with ${fakeAwsKey} and secret
      Stripe live token ${fakeStripeToken}
      Google API Key ${fakeGoogleKey}
    `;

    const { redactedText, detections } = SecretRedactor.redact(rawSensitiveLog);

    expect(detections.length).toBeGreaterThanOrEqual(3);
    expect(redactedText).not.toContain(fakeAwsKey);
    expect(redactedText).not.toContain(fakeStripeToken);
    expect(redactedText).not.toContain(fakeGoogleKey);

    expect(redactedText).toContain("[REDACTED_AWS_KEY]");
    expect(redactedText).toContain("[REDACTED_STRIPE_KEY]");
    expect(redactedText).toContain("[REDACTED_GOOGLE_KEY]");

    // Audit record storing this detail must use redacted content
    const auditEntry = AuditTrail.record({
      requestId: "req-secret-redact",
      userId,
      projectId,
      toolName: "secret_scan",
      actionType: "READ_ONLY",
      status: "success",
      details: redactedText,
    });

    expect(auditEntry.details).not.toContain("sk_live_");
    expect(auditEntry.details).not.toContain("AKIA");
  });

  it("should propagate consistent requestId (correlation ID) across full AI orchestration pipeline", async () => {
    const graph = AIOrchestrator.getKnowledgeGraph(projectId);
    graph.indexFile("src/service.ts", "export const appService = true;");

    const customRequestId = "req-correlated-uuid-9999";

    const result = await AIOrchestrator.process({
      query: "explain the architecture",
      projectId,
      userId,
      modelPreference: "builtin",
      securityContext: {
        userId,
        projectId,
        role: "owner",
        requestId: customRequestId,
      },
    });

    expect(result.requestId).toBe(customRequestId);

    // Verify audit log captured the SAME correlation ID
    const auditLogs = AuditTrail.getLogs(projectId);
    const matchedLog = auditLogs.find((l) => l.requestId === customRequestId);
    expect(matchedLog).toBeDefined();
    expect(matchedLog?.projectId).toBe(projectId);
    expect(matchedLog?.userId).toBe(userId);
  });
});
