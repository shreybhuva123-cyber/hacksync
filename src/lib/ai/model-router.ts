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

// ─── SERVER ONLY: GOOGLE GEMINI PROVIDER ─────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  name: AIProviderName = "gemini";

  isAvailable(): boolean {
    return isProviderConfigured("gemini");
  }

  async chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("Gemini", "GEMINI_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "gemini-2.0-flash";
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages.filter((m) => m.role !== "system");

    const contents = chatMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Pass API key via header or query param server-side only
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

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Sanitize error: never return raw body or URL with key
        logger.error(`[GeminiProvider] Upstream HTTP ${res.status}`);
        throw new ExternalServiceError("Gemini", `Provider returned HTTP ${res.status}`);
      }

      const data = await res.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const promptTokens = data?.usageMetadata?.promptTokenCount || Math.ceil(JSON.stringify(contents).length / 4);
      const completionTokens = data?.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

      // Sanitize LLM response before returning
      const { redactedText } = SecretRedactor.redact(text);

      return {
        text: redactedText,
        model: modelName,
        provider: "gemini",
        promptTokens,
        completionTokens,
      };
    } catch (err: any) {
      const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
      logger.error("[GeminiProvider] Execution failed", { error: sanitized });
      throw new ExternalServiceError("Gemini", `Request failed: ${sanitized}`);
    }
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
    options?: { temperature?: number; maxTokens?: number; model?: string },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("OpenAI", "OPENAI_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "gpt-4o-mini";

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
      });

      if (!res.ok) {
        logger.error(`[OpenAIProvider] Upstream HTTP ${res.status}`);
        throw new ExternalServiceError("OpenAI", `Provider returned HTTP ${res.status}`);
      }

      const data = await res.json() as any;
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
      const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
      logger.error("[OpenAIProvider] Execution failed", { error: sanitized });
      throw new ExternalServiceError("OpenAI", `Request failed: ${sanitized}`);
    }
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
    options?: { temperature?: number; maxTokens?: number; model?: string },
  ): Promise<LLMResponse> {
    const env = getServerEnv();
    const apiKey = env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError("Anthropic", "ANTHROPIC_API_KEY is not configured on the server.");
    }

    const modelName = options?.model || "claude-3-5-sonnet-20241022";
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages.filter((m) => m.role !== "system");

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
      });

      if (!res.ok) {
        logger.error(`[AnthropicProvider] Upstream HTTP ${res.status}`);
        throw new ExternalServiceError("Anthropic", `Provider returned HTTP ${res.status}`);
      }

      const data = await res.json() as any;
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
      const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
      logger.error("[AnthropicProvider] Execution failed", { error: sanitized });
      throw new ExternalServiceError("Anthropic", `Request failed: ${sanitized}`);
    }
  }
}

// ─── SERVER ONLY: MODEL ROUTER ──────────────────────────────────────────────

export class ModelRouter {
  private static gemini = new GeminiProvider();
  private static openai = new OpenAIProvider();
  private static anthropic = new AnthropicProvider();

  /**
   * Selects the best available server-side LLM provider based on request preference and availability.
   * Returns provider and modelName. Provider is null if built-in offline analysis should be used.
   */
  static getBestProvider(
    preference?: string,
    intent?: string,
  ): { provider: LLMProvider | null; modelName: string } {
    const pref = (preference || "builtin").toLowerCase();

    // 1. Explicit user preference on server
    if (pref === "gemini" || pref.includes("gemini") || pref === "gemini-2.0-flash") {
      if (this.gemini.isAvailable()) {
        return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash" };
      }
    }

    if (pref === "openai" || pref.includes("gpt") || pref === "gpt-4o-mini") {
      if (this.openai.isAvailable()) {
        return { provider: this.openai, modelName: "OpenAI GPT-4o Mini" };
      }
    }

    if (pref === "anthropic" || pref.includes("claude")) {
      if (this.anthropic.isAvailable()) {
        return { provider: this.anthropic, modelName: "Anthropic Claude 3.5 Sonnet" };
      }
    }

    // 2. Intent-based intelligent routing if an external provider is configured
    if (pref === "auto") {
      if (intent === "architecture" || intent === "security") {
        if (this.anthropic.isAvailable()) {
          return { provider: this.anthropic, modelName: "Anthropic Claude 3.5 Sonnet" };
        }
        if (this.openai.isAvailable()) {
          return { provider: this.openai, modelName: "OpenAI GPT-4o Mini" };
        }
        if (this.gemini.isAvailable()) {
          return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash" };
        }
      }
      if (this.gemini.isAvailable()) {
        return { provider: this.gemini, modelName: "Google Gemini 2.0 Flash" };
      }
      if (this.openai.isAvailable()) {
        return { provider: this.openai, modelName: "OpenAI GPT-4o Mini" };
      }
    }

    // 3. Fallback: null provider triggers the Built-in Deep Reasoning Engine
    return { provider: null, modelName: "HackSync Built-in Intelligence (deterministic)" };
  }
}
