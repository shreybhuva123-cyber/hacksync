/**
 * Model Provider Abstraction Interface
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  raw?: any;
}

export interface LLMProvider {
  name: string;
  isAvailable(): boolean;
  chat(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse>;
}
