import { AiError, type AiErrorCode } from "../core/errors.ts";
import { modelGeneration } from "../core/modelLimits.ts";
import type { MediaPart, StructuredRequest, ThinkingPreference, Usage } from "../core/provider.ts";
import type {
  GeminiErrorBody,
  GeminiThinkingConfig,
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiSafetySetting,
  GeminiUsageMetadata,
} from "./wire.ts";

/**
 * Everything between the app's vocabulary and Gemini's, as pure functions.
 *
 * `client.ts` does the fetching and almost no branching; the decisions live
 * here, where they can be tested against captured responses without a network.
 */

/**
 * Four categories at BLOCK_ONLY_HIGH.
 *
 * The default, BLOCK_MEDIUM_AND_ABOVE, false-positives on ordinary children's
 * literature — wolves eating grandmothers, witches, drownings — and that is the
 * single most likely way this app "just stops working" for a parent.
 * BLOCK_NONE is the wrong signal for a children's app and some keys reject it
 * outright. HARM_CATEGORY_CIVIC_INTEGRITY is deliberately absent: several
 * models return 400 on it.
 */
export const KID_SAFETY: GeminiSafetySetting[] = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
];

/** What "low" costs on a model that counts thinking in tokens. */
export const LOW_BUDGET_TOKENS = 512;

/**
 * Enough headroom for a model that will not stop thinking.
 *
 * Gemini 3 Flash thinks at medium by default and cannot be told not to, so the
 * reserve has to cover a level the app never asked for.
 */
export const THINKING_RESERVE = 4096;

/** The token budget a 2.5-era model understands, or undefined to omit it. */
export function thinkingBudget(
  preference: ThinkingPreference,
  supported: boolean,
): number | undefined {
  if (!supported) return undefined;
  if (preference === "auto") return undefined;
  return preference === "off" ? 0 : LOW_BUDGET_TOKENS;
}

/**
 * The thinking field this model actually understands.
 *
 * Generation 3 replaced the token budget with a level and removed the ability
 * to switch thinking off, so "off" there means "as little as it will do",
 * which is `low`. Sending the 2.5 field to a 3.x model is what caused a run of
 * unreadable answers: the field was ignored, the model thought at its default
 * level, and the thoughts ate the output budget the JSON needed.
 */
export function thinkingFor(
  modelId: string,
  preference: ThinkingPreference,
  supported: boolean,
): GeminiThinkingConfig | undefined {
  if (!supported || preference === "auto") return undefined;

  // Generation 3 has no "off", so both of this app's settings land on "low" —
  // the least it will do. Nothing here ever asks for more: the one call that
  // benefits from thinking benefits from a little of it.
  if (modelGeneration(modelId) >= 300) return { thinkingLevel: "low" };

  const budget = thinkingBudget(preference, supported);
  return budget === undefined ? undefined : { thinkingBudget: budget };
}

/**
 * Room for the answer *after* the model has finished thinking.
 *
 * `maxOutputTokens` covers thought tokens as well as the reply, so a ceiling
 * sized for the JSON alone truncates every thinking model — and a truncated
 * JSON object is exactly the "could not be read" error a parent sees. The
 * ceiling is not a spend: nothing is billed for room that goes unused.
 */
export function withThinkingRoom(
  maxOutputTokens: number,
  thinking: GeminiThinkingConfig | undefined,
): number {
  // A budget of zero is the one case where no room is needed: that model was
  // told not to think and will obey.
  if (thinking?.thinkingBudget === 0) return maxOutputTokens;

  /**
   * The reserve applies even when no thinking was configured at all.
   *
   * A model whose catalogue entry says nothing about thinking, or one that
   * rejected the field and had it dropped by the probe, still thinks — and
   * still spends the output budget doing it.
   */
  return Math.min(32_768, maxOutputTokens + THINKING_RESERVE);
}

export interface ToWireOptions {
  /** False once a 400 has told us this model rejects the field. */
  thinkingSupported: boolean;
}

export function toWire<T>(
  request: StructuredRequest<T>,
  options: ToWireOptions,
): GeminiGenerateContentRequest {
  const thinking = thinkingFor(request.modelId, request.thinking, options.thinkingSupported);

  // Instruction first, then media: page ordering survives, and the model knows
  // what it is looking at before it looks.
  const parts = [
    { text: request.text },
    ...(request.media ?? []).map((media: MediaPart) => ({
      inlineData: { mimeType: media.mimeType, data: media.data },
    })),
  ];

  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: request.schema,
      temperature: request.temperature,
      maxOutputTokens: withThinkingRoom(request.maxOutputTokens, thinking),
      candidateCount: 1,
      ...(thinking === undefined ? {} : { thinkingConfig: thinking }),
    },
    safetySettings: KID_SAFETY,
  };
}

export function toUsage(metadata: GeminiUsageMetadata | undefined): Usage {
  const prompt = metadata?.promptTokenCount ?? 0;
  // Thoughts are billed as output; adding them here is the difference between
  // a ledger a parent can trust and one that quietly under-reports.
  const output = (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0);
  return {
    promptTokens: prompt,
    outputTokens: output,
    totalTokens: metadata?.totalTokenCount ?? prompt + output,
  };
}

/** The text of the single candidate, or an AiError naming why there is none. */
export function extractText(response: GeminiGenerateContentResponse): string {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) {
    return failWith(blocked === "RECITATION" ? "recitation_blocked" : "safety_blocked", blocked);
  }

  const candidate = response.candidates?.[0];
  if (!candidate) return failWith("empty_response", "no candidates");

  const finish = candidate.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
    return failWith("safety_blocked", finish);
  }
  if (finish === "RECITATION") return failWith("recitation_blocked", finish);

  const text = (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  // MAX_TOKENS is not fatal — a truncated array is often salvageable — so the
  // text is returned and `repair.ts` gets its chance. Only an empty one fails.
  if (text.length === 0) {
    return failWith("empty_response", finish ?? "empty parts");
  }
  return text;
}

function failWith(code: AiErrorCode, detail: string): never {
  throw new AiError(code, detail);
}

/** Retry delay from the header and the body, whichever asks for longer. */
export function parseRetryDelayMs(
  headers: Headers | null,
  body: GeminiErrorBody | null,
): number | null {
  const header = headers?.get("retry-after") ?? null;
  const fromHeader =
    header === null
      ? null
      : /^\d+$/.test(header)
        ? Number(header) * 1000
        : Date.parse(header) - Date.now();

  const info = body?.error.details?.find((detail) => detail["@type"].endsWith("RetryInfo"));
  const fromBody = info?.retryDelay ? Math.round(Number.parseFloat(info.retryDelay) * 1000) : null;

  const best = Math.max(fromHeader ?? 0, fromBody ?? 0);
  return Number.isFinite(best) && best > 0 ? best : null;
}

/**
 * A daily quota is a different thing from a per-minute one.
 *
 * Per-minute means "wait twenty seconds". Per-day means "stop until tomorrow",
 * and treating the second as the first burns four retries and then falls back
 * anyway, slowly.
 */
export function isDailyQuota(body: GeminiErrorBody | null): boolean {
  return (
    body?.error.details?.some((detail) =>
      detail.violations?.some((violation) => /per.?day/i.test(violation.quotaId ?? "")),
    ) ?? false
  );
}

/**
 * The allowance a quota failure states, which is the only place it is stated.
 *
 * Google stopped publishing per-model limits; `QuotaFailure.quotaValue` is
 * authoritative, current and specific to this key's tier. Reading it turns the
 * first 429 of a model's life into a permanent fact about it.
 */
export function quotaLimits(body: GeminiErrorBody | null): { rpm?: number; rpd?: number } {
  const out: { rpm?: number; rpd?: number } = {};

  for (const detail of body?.error.details ?? []) {
    for (const violation of detail.violations ?? []) {
      const value = Number.parseInt(violation.quotaValue ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) continue;
      const id = violation.quotaId ?? "";
      if (/per.?day/i.test(id)) out.rpd = value;
      else if (/per.?minute/i.test(id)) out.rpm = value;
    }
  }
  return out;
}

/** True when a 400 is telling us the model dislikes `thinkingConfig`. */
export function isThinkingComplaint(body: GeminiErrorBody | null): boolean {
  return /thinking|thinking_?budget|thinkingConfig/i.test(body?.error.message ?? "");
}

/** Maps an HTTP failure onto the taxonomy. Pure, so it can be fixture-tested. */
export function classifyHttp(status: number, body: GeminiErrorBody | null): AiErrorCode {
  const message = body?.error.message ?? "";

  if (status === 400) {
    if (/API key not valid|API_KEY_INVALID/i.test(message)) return "invalid_key";
    if (/request entity too large|exceeds|too large/i.test(message)) return "payload_too_large";
    return "unknown";
  }
  if (status === 403) return "key_restricted";
  if (status === 404) return "model_unavailable";
  if (status === 413) return "payload_too_large";
  if (status === 429) return isDailyQuota(body) ? "daily_quota" : "rate_limited";
  if (status >= 500) return "server_busy";
  return "unknown";
}

export function toAiError(status: number, body: GeminiErrorBody | null, headers: Headers | null) {
  const code = classifyHttp(status, body);
  const retryAfterMs = parseRetryDelayMs(headers, body);
  const quota = quotaLimits(body);
  return new AiError(code, body?.error.message ?? `HTTP ${status}`, {
    status,
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
    ...(quota.rpm === undefined && quota.rpd === undefined ? {} : { quota }),
  });
}
