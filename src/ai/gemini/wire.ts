import type { JsonSchema } from "../core/provider.ts";

/** The Gemini REST surface this app touches, and nothing more. */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/**
 * Two dialects of the same idea, and sending the wrong one is expensive.
 *
 * Gemini 2.5 takes `thinkingBudget`, a token count, where zero disables
 * thinking. Gemini 3 takes `thinkingLevel` and **cannot be told to stop
 * thinking at all** — the lowest setting is "low". A 3.x model sent a budget
 * either rejects the request or ignores the field and thinks at its default
 * level, which is the more expensive half of the mistake: thought tokens count
 * against `maxOutputTokens`, so the answer gets truncated instead.
 */
export interface GeminiThinkingConfig {
  thinkingBudget?: number;
  thinkingLevel?: "low" | "medium" | "high";
}

export interface GeminiGenerationConfig {
  responseMimeType?: "application/json" | "text/plain";
  responseSchema?: JsonSchema;
  temperature?: number;
  maxOutputTokens?: number;
  candidateCount?: 1;
  thinkingConfig?: GeminiThinkingConfig;
}

export type HarmCategory =
  | "HARM_CATEGORY_HARASSMENT"
  | "HARM_CATEGORY_HATE_SPEECH"
  | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
  | "HARM_CATEGORY_DANGEROUS_CONTENT";

export interface GeminiSafetySetting {
  category: HarmCategory;
  threshold: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_LOW_AND_ABOVE";
}

export interface GeminiGenerateContentRequest {
  systemInstruction?: { parts: [{ text: string }] };
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySetting[];
}

export type FinishReason =
  "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "PROHIBITED_CONTENT" | "OTHER";

export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: FinishReason;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Billed as output. The ledger has to add it or it under-reports. */
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

export interface GeminiErrorDetail {
  "@type": string;
  /** e.g. "21s" */
  retryDelay?: string;
  /**
   * `quotaValue` is the allowance itself, as a string. It is the only place
   * the real per-model limit is ever stated, now that the documentation prints
   * none — so it is worth keeping rather than only counting the failure.
   */
  violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string }[];
}

export interface GeminiErrorBody {
  error: {
    code: number;
    message: string;
    status: string;
    details?: GeminiErrorDetail[];
  };
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  thinking?: boolean;
}

export interface GeminiListModelsResponse {
  models?: GeminiModel[];
  nextPageToken?: string;
}
