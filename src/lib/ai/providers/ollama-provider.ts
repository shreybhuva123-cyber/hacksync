/**
 * SERVER ONLY — Local Ollama LLM Provider
 * Enables zero-cloud, privacy-preserving local LLM inference.
 */

import type { LLMMessage, LLMResponse, LLMProvider, AIProviderName } from "../provider-interface";
import { getServerEnv, isProviderConfigured } from "@/lib/config/server-env";
import { SecretRedactor } from "@/lib/hacksync/security/secret-redactor";
import { ExternalServiceError, logger } from "@/lib/errors";

export class OllamaProvider implements LLMProvider {
  name: AIProviderName = "ollama";
  private defaultBaseUrl = "http://127.0.0.1:11434";

  private getBaseUrl(): string {
    const env = getServerEnv();
    return env.OLLAMA_BASE_URL || process.env["OLLAMA_HOST"] || this.defaultBaseUrl;
  }

  isAvailable(): boolean {
    return isProviderConfigured("ollama");
  }

  async chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string; timeoutMs?: number },
  ): Promise<LLMResponse> {
    const baseUrl = this.getBaseUrl();
    const modelName = options?.model || "llama3";
    const timeoutMs = options?.timeoutMs ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: chatMessages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 2048,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        logger.error(`[OllamaProvider] Upstream HTTP ${res.status}`);
        throw new ExternalServiceError("Ollama", `Local Ollama returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      const text = data?.message?.content ?? "";
      const promptTokens = data?.prompt_eval_count || Math.ceil(JSON.stringify(chatMessages).length / 4);
      const completionTokens = data?.eval_count || Math.ceil(text.length / 4);

      const { redactedText } = SecretRedactor.redact(text);

      return {
        text: redactedText,
        model: modelName,
        provider: "ollama",
        promptTokens,
        completionTokens,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new ExternalServiceError("Ollama", `Request timed out after ${timeoutMs}ms`);
      }
      const sanitized = SecretRedactor.redact(err.message || String(err)).redactedText;
      logger.error("[OllamaProvider] Execution failed", { error: sanitized });
      throw new ExternalServiceError("Ollama", `Request failed: ${sanitized}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
