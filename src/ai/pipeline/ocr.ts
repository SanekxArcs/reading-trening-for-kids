import { checkImageBatch } from "../core/mediaLimits.ts";
import { AiError } from "../core/errors.ts";
import { buildOcrPrompt } from "../core/prompts/ocr.ts";
import type { LlmProvider, MediaPart, StructuredRequest } from "../core/provider.ts";
import { OCR_SCHEMA } from "../core/schemas.ts";

export interface OcrPage {
  index: number;
  text: string;
}

export interface OcrResult {
  language: string;
  pages: OcrPage[];
  mergedText: string;
  unreadableCount: number;
  /** For the grown-up: "page 2 is blurred at the bottom". */
  notes: string;
}

export interface OcrOutcome extends OcrResult {
  promptTokens: number;
  outputTokens: number;
}

/**
 * Validates leniently and rebuilds what it can.
 *
 * `mergedText` is the field everything downstream uses, so if the model gives
 * the pages but forgets to merge them, joining is obviously better than failing
 * — the transcription is right there.
 */
function validate(raw: unknown): OcrResult {
  if (typeof raw !== "object" || raw === null) throw new Error("response is not an object");
  const root = raw as Record<string, unknown>;

  const pages = (Array.isArray(root["pages"]) ? root["pages"] : [])
    .map((page, fallbackIndex): OcrPage | null => {
      if (typeof page !== "object" || page === null) return null;
      const entry = page as Record<string, unknown>;
      const text = typeof entry["text"] === "string" ? entry["text"].trim() : "";
      if (text.length === 0) return null;
      return {
        index: typeof entry["index"] === "number" ? entry["index"] : fallbackIndex,
        text,
      };
    })
    .filter((page): page is OcrPage => page !== null);

  const merged =
    typeof root["mergedText"] === "string" && root["mergedText"].trim().length > 0
      ? root["mergedText"].trim()
      : pages.map((page) => page.text).join("\n\n");

  if (merged.length === 0) throw new Error("no text was transcribed");

  return {
    language: typeof root["language"] === "string" ? root["language"] : "",
    pages,
    mergedText: merged,
    unreadableCount:
      typeof root["unreadableCount"] === "number" ? Math.max(0, root["unreadableCount"]) : 0,
    notes: typeof root["notes"] === "string" ? root["notes"].trim() : "",
  };
}

/**
 * Transcribes a batch of photographed pages.
 *
 * One call for the whole batch, so a sentence running across a page break is
 * joined by something that can see both sides of it.
 */
export async function runOcr(
  provider: LlmProvider,
  modelId: string,
  pages: readonly MediaPart[],
  signal?: AbortSignal,
): Promise<OcrOutcome> {
  const check = checkImageBatch(pages);
  if (!check.ok) {
    throw new AiError("payload_too_large", check.reason);
  }

  const prompt = buildOcrPrompt(pages.length);

  const request: StructuredRequest<OcrResult> = {
    modelId,
    system: prompt.system,
    text: prompt.user,
    media: pages,
    schema: OCR_SCHEMA,
    validate,
    // Transcription, not composition. Any creativity here is an invented word.
    temperature: 0,
    // Print is roughly 300 words to a page; the generous multiple covers a
    // dense page without inviting the model to keep going.
    maxOutputTokens: Math.min(8192, 1024 + pages.length * 900),
    thinking: "off",
    label: "ocr",
  };

  const result = await provider.complete(request, signal);
  return {
    ...result.value,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
  };
}
