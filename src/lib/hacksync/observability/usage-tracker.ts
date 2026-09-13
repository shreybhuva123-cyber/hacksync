/**
 * HackSync Phase 6: Usage Tracker & Correlation Observability
 * Correlates AI operations across layers (requestId, projectId, benchmarkRunId, caseId, evaluationId).
 * Enforces strict redaction: NEVER logs raw API keys, passwords, or unredacted prompts.
 */

import { SecretRedactor } from "../security/secret-redactor";
import { CostTracker, type CostValue } from "./cost-tracker";

export interface ModelUsageRecord {
  id: string;
  projectId: string;
  requestId: string;
  benchmarkRunId?: string | undefined;
  caseId?: string | undefined;
  evaluationId?: string | undefined;
  provider: string;
  model: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  estimatedCost: CostValue;
  latencyMs: number;
  toolCalls: number;
  redactedPromptSummary?: string | undefined;
  timestamp: string;
}

export class UsageTracker {
  private static usageStore: ModelUsageRecord[] = [];
  private static readonly MAX_IN_MEMORY_RECORDS = 500;

  /**
   * Records a model usage event with cost calculation and correlation IDs.
   */
  static recordUsage(params: {
    projectId: string;
    requestId: string;
    benchmarkRunId?: string | undefined;
    caseId?: string | undefined;
    evaluationId?: string | undefined;
    provider: string;
    model: string;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    latencyMs: number;
    toolCalls?: number | undefined;
    promptSummary?: string | undefined;
  }): ModelUsageRecord {
    const cost = CostTracker.calculateCost(
      params.provider,
      params.model,
      params.inputTokens,
      params.outputTokens,
    );

    // Guaranteed Redaction on prompt summaries or details
    let safeSummary: string | undefined;
    if (params.promptSummary) {
      const { redactedText } = SecretRedactor.redact(params.promptSummary);
      safeSummary = redactedText;
    }

    const record: ModelUsageRecord = {
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: params.projectId,
      requestId: params.requestId,
      benchmarkRunId: params.benchmarkRunId,
      caseId: params.caseId,
      evaluationId: params.evaluationId,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: cost,
      latencyMs: params.latencyMs,
      toolCalls: params.toolCalls || 0,
      redactedPromptSummary: safeSummary,
      timestamp: new Date().toISOString(),
    };

    this.usageStore.unshift(record);
    if (this.usageStore.length > this.MAX_IN_MEMORY_RECORDS) {
      this.usageStore.pop();
    }

    return record;
  }

  /**
   * Retrieves usage records for a specific project, strictly enforcing project isolation.
   */
  static getUsageByProject(projectId: string): ModelUsageRecord[] {
    return this.usageStore.filter((r) => r.projectId === projectId);
  }

  /**
   * Retrieves usage records for a specific benchmark run.
   */
  static getUsageByBenchmarkRun(benchmarkRunId: string): ModelUsageRecord[] {
    return this.usageStore.filter((r) => r.benchmarkRunId === benchmarkRunId);
  }

  static getRecordsByProjectId(projectId: string): ModelUsageRecord[] {
    return this.getUsageByProject(projectId);
  }

  static getRecordsByRunId(benchmarkRunId: string): ModelUsageRecord[] {
    return this.getUsageByBenchmarkRun(benchmarkRunId);
  }

  /**
   * Clears the in-memory cache (primarily used for test cleanup).
   */
  static clear(): void {
    this.usageStore = [];
  }
}
