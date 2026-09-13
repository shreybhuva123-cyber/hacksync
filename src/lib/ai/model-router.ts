/**
 * SERVER ONLY — AI Model Router & Server-Side LLM Providers
 * 
 * NEVER import this file into browser/client React components.
 * All external AI API keys are read strictly from server environment variables.
 */

import type { LLMMessage, LLMResponse, LLMProvider, AIProviderName } from "./provider-interface";
import { getServerEnv, isProviderConfigured } from "../config/server-env";
import { SecretRedactor } from "../hacksync/security/secret-redactor";
import { ExternalServiceError, logger } from "../errors";
import { OllamaProvider } from "./providers/ollama-provider";
import { CircuitBreakerRegistry } from "./circuit-breaker";

export { OllamaProvider, CircuitBreakerRegistry };

/**
 * Executes an async operation with exponential backoff retry for transient network errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  maxRetries = 2,
  baseDelayMs = 400,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn(`[${providerName}] Request failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ─── SERVER ONLY: GOOGLE GEMINI PROVIDER ─────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  name: AIProviderName = "gemini";

  isAvailable(): boolean {
    return isProviderConfigured("gemini");
  }

  async chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string; timeoutMs?: number },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "gemini-2.0-flash";
    const timeoutMs = options?.timeoutMs ?? 25_000;
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages.filter((m) => m.role !== "system");

    const contents = chatMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 2048,
      },
    };

    if (systemMsg) {
      body["system_instruction"] = { parts: [{ text: systemMsg }] };
    }

    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          logger.error(`[GeminiProvider] Upstream HTTP ${res.status}`);
          throw new ExternalServiceError("Gemini", `Provider returned HTTP ${res.status}`);
        }

        const data = (await res.json()) as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const promptTokens = data?.usageMetadata?.promptTokenCount || Math.ceil(JSON.stringify(contents).length / 4);
        const completionTokens = data?.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

        const { redactedText } = SecretRedactor.redact(text);

        return {
          text: redactedText,
          model: modelName,
          provider: "gemini",
          promptTokens,
          completionTokens,
        };
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new ExternalServiceError("Gemini", `Request timed out after ${timeoutMs}ms`);
        }
        const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
        logger.error("[GeminiProvider] Execution failed", { error: sanitized });
        throw new ExternalServiceError("Gemini", `Request failed: ${sanitized}`);
      } finally {
        clearTimeout(timer);
      }
    }, "Gemini");
  }
}

// ─── SERVER ONLY: OPENAI PROVIDER ───────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  name: AIProviderName = "openai";

  isAvailable(): boolean {
    return isProviderConfigured("openai");
  }

  async chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string; timeoutMs?: number },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("OpenAI", "OPENAI_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "gpt-4o-mini";
    const timeoutMs = options?.timeoutMs ?? 25_000;

    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 2048,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          logger.error(`[OpenAIProvider] Upstream HTTP ${res.status}`);
          throw new ExternalServiceError("OpenAI", `Provider returned HTTP ${res.status}`);
        }

        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content ?? "";
        const promptTokens = data?.usage?.prompt_tokens || 0;
        const completionTokens = data?.usage?.completion_tokens || 0;

        const { redactedText } = SecretRedactor.redact(text);

        return {
          text: redactedText,
          model: modelName,
          provider: "openai",
          promptTokens,
          completionTokens,
        };
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new ExternalServiceError("OpenAI", `Request timed out after ${timeoutMs}ms`);
        }
        const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
        logger.error("[OpenAIProvider] Execution failed", { error: sanitized });
        throw new ExternalServiceError("OpenAI", `Request failed: ${sanitized}`);
      } finally {
        clearTimeout(timer);
      }
    }, "OpenAI");
  }
}

// ─── SERVER ONLY: ANTHROPIC PROVIDER ────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  name: AIProviderName = "anthropic";

  isAvailable(): boolean {
    return isProviderConfigured("anthropic");
  }

  async chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string; timeoutMs?: number },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("Anthropic", "ANTHROPIC_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "claude-3-5-sonnet-20241022";
    const timeoutMs = options?.timeoutMs ?? 25_000;
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages.filter((m) => m.role !== "system");

    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          model: modelName,
          max_tokens: options?.maxTokens ?? 2048,
          temperature: options?.temperature ?? 0.7,
          messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
        };

        if (systemMsg) {
          body["system"] = systemMsg;
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          logger.error(`[AnthropicProvider] Upstream HTTP ${res.status}`);
          throw new ExternalServiceError("Anthropic", `Provider returned HTTP ${res.status}`);
        }

        const data = (await res.json()) as any;
        const text = data?.content?.[0]?.text ?? "";
        const promptTokens = data?.usage?.input_tokens || 0;
        const completionTokens = data?.usage?.output_tokens || 0;

        const { redactedText } = SecretRedactor.redact(text);

        return {
          text: redactedText,
          model: modelName,
          provider: "anthropic",
          promptTokens,
          completionTokens,
        };
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new ExternalServiceError("Anthropic", `Request timed out after ${timeoutMs}ms`);
        }
        const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
        logger.error("[AnthropicProvider] Execution failed", { error: sanitized });
        throw new ExternalServiceError("Anthropic", `Request failed: ${sanitized}`);
      } finally {
        clearTimeout(timer);
      }
    }, "Anthropic");
  }
}

// ─── SERVER ONLY: MODEL ROUTER ──────────────────────────────────────────────

export class ModelRouter {
  private static gemini = new GeminiProvider();
  private static openai = new OpenAIProvider();
  private static anthropic = new AnthropicProvider();
  private static ollama = new OllamaProvider();

  /**
   * Returns list of all available providers in fallback priority order.
   */
  static getAvailableProviders(): LLMProvider[] {
    const list: LLMProvider[] = [];
    if (this.anthropic.isAvailable()) list.push(this.anthropic);
    if (this.openai.isAvailable()) list.push(this.openai);
    if (this.gemini.isAvailable()) list.push(this.gemini);
    if (this.ollama.isAvailable()) list.push(this.ollama);
    return list;
  }

  /**
   * Selects the best available server-side LLM provider based on request preference and availability.
   * Returns provider, modelName, and fallbackChain. Provider is null if built-in offline analysis should be used.
   */
  static getBestProvider(
    preference?: string,
    intent?: string,
  ): { provider: LLMProvider | null; modelName: string; fallbackChain: LLMProvider[] } {
    const pref = (preference || "builtin").toLowerCase();
    const allAvailable = this.getAvailableProviders();

    // 1. Explicit user preference on server
    if (pref === "gemini" || pref.includes("gemini") || pref === "gemini-2.0-flash") {
      if (this.gemini.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "gemini");
        return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash", fallbackChain: fallbacks };
      }
    }

    if (pref === "openai" || pref.includes("gpt") || pref === "gpt-4o-mini") {
      if (this.openai.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "openai");
        return { provider: this.openai, modelName: "OpenAI GPT-4o Mini", fallbackChain: fallbacks };
      }
    }

    if (pref === "anthropic" || pref.includes("claude")) {
      if (this.anthropic.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "anthropic");
        return { provider: this.anthropic, modelName: "Anthropic Claude 3.5 Sonnet", fallbackChain: fallbacks };
      }
    }

    if (pref === "ollama" || pref.includes("local") || pref.includes("llama")) {
      if (this.ollama.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "ollama");
        return { provider: this.ollama, modelName: "Local Ollama Llama 3", fallbackChain: fallbacks };
      }
    }

    // 2. Intent-based intelligent routing if an external provider is configured
    if (pref === "auto") {
      if (intent === "architecture" || intent === "security") {
        if (this.anthropic.isAvailable()) {
          const fallbacks = allAvailable.filter((p) => p.name !== "anthropic");
          return { provider: this.anthropic, modelName: "Anthropic Claude 3.5 Sonnet", fallbackChain: fallbacks };
        }
        if (this.openai.isAvailable()) {
          const fallbacks = allAvailable.filter((p) => p.name !== "openai");
          return { provider: this.openai, modelName: "OpenAI GPT-4o Mini", fallbackChain: fallbacks };
        }
        if (this.gemini.isAvailable()) {
          const fallbacks = allAvailable.filter((p) => p.name !== "gemini");
          return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash", fallbackChain: fallbacks };
        }
      }
      if (this.gemini.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "gemini");
        return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash", fallbackChain: fallbacks };
      }
      if (this.openai.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "openai");
        return { provider: this.openai, modelName: "OpenAI GPT-4o Mini", fallbackChain: fallbacks };
      }
      if (this.ollama.isAvailable()) {
        const fallbacks = allAvailable.filter((p) => p.name !== "ollama");
        return { provider: this.ollama, modelName: "Local Ollama Llama 3", fallbackChain: fallbacks };
      }
    }

    // 3. Fallback: null provider triggers the Built-in Deep Reasoning Engine
    return {
      provider: null,
      modelName: "HackSync Built-in Intelligence (deterministic)",
      fallbackChain: [],
    };
  }

  /**
   * Attempts execution on the primary provider, cascading to fallbacks if an upstream failure occurs.
   */
  static async executeWithFallback(
    primaryProvider: LLMProvider | null,
    fallbackChain: LLMProvider[],
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<{ response: LLMResponse | null; usedModel: string }> {
    const providersToTry = [
      ...(primaryProvider ? [primaryProvider] : []),
      ...fallbackChain,
    ];

    for (const provider of providersToTry) {
      const breaker = CircuitBreakerRegistry.getBreaker(provider.name);
      if (breaker.isOpen()) {
        logger.warn(
          `[ModelRouter] Circuit breaker for '${provider.name}' is OPEN. Skipping upstream call to next fallback.`,
        );
        continue;
      }

      try {
        const response = await provider.chat(messages, options);
        breaker.recordSuccess();
        return { response, usedModel: response.model };
      } catch (err: any) {
        breaker.recordFailure();
        logger.warn(`[ModelRouter] Provider '${provider.name}' failed. Trying next provider in fallback chain...`, {
          error: err.message,
        });
      }
    }

    return { response: null, usedModel: "HackSync Built-in Intelligence (deterministic)" };
  }
}
