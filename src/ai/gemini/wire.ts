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

export interface GeminiThinkingConfig {
  /**
   * Zero disables thinking on the models that allow it. Some reject zero and
   * want a minimum; older ones reject the field entirely. Probed, never
   * assumed — see `capabilities.ts`.
   */
  thinkingBudget?: number;
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
  violations?: { quotaId?: string; quotaMetric?: string }[];
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
