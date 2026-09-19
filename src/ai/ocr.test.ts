import { describe, expect, it } from "vitest";
import {
  base64Bytes,
  checkImageBatch,
  chunkPages,
  MAX_PAGES_PER_CALL,
  MAX_REQUEST_BYTES,
} from "./core/mediaLimits.ts";
import { buildOcrPrompt } from "./core/prompts/ocr.ts";
import { OCR_SCHEMA } from "./core/schemas.ts";
import { GeminiProvider } from "./gemini/provider.ts";
import { runOcr } from "./pipeline/ocr.ts";
import { asCandidate, scriptFetch } from "./__fixtures__/fetchMock.ts";
import type { MediaPart } from "./core/provider.ts";

function page(bytes = 1000): MediaPart {
  return {
    kind: "image",
    mimeType: "image/jpeg",
    // Four base64 characters carry three bytes.
    data: "A".repeat(Math.ceil((bytes * 4) / 3)),
    approxTokens: 1300,
  };
}

const OCR_JSON = JSON.stringify({
  language: "uk",
  pages: [
    { index: 0, text: "Одного ранку лисиця вийшла з нори." },
    { index: 1, text: "Вона побачила журавля біля струмка." },
  ],
  mergedText: "Одного ранку лисиця вийшла з нори.\n\nВона побачила журавля біля струмка.",
  unreadableCount: 1,
  notes: "Друга сторінка трохи розмита знизу.",
});

function provider(steps: Parameters<typeof scriptFetch>[0]) {
  const scripted = scriptFetch(steps);
  return {
    gemini: new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch }),
    requests: scripted.requests,
  };
}

describe("media limits", () => {
  it("measures base64 as the bytes it carries", () => {
    expect(base64Bytes("AAAA")).toBe(3);
  });

  it("accepts a normal batch", () => {
    expect(checkImageBatch([page(), page(), page()])).toEqual({ ok: true });
  });

  /**
   * Six pages is about one spread of a picture book. Past that, both the token
   * cost and the odds of one blurred page spoiling the batch climb faster than
   * the convenience is worth.
   */
  it("refuses more pages than one call may carry", () => {
    const tooMany = Array.from({ length: MAX_PAGES_PER_CALL + 1 }, () => page(10));
    expect(checkImageBatch(tooMany)).toEqual({ ok: false, reason: "too_many_pages" });
  });

  it("refuses a batch over the self-imposed size ceiling", () => {
    const huge = [page(MAX_REQUEST_BYTES), page(MAX_REQUEST_BYTES)];
    expect(checkImageBatch(huge)).toEqual({ ok: false, reason: "too_large" });
  });

  it("chunks a long run of pages into legal calls", () => {
    const chunks = chunkPages(Array.from({ length: 14 }, (_, i) => i));
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= MAX_PAGES_PER_CALL)).toBe(true);
    expect(chunks.flat()).toHaveLength(14);
  });

  it("returns nothing for no pages", () => {
    expect(chunkPages([])).toEqual([]);
  });
});

describe("buildOcrPrompt", () => {
  const prompt = buildOcrPrompt(3);

  it("carries the language lock", () => {
    expect(prompt.system).toContain("LANGUAGE RULE");
  });

  /**
   * The three instructions whose absence poisons everything downstream: a
   * simplified sentence changes what the questions are about, a page number
   * swept into the prose becomes a sentence a question can cite, and an
   * invented word is a fact the child never read.
   */
  it("forbids simplifying, keeping page furniture, and inventing words", () => {
    expect(prompt.system).toContain("Do NOT simplify");
    expect(prompt.system).toContain("page numbers");
    expect(prompt.system).toContain("Never invent a word");
  });

  it("says how many pages are coming and in what order", () => {
    expect(prompt.user).toContain("3 pages");
    expect(prompt.user).toContain("in the order given");
    expect(buildOcrPrompt(1).user).toContain("this page");
  });
});

describe("runOcr", () => {
  it("transcribes a batch in one call", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(OCR_JSON) }]);
    const result = await runOcr(gemini, "m", [page(), page()]);

    expect(requests).toHaveLength(1);
    expect(result.pages).toHaveLength(2);
    expect(result.mergedText).toContain("журавля");
    expect(result.unreadableCount).toBe(1);
    expect(result.notes).toContain("розмита");
  });

  /** The model sees what it is looking at before it looks. */
  it("sends the instruction before the images", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(OCR_JSON) }]);
    await runOcr(gemini, "m", [page()]);

    const body = requests[0]?.body as { contents: { parts: unknown[] }[] } | undefined;
    const parts = body?.contents[0]?.parts;
    expect(parts?.[0]).toHaveProperty("text");
    expect(parts?.[1]).toHaveProperty("inlineData");
  });

  it("spends no thinking budget on transcription", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(OCR_JSON) }]);
    await runOcr(gemini, "m", [page()]);

    const body = requests[0]?.body as { generationConfig: Record<string, unknown> } | undefined;
    const config = body?.generationConfig;
    expect(config?.["thinkingConfig"]).toEqual({ thinkingBudget: 0 });
    expect(config?.["temperature"]).toBe(0);
    expect(config?.["responseSchema"]).toEqual(OCR_SCHEMA);
  });

  /**
   * The transcription is right there; failing because the model forgot to
   * concatenate it would throw away a good result over a missing field.
   */
  it("rebuilds mergedText when the model omits it", async () => {
    const partial = JSON.stringify({
      language: "uk",
      pages: [
        { index: 0, text: "Перша сторінка." },
        { index: 1, text: "Друга сторінка." },
      ],
      unreadableCount: 0,
    });
    const { gemini } = provider([{ status: 200, body: asCandidate(partial) }]);

    const result = await runOcr(gemini, "m", [page(), page()]);
    expect(result.mergedText).toBe("Перша сторінка.\n\nДруга сторінка.");
  });

  it("fails rather than returning an empty transcription", async () => {
    const empty = JSON.stringify({ language: "uk", pages: [], mergedText: "", unreadableCount: 0 });
    const { gemini } = provider([{ status: 200, body: asCandidate(empty) }]);

    await expect(runOcr(gemini, "m", [page()])).rejects.toMatchObject({ code: "bad_json" });
  });

  it("refuses an oversized batch without spending a request", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(OCR_JSON) }]);
    const tooMany = Array.from({ length: MAX_PAGES_PER_CALL + 1 }, () => page(10));

    await expect(runOcr(gemini, "m", tooMany)).rejects.toMatchObject({
      code: "payload_too_large",
    });
    expect(requests).toHaveLength(0);
  });

  /**
   * A photographed page of an in-copyright book is exactly the input that trips
   * this, and the parent-facing message has to name it.
   */
  it("names a recitation block for what it is", async () => {
    const { gemini } = provider([
      { status: 200, body: { candidates: [{ finishReason: "RECITATION" }] } },
    ]);
    await expect(runOcr(gemini, "m", [page()])).rejects.toMatchObject({
      code: "recitation_blocked",
    });
  });
});
