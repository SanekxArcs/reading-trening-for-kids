import { describe, expect, it } from "vitest";
import { splitSentences } from "@/engine";
import { checkAudio, AUDIO_MAX_SECONDS, AUDIO_WARN_SECONDS } from "./core/mediaLimits.ts";
import { buildReadAloudPrompt } from "./core/prompts/readAloud.ts";
import { compareReadAloud } from "./pipeline/readAloud.ts";
import { GeminiProvider } from "./gemini/provider.ts";
import { asCandidate, scriptFetch } from "./__fixtures__/fetchMock.ts";
import type { MediaPart } from "./core/provider.ts";

const PRINTED = "Одного ранку лисиця вийшла з нори. Вона побачила журавля біля струмка.";
const SENTENCES = splitSentences(PRINTED, "uk");

const AUDIO: MediaPart = {
  kind: "audio",
  mimeType: "audio/webm",
  data: "AAAA",
  approxTokens: 1920,
};

function transcriptJson(transcript: string, audible = true) {
  return JSON.stringify({ language: "uk", audible, transcript, confidence: 0.9 });
}

function provider(steps: Parameters<typeof scriptFetch>[0]) {
  const scripted = scriptFetch(steps);
  return {
    gemini: new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch }),
    requests: scripted.requests,
  };
}

const INPUT = { sentences: SENTENCES, original: PRINTED, audio: AUDIO, durationMs: 60_000 };

describe("audio limits", () => {
  it("accepts a normal reading", () => {
    expect(checkAudio(90_000)).toEqual({ ok: true, warn: false, approxTokens: 2880 });
  });

  it("warns past the length any real passage takes", () => {
    const check = checkAudio((AUDIO_WARN_SECONDS + 10) * 1000);
    expect(check).toMatchObject({ ok: true, warn: true });
  });

  /** A recorder left running is the one mistake here that costs real money. */
  it("refuses a recording that was left running", () => {
    expect(checkAudio((AUDIO_MAX_SECONDS + 1) * 1000)).toEqual({ ok: false, reason: "too_long" });
  });

  it("refuses a tapped button", () => {
    expect(checkAudio(300)).toEqual({ ok: false, reason: "silent" });
  });

  /** Billed by duration, which is why five minutes outweighs everything else. */
  it("prices audio by the second", () => {
    expect(checkAudio(60_000)).toMatchObject({ approxTokens: 1920 });
  });
});

describe("buildReadAloudPrompt", () => {
  const prompt = buildReadAloudPrompt(SENTENCES);

  it("asks for a verbatim transcript, not a correction", () => {
    expect(prompt.system).toContain("VERBATIM");
    expect(prompt.system).toContain("Do NOT correct the child");
  });

  /**
   * The rule that matters most. With the printed text in context, a model asked
   * to compare will happily produce a flawless reading of a silent recording,
   * and the app would report perfect accuracy for a child who said nothing.
   */
  it("forbids echoing the reference text when nothing was heard", () => {
    expect(prompt.system).toContain("NEVER output the reference text");
    expect(prompt.system).toContain("audible to false");
  });

  it("gives the text as reference only", () => {
    expect(prompt.user).toContain("do NOT copy it");
    expect(prompt.user).toContain("[0] ");
  });
});

describe("compareReadAloud", () => {
  it("transcribes once and compares locally", async () => {
    const { gemini, requests } = provider([
      { status: 200, body: asCandidate(transcriptJson(PRINTED)) },
    ]);
    const outcome = await compareReadAloud(gemini, "m", INPUT);

    expect(requests).toHaveLength(1);
    expect(outcome.stats.accuracy).toBe(1);
    expect(outcome.stats.wordsPerMinute).toBe(outcome.stats.correct);
  });

  it("finds the words the child stumbled on", async () => {
    const heard = "одного ранку ведмідь вийшла з нори вона побачила журавля біля струмка";
    const { gemini } = provider([{ status: 200, body: asCandidate(transcriptJson(heard)) }]);

    const outcome = await compareReadAloud(gemini, "m", INPUT);
    expect(outcome.stumbled).toContain("лисиця");
    expect(outcome.stats.accuracy).toBeLessThan(1);
  });

  /** Markers are for the parent reading the transcript, not for the aligner. */
  it("strips pause and unclear markers before comparing", async () => {
    const heard =
      "одного <pause> ранку лисиця вийшла з нори <unclear> вона побачила журавля біля струмка";
    const { gemini } = provider([{ status: 200, body: asCandidate(transcriptJson(heard)) }]);

    const outcome = await compareReadAloud(gemini, "m", INPUT);
    expect(outcome.stats.inserted).toBe(0);
    expect(outcome.transcript).toContain("<pause>");
  });

  /**
   * Silence is a failure, not a score of zero. A muted microphone and a child
   * who read nothing look identical in the audio, and reporting 0% for the
   * first would tell a parent something false about their child.
   */
  it("fails rather than scoring zero on a silent recording", async () => {
    const { gemini } = provider([{ status: 200, body: asCandidate(transcriptJson("", false)) }]);
    await expect(compareReadAloud(gemini, "m", INPUT)).rejects.toMatchObject({
      code: "empty_response",
    });
  });

  it("treats a contradictory response as inaudible", async () => {
    // `audible: false` with text: trust the flag the prompt makes load-bearing.
    const { gemini } = provider([
      { status: 200, body: asCandidate(transcriptJson(PRINTED, false)) },
    ]);
    await expect(compareReadAloud(gemini, "m", INPUT)).rejects.toMatchObject({
      code: "empty_response",
    });
  });

  it("spends no thinking budget on transcription", async () => {
    const { gemini, requests } = provider([
      { status: 200, body: asCandidate(transcriptJson(PRINTED)) },
    ]);
    await compareReadAloud(gemini, "m", INPUT);

    const body = requests[0]?.body as { generationConfig: Record<string, unknown> } | undefined;
    expect(body?.generationConfig["thinkingConfig"]).toEqual({ thinkingBudget: 0 });
    expect(body?.generationConfig["temperature"]).toBe(0);
  });

  it("sends the instruction before the audio", async () => {
    const { gemini, requests } = provider([
      { status: 200, body: asCandidate(transcriptJson(PRINTED)) },
    ]);
    await compareReadAloud(gemini, "m", INPUT);

    const body = requests[0]?.body as { contents: { parts: unknown[] }[] } | undefined;
    expect(body?.contents[0]?.parts[0]).toHaveProperty("text");
    expect(body?.contents[0]?.parts[1]).toHaveProperty("inlineData");
  });

  /** The clock is the recorder's, never the model's. */
  it("takes the duration from the caller", async () => {
    const { gemini } = provider([{ status: 200, body: asCandidate(transcriptJson(PRINTED)) }]);
    const fast = await compareReadAloud(gemini, "m", { ...INPUT, durationMs: 30_000 });
    const slow = await compareReadAloud(gemini, "m", { ...INPUT, durationMs: 120_000 });

    expect(fast.stats.wordsPerMinute).toBeGreaterThan(slow.stats.wordsPerMinute);
  });
});
