/**
 * HackSync AI Provider Abstraction Interface
 * 
 * Separates CLIENT-SAFE TYPES from SERVER-ONLY PROVIDER IMPLEMENTATIONS.
 * Never import server provider implementations into client React components.
 */

// ─── CLIENT-SAFE TYPES ────────────────────────────────────────────────────────

export type AIProviderName = "builtin" | "gemini" | "openai" | "anthropic" | "ollama";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: AIProviderName;
  promptTokens: number;
  completionTokens: number;
  raw?: unknown;
}

export interface ProviderCapability {
  name: AIProviderName;
  displayName: string;
  models: string[];
  isAvailable: boolean;
  requiresServerKey: boolean;
}

// ─── SERVER ONLY: PROVIDER INTERFACE ──────────────────────────────────────────

/**
 * Server-only provider interface.
 * Implemented exclusively in backend server modules.
 */
export interface LLMProvider {
  name: AIProviderName;
  isAvailable(): boolean;
  chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number; model?: string },
  ): Promise<LLMResponse>;
}
