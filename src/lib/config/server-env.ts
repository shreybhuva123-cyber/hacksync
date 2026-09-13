/**
 * Server-Only Environment & Provider Secret Validator
 * Strictly validates server-side credentials without exposing secrets to the browser.
 */

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GEMINI_API_KEY: z.string().min(10).optional(),
  OPENAI_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(5).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

/**
 * Validates and retrieves server-only environment variables.
 * Safe to call on the server; never leaks secrets to logs or clients.
 */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const raw = {
    NODE_ENV: process.env["NODE_ENV"] || "development",
    GEMINI_API_KEY: process.env["GEMINI_API_KEY"]?.trim(),
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"]?.trim(),
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"]?.trim(),
    OLLAMA_BASE_URL: process.env["OLLAMA_BASE_URL"]?.trim(),
    SUPABASE_URL: process.env["SUPABASE_URL"]?.trim() || process.env["VITE_SUPABASE_URL"]?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim(),
    UPSTASH_REDIS_REST_URL: process.env["UPSTASH_REDIS_REST_URL"]?.trim(),
    UPSTASH_REDIS_REST_TOKEN: process.env["UPSTASH_REDIS_REST_TOKEN"]?.trim(),
  };

  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Redact sensitive keys from validation error messages
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`[ServerEnv] Configuration validation failed: ${errors.join(", ")}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/**
 * Checks whether an external AI model provider is configured on the server.
 */
export function isProviderConfigured(provider: "gemini" | "openai" | "anthropic" | "ollama"): boolean {
  try {
    const env = getServerEnv();
    switch (provider) {
      case "gemini":
        return Boolean(env.GEMINI_API_KEY);
      case "openai":
        return Boolean(env.OPENAI_API_KEY);
      case "anthropic":
        return Boolean(env.ANTHROPIC_API_KEY);
      case "ollama":
        return Boolean(env.OLLAMA_BASE_URL || process.env["ENABLE_OLLAMA"] === "true");
      default:
        return false;
    }
  } catch {
    return false;
  }
}
