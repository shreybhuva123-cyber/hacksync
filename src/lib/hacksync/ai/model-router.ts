import type { LLMProvider, LLMMessage, LLMResponse } from "./provider-interface";
import type { AIIntentType } from "./types";
import { AIObservability } from "./observability";

export class GeminiProvider implements LLMProvider {
  name = "Google Gemini";

  constructor(private apiKey?: string | undefined) {}

  isAvailable(): boolean {
    // Server-side: check non-VITE env vars only (VITE_ vars are public and should NOT hold API secrets)
    // Client-side: check localStorage
    const serverKey = typeof process !== "undefined" ? process.env["GEMINI_API_KEY"] : undefined;
    const clientKey = typeof window !== "undefined" ? localStorage.getItem("hacksync_gemini_key") : null;
    return Boolean(this.apiKey || serverKey || clientKey);
  }

  async chat(
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<LLMResponse> {
    const key =
      this.apiKey ||
      (typeof process !== "undefined" ? process.env["GEMINI_API_KEY"] : undefined) ||
      (typeof window !== "undefined" ? localStorage.getItem("hacksync_gemini_key") : "") ||
      "";

    if (!key) {
      throw new Error("Gemini API Key is not configured.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key.trim())}`;

    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    const contents = nonSystemMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const bodyPayload: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    };

    if (systemMsg) {
      bodyPayload.system_instruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API Error: HTTP ${res.status} — ${errText}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const promptTokens = AIObservability.estimateTokens(messages.map((m) => m.content).join(" "));
    const completionTokens = AIObservability.estimateTokens(text);

    return {
      text,
      model: "gemini-2.0-flash",
      promptTokens,
      completionTokens,
      raw: data,
    };
  }
}

export class OpenAIProvider implements LLMProvider {
  name = "OpenAI";

  constructor(private apiKey?: string | undefined) {}

  isAvailable(): boolean {
    const serverKey = typeof process !== "undefined" ? process.env["OPENAI_API_KEY"] : undefined;
    const clientKey = typeof window !== "undefined" ? localStorage.getItem("hacksync_openai_key") : null;
    return Boolean(this.apiKey || serverKey || clientKey);
  }

  async chat(
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<LLMResponse> {
    const key =
      this.apiKey ||
      (typeof process !== "undefined" ? process.env["OPENAI_API_KEY"] : undefined) ||
      (typeof window !== "undefined" ? localStorage.getItem("hacksync_openai_key") : "") ||
      "";

    if (!key) {
      throw new Error("OpenAI API Key is not configured.");
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API Error: HTTP ${res.status} — ${errText}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const promptTokens = data?.usage?.prompt_tokens ?? AIObservability.estimateTokens(messages.map((m) => m.content).join(" "));
    const completionTokens = data?.usage?.completion_tokens ?? AIObservability.estimateTokens(text);

    return {
      text,
      model: "gpt-4o-mini",
      promptTokens,
      completionTokens,
      raw: data,
    };
  }
}

export class ModelRouter {
  private static gemini = new GeminiProvider();
  private static openai = new OpenAIProvider();

  static getBestProvider(
    preference: string,
    intent: AIIntentType,
  ): { provider: LLMProvider | null; modelName: string } {
    if (preference === "gemini" && this.gemini.isAvailable()) {
      return { provider: this.gemini, modelName: "gemini-2.0-flash" };
    }
    if (preference === "openai" && this.openai.isAvailable()) {
      return { provider: this.openai, modelName: "gpt-4o-mini" };
    }

    // Default to any available configured provider
    if (this.gemini.isAvailable()) {
      return { provider: this.gemini, modelName: "gemini-2.0-flash" };
    }
    if (this.openai.isAvailable()) {
      return { provider: this.openai, modelName: "gpt-4o-mini" };
    }

    // Deterministic static engine when offline or no keys configured
    return { provider: null, modelName: "builtin-deterministic" };
  }
}
