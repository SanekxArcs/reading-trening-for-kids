import { AiError, asAiError } from "../core/errors.ts";
import { parseLoosely } from "../core/repair.ts";
import type {
  KeyCheck,
  LlmProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from "../core/provider.ts";
import { generateContent, listModelsRaw, type ClientOptions } from "./client.ts";
import { extractText, toUsage, toWire } from "./map.ts";
import { selectUsableModels } from "./models.ts";
import type { GeminiErrorBody } from "./wire.ts";

/**
 * Gemini, behind the provider interface.
 *
 * Remembers one thing across calls: which models turned out to reject
 * `thinkingConfig`. That is a per-model fact discovered from a 400, and paying
 * for the same 400 on every question set would be a slow, invisible tax.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = "gemini";
  private readonly options: ClientOptions;
  private readonly thinkingRejected: Set<string>;

  constructor(options: ClientOptions, thinkingRejected: Set<string> = new Set()) {
    this.options = options;
    this.thinkingRejected = thinkingRejected;
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const raw = await listModelsRaw(this.options, signal);
    return selectUsableModels(raw.models ?? []);
  }

  /**
   * Validates a key with `models.list`, not a generate call.
   *
   * It costs no tokens, touches no daily quota, and returns the model list the
   * settings screen needs anyway — one request doing both jobs.
   */
  async validateKey(signal?: AbortSignal): Promise<KeyCheck> {
    try {
      return { ok: true, models: await this.listModels(signal) };
    } catch (error) {
      const aiError = asAiError(error);
      switch (aiError.code) {
        case "invalid_key":
        case "key_restricted":
        case "offline":
          return { ok: false, code: aiError.code, detail: aiError.detail };
        default:
          return { ok: false, code: "unknown", detail: aiError.detail };
      }
    }
  }

  async complete<T>(
    request: StructuredRequest<T>,
    signal?: AbortSignal,
  ): Promise<StructuredResult<T>> {
    const body = toWire(request, {
      thinkingSupported: !this.thinkingRejected.has(request.modelId),
    });

    const outcome = await generateContent(request.modelId, body, this.options, signal);
    if (outcome.thinkingRejected) this.thinkingRejected.add(request.modelId);

    const rawText = extractText(outcome.response);
    const parsed = parseLoosely(rawText);
    if (!parsed) {
      throw new AiError("bad_json", truncateForLog(rawText));
    }

    let value: T;
    try {
      value = request.validate(parsed.value);
    } catch (error) {
      // The message travels into the repair prompt, so it has to name the
      // problem rather than just report that there was one.
      throw new AiError("bad_json", error instanceof Error ? error.message : String(error));
    }

    return {
      value,
      usage: toUsage(outcome.response.usageMetadata),
      modelId: outcome.response.modelVersion ?? request.modelId,
      repaired: parsed.repaired,
      rawText,
    };
  }
}

/** Enough of the response to diagnose, not enough to fill a log. */
function truncateForLog(text: string): string {
  return text.length <= 300 ? text : `${text.slice(0, 300)}…`;
}

export type { GeminiErrorBody };
