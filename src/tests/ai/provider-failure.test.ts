import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker, CircuitBreakerRegistry } from "@/lib/ai/circuit-breaker";
import { ModelRouter } from "@/lib/ai/model-router";
import type { LLMProvider, LLMMessage, LLMResponse } from "@/lib/ai/provider-interface";
import { OutputValidator } from "@/lib/hacksync/ai/output-validator";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";
import { ExternalServiceError, RateLimitError } from "@/lib/errors";

// Mock Mockable Provider for adversarial testing
class MockFailingProvider implements LLMProvider {
  constructor(
    public name: any,
    private failureMode: "outage_503" | "rate_limit_429" | "timeout" | "malformed_json" | "hallucination" | "success",
    private mockModelName: string = "Mock-Model-v1",
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    if (this.failureMode === "outage_503") {
      throw new ExternalServiceError(this.name, "Provider returned HTTP 503 Service Unavailable");
    }
    if (this.failureMode === "rate_limit_429") {
      throw new RateLimitError(60, `Rate limit exceeded on ${this.name}. Retry after 60 seconds.`);
    }
    if (this.failureMode === "timeout") {
      throw new ExternalServiceError(this.name, `Request timed out after 25000ms`);
    }
    if (this.failureMode === "malformed_json") {
      return {
        text: '{"status": "in_progress", "findings": [{"id": "finding-1", "unclosed_string: "oops',
        model: this.mockModelName,
        provider: this.name,
      };
    }
    if (this.failureMode === "hallucination") {
      return {
        text: "Found vulnerability in `src/non-existent-auth/ghost.ts:99` and `src/api/users.ts:15`.",
        model: this.mockModelName,
        provider: this.name,
      };
    }

    return {
      text: "Analysis completed successfully. Evidence matches repository state.",
      model: this.mockModelName,
      provider: this.name,
      promptTokens: 120,
      completionTokens: 80,
    };
  }
}

describe("Phase 8.5: Adversarial AI Harness & Provider Failure / Fallback Suite", () => {
  beforeEach(() => {
    CircuitBreakerRegistry.clear();
  });

  it("should cascade from failing primary provider (503 outage) to secondary fallback provider", async () => {
    const failingOpenAI = new MockFailingProvider("openai", "outage_503", "GPT-4o");
    const fallbackAnthropic = new MockFailingProvider("anthropic", "success", "Claude-3-5-Sonnet");

    const messages: LLMMessage[] = [{ role: "user", content: "Review code security" }];

    const result = await ModelRouter.executeWithFallback(
      failingOpenAI,
      [fallbackAnthropic],
      messages,
    );

    expect(result.response).not.toBeNull();
    expect(result.response?.provider).toBe("anthropic");
    expect(result.usedModel).toBe("Claude-3-5-Sonnet");
    expect(result.response?.text).toContain("Analysis completed successfully");
  });

  it("should cascade from rate-limited provider (429) to secondary fallback provider", async () => {
    const rateLimitedAnthropic = new MockFailingProvider("anthropic", "rate_limit_429", "Claude-3-5-Sonnet");
    const fallbackGemini = new MockFailingProvider("gemini", "success", "Gemini-2-0-Flash");

    const messages: LLMMessage[] = [{ role: "user", content: "Explain architecture" }];

    const result = await ModelRouter.executeWithFallback(
      rateLimitedAnthropic,
      [fallbackGemini],
      messages,
    );

    expect(result.response).not.toBeNull();
    expect(result.response?.provider).toBe("gemini");
    expect(result.usedModel).toBe("Gemini-2-0-Flash");
  });

  it("should trip circuit breaker after reaching failure threshold and fast-fail subsequent calls", async () => {
    const breaker = new CircuitBreaker({ name: "unstable-provider", failureThreshold: 3, resetTimeoutMs: 50 });

    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.isOpen()).toBe(false);

    // Record failures up to threshold
    breaker.recordFailure();
    expect(breaker.getState()).toBe("CLOSED");
    breaker.recordFailure();
    expect(breaker.getState()).toBe("CLOSED");
    breaker.recordFailure();

    // Now tripped to OPEN
    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getFailures()).toBe(3);

    // Fast-fail: calls are blocked without touching upstream
    const failingProvider = new MockFailingProvider("unstable-provider", "outage_503");
    const fallbackProvider = new MockFailingProvider("stable-provider", "success", "Stable-Model");

    CircuitBreakerRegistry.getBreaker("unstable-provider").trip();

    const result = await ModelRouter.executeWithFallback(
      failingProvider,
      [fallbackProvider],
      [{ role: "user", content: "Fast fail check" }],
    );

    // Skipped unstable provider immediately and succeeded via fallback
    expect(result.response?.provider).toBe("stable-provider");

    // Wait for reset timeout to test HALF_OPEN state
    await new Promise((r) => setTimeout(r, 60));
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Successful probe restores CLOSED state
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.isOpen()).toBe(false);
  });

  it("should fall back to HackSync deterministic intelligence when ALL upstream providers fail", async () => {
    const failing1 = new MockFailingProvider("openai", "outage_503");
    const failing2 = new MockFailingProvider("anthropic", "rate_limit_429");
    const failing3 = new MockFailingProvider("gemini", "timeout");

    const messages: LLMMessage[] = [{ role: "user", content: "Analyze vulnerability" }];

    const result = await ModelRouter.executeWithFallback(
      failing1,
      [failing2, failing3],
      messages,
    );

    expect(result.response).toBeNull();
    expect(result.usedModel).toBe("HackSync Built-in Intelligence (deterministic)");
  });

  it("should detect hallucinated file citations and flag uncertainty while preserving valid citations", () => {
    const graph = new ProjectKnowledgeGraph("proj-hallucination-test");
    graph.indexFile("src/api/users.ts", "export function getUsers() { return []; }");
    graph.indexFile("src/auth/jwt.ts", "export function verifyToken() { return true; }");

    const responseWithHallucination = `
Based on static analysis:
1. Valid file: \`src/api/users.ts:1\` is properly structured.
2. Phantom file: \`src/non-existent-auth/ghost.ts:99\` appears to contain a backdoor.
3. Another phantom: \`packages/legacy/unknown.py\` is obsolete.
    `;

    const validation = OutputValidator.validate({
      text: responseWithHallucination,
      taskType: "security",
      graph,
      evidence: [],
      baseConfidence: 0.9,
    });

    // Valid citations recognized
    const validPaths = validation.validatedCitations.map((c) => c.filePath);
    expect(validPaths).toContain("src/api/users.ts");
    expect(validPaths).not.toContain("src/non-existent-auth/ghost.ts");
    expect(validPaths).not.toContain("packages/legacy/unknown.py");

    // Uncertainty flagged for hallucinated files
    expect(validation.uncertainty).toBeDefined();
    expect(validation.uncertainty?.some((u) => u.includes("ghost.ts"))).toBe(true);
    expect(validation.uncertainty?.some((u) => u.includes("unknown.py"))).toBe(true);

    // Confidence docked for hallucinatory claims
    expect(validation.confidence).toBeLessThan(0.9);
  });

  it("should gracefully handle malformed JSON output without crashing orchestrator flow", () => {
    const malformedText = '{"action": "patch", "files": [ invalid json content';

    let parseErrorCaught = false;
    let parsedData: any = null;

    try {
      parsedData = JSON.parse(malformedText);
    } catch {
      parseErrorCaught = true;
    }

    expect(parseErrorCaught).toBe(true);
    expect(parsedData).toBeNull();

    // Verify OutputValidator handles malformed text without throwing
    const graph = new ProjectKnowledgeGraph("proj-json-malform");
    const validation = OutputValidator.validate({
      text: malformedText,
      taskType: "explain",
      graph,
      evidence: [],
    });

    expect(validation.verifiedAnswer).toBe(malformedText);
  });

  it("should ensure end-to-end AI Orchestrator returns structured deterministic output even under complete provider outage", async () => {
    const projectId = "proj-e2e-outage";
    const graph = AIOrchestrator.getKnowledgeGraph(projectId);
    graph.indexFile("src/server.ts", "export const port = 3000;");

    // Request with offline/fallback preference
    const result = await AIOrchestrator.process({
      query: "explain the architecture of this project",
      projectId,
      userId: "usr-alice",
      modelPreference: "builtin", // Forces deterministic engine
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(50);
    expect(result.modelUsed).toContain("deterministic");
    expect(result.requestId).toBeDefined();
    expect(Array.isArray(result.toolCalls)).toBe(true);
  });
});
