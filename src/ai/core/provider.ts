/**
 * The seam.
 *
 * Everything above this line talks about reading, questions and children.
 * Everything below talks about HTTP. The interface in between knows about
 * neither: it is "structured JSON completion, with optional media". Swapping
 * Gemini for another provider is a new folder next to `gemini/`, and nothing in
 * `core/` changes.
 */

/**
 * How much the model should think before answering.
 *
 * Model-dependent and probed rather than assumed — some models accept a budget
 * of zero, some reject it, older ones reject the field entirely. See
 * `gemini/capabilities.ts`.
 */
export type ThinkingPreference = "off" | "low" | "auto";

/** What a request is for. Drives the ledger breakdown the parent sees. */
export type RequestLabel =
  "ocr" | "questions" | "grading" | "readaloud" | "story" | "repair" | "probe";

export interface MediaPart {
  kind: "image" | "audio";
  mimeType: string;
  /** base64, without the `data:` prefix. */
  data: string;
  approxTokens: number;
}

/**
 * A JSON schema in the OpenAPI 3.0 *subset* providers accept.
 *
 * Uppercase type names, no `$ref`, no `oneOf`, no `additionalProperties`.
 * Written by hand in `schemas.ts` rather than generated from a validator
 * library, because the subset is small enough that a generator would mostly be
 * a source of features the provider silently ignores.
 */
export interface JsonSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN";
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  required?: string[];
  minItems?: number;
  maxItems?: number;
  /**
   * Generation order, which providers honour.
   *
   * Not cosmetic: putting `rationale` and `sentenceIndex` before `prompt` makes
   * the model commit to its evidence first, which measurably improves how often
   * the cited sentence is the one that actually contains the answer.
   */
  propertyOrdering?: string[];
}

export interface StructuredRequest<T> {
  modelId: string;
  system: string;
  text: string;
  media?: readonly MediaPart[] | undefined;
  schema: JsonSchema;
  /**
   * Runs on the parsed value.
   *
   * Must throw with a readable message naming the offending path, because that
   * message is what gets handed back to the model in the one repair attempt.
   */
  validate: (raw: unknown) => T;
  temperature: number;
  maxOutputTokens: number;
  thinking: ThinkingPreference;
  label: RequestLabel;
}

export interface Usage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StructuredResult<T> {
  value: T;
  usage: Usage;
  modelId: string;
  /** True when the JSON needed repairing — surfaced in parent diagnostics. */
  repaired: boolean;
  rawText: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsThinking: boolean;
}

export type KeyCheck =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; code: "invalid_key" | "key_restricted" | "offline" | "unknown"; detail: string };

export interface LlmProvider {
  readonly id: string;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  validateKey(signal?: AbortSignal): Promise<KeyCheck>;
  complete<T>(request: StructuredRequest<T>, signal?: AbortSignal): Promise<StructuredResult<T>>;
}
