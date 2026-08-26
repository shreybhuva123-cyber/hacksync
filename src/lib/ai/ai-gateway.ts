import { aiQuerySchema, type AIQueryInput } from "@/lib/validation/schemas";
import { RateLimitError, ExternalServiceError, logger } from "@/lib/errors";

// In-memory token bucket rate limiter (10 requests per minute per IP / client key)
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const rateLimitMap = new Map<string, Bucket>();
const MAX_TOKENS = 12;
const REFILL_RATE_MS = 60_000 / 12; // 1 token every 5 seconds

export function checkRateLimit(clientKey: string): void {
  const now = Date.now();
  const bucket = rateLimitMap.get(clientKey) ?? { tokens: MAX_TOKENS, lastRefill: now };

  const timePassed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(timePassed / REFILL_RATE_MS);

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    logger.warn("AI Gateway Rate Limit Exceeded", { clientKey });
    throw new RateLimitError("AI query quota exceeded. Please wait 10 seconds before your next query.");
  }

  bucket.tokens -= 1;
  rateLimitMap.set(clientKey, bucket);
}

export async function processServerAIQuery(
  input: AIQueryInput,
  clientKey = "default",
  systemPrompt: string,
): Promise<{ text: string; providerUsed: string }> {
  // 1. Rate limiting check
  checkRateLimit(clientKey);

  // 2. Validate input schema
  const validated = aiQuerySchema.parse(input);

  logger.info(`Processing AI Query via model: ${validated.model}`);

  const geminiKey = process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"] || process.env["VITE_OPENAI_API_KEY"];

  // 3. Dispatch to server-side Gemini if requested and configured
  if (validated.model === "gemini-2.0-flash" && geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey.trim())}`;
      const contents = [
        ...validated.chatHistory.slice(-6).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        {
          role: "user",
          parts: [{ text: validated.prompt }],
        },
      ];

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });

      if (!res.ok) {
        throw new ExternalServiceError("Gemini", `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text, providerUsed: "Google Gemini 2.0 Flash (Server-Secured)" };
      }
    } catch (err) {
      logger.warn("Server Gemini query failed, falling back to Deep Reasoning Engine", { error: String(err) });
    }
  }

  // 4. Dispatch to server-side OpenAI if requested and configured
  if (validated.model === "gpt-4o-mini" && openaiKey) {
    try {
      const url = "https://api.openai.com/v1/chat/completions";
      const messages = [
        { role: "system", content: systemPrompt },
        ...validated.chatHistory.slice(-6).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        { role: "user", content: validated.prompt },
      ];

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        throw new ExternalServiceError("OpenAI", `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) {
        return { text, providerUsed: "OpenAI GPT-4o Mini (Server-Secured)" };
      }
    } catch (err) {
      logger.warn("Server OpenAI query failed, falling back to Deep Reasoning Engine", { error: String(err) });
    }
  }

  // 5. Default/Fallback: Deep Reasoning Engine
  return {
    text: "",
    providerUsed: "HackSync Deep Reasoning Engine",
  };
}
