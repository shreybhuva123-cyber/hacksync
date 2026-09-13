/**
 * HackSync Phase 6: Cost Tracker & Centralized Model Pricing Catalog
 * Enforces authoritative pricing per million tokens.
 * Never invents costs: if pricing or token count is unavailable, explicitly returns 'unavailable'.
 */

export interface ModelPricing {
  provider: string;
  model: string;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  effectiveFrom: string;
}

export type CostValue = number | "unavailable";

export class CostTracker {
  // Centralized Model Pricing Catalog (Updated 2026)
  private static pricingCatalog: Map<string, ModelPricing> = new Map([
    // OpenAI Models
    [
      "openai:gpt-4o",
      {
        provider: "openai",
        model: "gpt-4o",
        inputCostPerMillionTokens: 2.50,
        outputCostPerMillionTokens: 10.00,
        effectiveFrom: "2026-01-01",
      },
    ],
    [
      "openai:gpt-4o-mini",
      {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostPerMillionTokens: 0.15,
        outputCostPerMillionTokens: 0.60,
        effectiveFrom: "2026-01-01",
      },
    ],
    // Anthropic Models
    [
      "anthropic:claude-3-5-sonnet",
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        inputCostPerMillionTokens: 3.00,
        outputCostPerMillionTokens: 15.00,
        effectiveFrom: "2026-01-01",
      },
    ],
    [
      "anthropic:claude-3-5-haiku",
      {
        provider: "anthropic",
        model: "claude-3-5-haiku",
        inputCostPerMillionTokens: 0.80,
        outputCostPerMillionTokens: 4.00,
        effectiveFrom: "2026-01-01",
      },
    ],
    // Google Gemini Models
    [
      "gemini:gemini-2.0-flash",
      {
        provider: "gemini",
        model: "gemini-2.0-flash",
        inputCostPerMillionTokens: 0.10,
        outputCostPerMillionTokens: 0.40,
        effectiveFrom: "2026-01-01",
      },
    ],
    [
      "gemini:gemini-2.0-pro",
      {
        provider: "gemini",
        model: "gemini-2.0-pro",
        inputCostPerMillionTokens: 1.25,
        outputCostPerMillionTokens: 5.00,
        effectiveFrom: "2026-01-01",
      },
    ],
    // Local / Ollama Models ($0.00 infrastructure cost)
    [
      "ollama:llama3",
      {
        provider: "ollama",
        model: "llama3",
        inputCostPerMillionTokens: 0.0,
        outputCostPerMillionTokens: 0.0,
        effectiveFrom: "2026-01-01",
      },
    ],
    [
      "builtin:deterministic",
      {
        provider: "builtin",
        model: "deterministic",
        inputCostPerMillionTokens: 0.0,
        outputCostPerMillionTokens: 0.0,
        effectiveFrom: "2026-01-01",
      },
    ],
  ]);

  /**
   * Registers or updates a model pricing entry in the catalog.
   */
  static registerPricing(pricing: ModelPricing): void {
    const key = `${pricing.provider.toLowerCase()}:${pricing.model.toLowerCase()}`;
    this.pricingCatalog.set(key, pricing);
  }

  /**
   * Retrieves pricing for a provider and model.
   */
  static getPricing(provider: string, model: string): ModelPricing | undefined {
    const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
    return this.pricingCatalog.get(key);
  }

  /**
   * Calculates total estimated cost for a request.
   * If either pricing is not found or token counts are unavailable/undefined, returns 'unavailable'.
   */
  static calculateCost(
    provider: string,
    model: string,
    inputTokens?: number | undefined,
    outputTokens?: number | undefined,
  ): CostValue {
    if (inputTokens === undefined || outputTokens === undefined) {
      return "unavailable";
    }

    const pricing = this.getPricing(provider, model);
    if (!pricing) {
      return "unavailable";
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMillionTokens;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPerMillionTokens;

    return Number((inputCost + outputCost).toFixed(6));
  }
}
