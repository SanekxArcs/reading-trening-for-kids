import { describe, expect, it } from "vitest";
import { splitSentences } from "@/engine";
import { translate, LANGS } from "@/i18n/translations";
import { AI_ERROR_CODES, AiError, errorInfo, type AiErrorCode } from "./core/errors.ts";
import { extractJson, parseLoosely, salvageTruncated } from "./core/repair.ts";
import { needsRepair, validateQuestionSet } from "./core/validate.ts";
import { localSetKey, questionSetKey } from "./core/cacheKey.ts";
import { buildQuestionPrompt } from "./core/prompts/questions.ts";
import { PROMPT_VERSION } from "./core/prompts/shared.ts";
import {
  classifyHttp,
  extractText,
  isDailyQuota,
  parseRetryDelayMs,
  thinkingBudget,
  toUsage,
  toWire,
} from "./gemini/map.ts";
import { defaultModel, resolveModel, selectUsableModels } from "./gemini/models.ts";
import { GeminiProvider } from "./gemini/provider.ts";
import { generateQuestions, outputBudget } from "./pipeline/generateQuestions.ts";
import { QUESTION_SET_SCHEMA } from "./core/schemas.ts";
import { asCandidate, scriptFetch } from "./__fixtures__/fetchMock.ts";
import {
  BAD_CITATIONS_SET,
  DAILY_QUOTA_BODY,
  DUPLICATE_SET,
  EMPTY_RESPONSE,
  FENCED_JSON,
  INVALID_KEY_BODY,
  MODELS_LIST,
  RATE_LIMIT_BODY,
  RECITATION_RESPONSE,
  RESTRICTED_KEY_BODY,
  SAFETY_BLOCKED_RESPONSE,
  STORY,
  THINKING_REJECTED_BODY,
  TRAILING_COMMA_JSON,
  TRUNCATED_JSON,
  VALID_JSON,
  VALID_SET,
} from "./__fixtures__/questionSets.ts";

const SENTENCES = splitSentences(STORY, "uk");

function provider(steps: Parameters<typeof scriptFetch>[0]) {
  const scripted = scriptFetch(steps);
  return {
    provider: new GeminiProvider({ apiKey: "AIzaTEST", fetchImpl: scripted.fetch }),
    requests: scripted.requests,
  };
}

// ─── Errors ───────────────────────────────────────────────────────────────

describe("error taxonomy", () => {
  /**
   * The guard test. Every code has copy for both audiences, in every language —
   * otherwise a real failure renders as a raw key in front of a parent.
   */
  it("has parent and child copy for every code, in every language", () => {
    for (const code of AI_ERROR_CODES) {
      const info = errorInfo(code);
      for (const lang of LANGS) {
        expect(translate(lang, info.parentKey), `${lang}.${code}`).not.toBe(info.parentKey);
        expect(translate(lang, info.childKey), `${lang}.${code}`).not.toBe(info.childKey);
      }
    }
  });

  /**
   * The product rule, enforced: a child is only ever told one of three things,
   * and none of them mentions machinery they cannot act on.
   */
  it("never tells a child about an API, a key or a quota", () => {
    const forbidden = /gemini|api|token|quota|model|ключ|klucz|limit/i;
    for (const code of AI_ERROR_CODES) {
      for (const lang of LANGS) {
        expect(translate(lang, errorInfo(code).childKey), `${lang}.${code}`).not.toMatch(forbidden);
      }
    }
  });

  it("degrades every non-retryable failure to something playable", () => {
    for (const code of AI_ERROR_CODES) {
      const info = errorInfo(code);
      if (info.retryable || code === "aborted") continue;
      expect(["local_questions", "cached_only"], code).toContain(info.degradeTo);
    }
  });

  it("carries the retry delay when there is one", () => {
    const error = new AiError("rate_limited", "slow down", { status: 429, retryAfterMs: 21_000 });
    expect(error.retryAfterMs).toBe(21_000);
    expect(error.info.retryable).toBe(true);
  });
});

// ─── HTTP classification ──────────────────────────────────────────────────

describe("classifyHttp", () => {
  it.each<[number, unknown, AiErrorCode]>([
    [400, INVALID_KEY_BODY, "invalid_key"],
    [403, RESTRICTED_KEY_BODY, "key_restricted"],
    [404, null, "model_unavailable"],
    [429, RATE_LIMIT_BODY, "rate_limited"],
    [429, DAILY_QUOTA_BODY, "daily_quota"],
    [500, null, "server_busy"],
    [503, null, "server_busy"],
  ])("maps %i to %s", (status, body, expected) => {
    expect(classifyHttp(status, body as never)).toBe(expected);
  });

  /**
   * Per-minute and per-day are different problems. Treating a daily quota as a
   * rate limit burns four retries and then falls back anyway, slowly.
   */
  it("separates a daily quota from a per-minute one", () => {
    expect(isDailyQuota(DAILY_QUOTA_BODY as never)).toBe(true);
    expect(isDailyQuota(RATE_LIMIT_BODY as never)).toBe(false);
  });
});

describe("parseRetryDelayMs", () => {
  it("reads the delay out of the error body", () => {
    expect(parseRetryDelayMs(null, RATE_LIMIT_BODY as never)).toBe(21_000);
  });

  it("takes whichever of the header and the body asks for longer", () => {
    const headers = new Headers({ "retry-after": "30" });
    expect(parseRetryDelayMs(headers, RATE_LIMIT_BODY as never)).toBe(30_000);
  });

  it("is null when nobody said", () => {
    expect(parseRetryDelayMs(new Headers(), null)).toBeNull();
  });
});

// ─── Request shaping ──────────────────────────────────────────────────────

describe("toWire", () => {
  const request = {
    modelId: "m",
    system: "sys",
    text: "user",
    schema: QUESTION_SET_SCHEMA,
    validate: (raw: unknown) => raw,
    temperature: 0.4,
    maxOutputTokens: 1000,
    thinking: "low" as const,
    label: "questions" as const,
  };

  it("asks for JSON against the schema", () => {
    const wire = toWire(request, { thinkingSupported: true });
    expect(wire.generationConfig?.responseMimeType).toBe("application/json");
    expect(wire.generationConfig?.responseSchema).toBe(QUESTION_SET_SCHEMA);
  });

  /**
   * Children's books are full of wolves eating grandmothers. The default
   * threshold refuses them, which would read to a parent as "it just stopped
   * working".
   */
  it("loosens safety to BLOCK_ONLY_HIGH on exactly four categories", () => {
    const wire = toWire(request, { thinkingSupported: true });
    expect(wire.safetySettings).toHaveLength(4);
    for (const setting of wire.safetySettings ?? []) {
      expect(setting.threshold).toBe("BLOCK_ONLY_HIGH");
    }
    // Several models 400 on this one.
    expect(JSON.stringify(wire.safetySettings)).not.toContain("CIVIC_INTEGRITY");
  });

  it("omits thinkingConfig entirely for a model that rejects it", () => {
    const wire = toWire(request, { thinkingSupported: false });
    expect(wire.generationConfig?.thinkingConfig).toBeUndefined();
  });

  it("spends no thinking budget on transcription-shaped work", () => {
    expect(thinkingBudget("off", true)).toBe(0);
    expect(thinkingBudget("low", true)).toBeGreaterThan(0);
    expect(thinkingBudget("auto", true)).toBeUndefined();
  });

  it("puts the instruction before any media", () => {
    const wire = toWire(
      {
        ...request,
        media: [{ kind: "image", mimeType: "image/jpeg", data: "x", approxTokens: 1 }],
      },
      { thinkingSupported: true },
    );
    expect(wire.contents[0]?.parts[0]?.text).toBe("user");
    expect(wire.contents[0]?.parts[1]?.inlineData).toBeDefined();
  });
});

describe("toUsage", () => {
  /** Thinking tokens bill as output; missing them under-reports the ledger. */
  it("counts thinking tokens as output", () => {
    const usage = toUsage({
      promptTokenCount: 100,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 50,
      totalTokenCount: 350,
    });
    expect(usage.outputTokens).toBe(250);
  });

  it("survives a response with no usage block", () => {
    expect(toUsage(undefined).totalTokens).toBe(0);
  });
});

describe("extractText", () => {
  it("returns the candidate's text", () => {
    expect(extractText(asCandidate("hello") as never)).toBe("hello");
  });

  it("names a safety block", () => {
    expect(() => extractText(SAFETY_BLOCKED_RESPONSE as never)).toThrow(/safety_blocked/);
  });

  /** The failure a photographed book triggers, and the one worth naming. */
  it("names a recitation block separately from a safety one", () => {
    expect(() => extractText(RECITATION_RESPONSE as never)).toThrow(/recitation_blocked/);
  });

  it("names an empty response", () => {
    expect(() => extractText(EMPTY_RESPONSE as never)).toThrow(/empty_response/);
  });

  /** A truncated array is often salvageable, so this must not throw. */
  it("returns truncated text rather than failing on MAX_TOKENS", () => {
    const response = asCandidate(TRUNCATED_JSON, {
      candidates: [
        {
          content: { role: "model", parts: [{ text: TRUNCATED_JSON }] },
          finishReason: "MAX_TOKENS",
        },
      ],
    });
    expect(extractText(response as never)).toBe(TRUNCATED_JSON);
  });
});

// ─── JSON repair ──────────────────────────────────────────────────────────

describe("repair", () => {
  it("unwraps a fenced code block", () => {
    expect(parseLoosely(FENCED_JSON)?.value).toEqual(VALID_SET);
  });

  it("drops a trailing comma", () => {
    expect(parseLoosely(TRAILING_COMMA_JSON)?.value).toEqual(VALID_SET);
  });

  /**
   * The salvage that pays for itself: a set cut off at question 2 of 3 is a
   * perfectly good 2-question set, and recovering it locally saves a call.
   */
  it("salvages a response cut off mid-array", () => {
    const salvaged = salvageTruncated(TRUNCATED_JSON);
    expect(salvaged).not.toBeNull();
    const parsed = JSON.parse(salvaged as string) as { questions: unknown[] };
    expect(parsed.questions.length).toBeGreaterThan(0);
  });

  it("does not mistake a brace inside a string for structure", () => {
    const json = '{"a":"a } brace","b":1}';
    expect(extractJson(`noise ${json} noise`)).toBe(json);
  });

  it("reports honestly that clean JSON needed no repair", () => {
    expect(parseLoosely(VALID_JSON)?.repaired).toBe(false);
    expect(parseLoosely(FENCED_JSON)?.repaired).toBe(true);
  });

  it("gives up on something that is not JSON at all", () => {
    expect(parseLoosely("I'm sorry, I can't help with that.")).toBeNull();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────

describe("validateQuestionSet", () => {
  it("accepts a good set", () => {
    const set = validateQuestionSet(VALID_SET, SENTENCES, "uk");
    expect(set.questions).toHaveLength(3);
    expect(set.dropped).toHaveLength(0);
  });

  /**
   * The check the whole sentence-index design exists for. A question whose
   * answer is not in the sentence it cites was invented, and a child would be
   * asked about something the text never says.
   */
  it("drops a question whose answer is not in the sentence it cites", () => {
    const set = validateQuestionSet(BAD_CITATIONS_SET, SENTENCES, "uk");
    expect(set.questions).toHaveLength(1);
    expect(set.dropped.map((d) => d.reason)).toEqual([
      expect.stringContaining("out of range"),
      expect.stringContaining("not in sentence"),
    ]);
  });

  /**
   * Inference answers are *not* supposed to appear verbatim — that is what
   * makes them inferences — so the citation check must not touch them.
   */
  it("does not demand that an inference answer appear in the text", () => {
    const set = validateQuestionSet(VALID_SET, SENTENCES, "uk");
    expect(set.questions.some((q) => q.type === "inference")).toBe(true);
  });

  it("keeps only the first of two near-identical questions", () => {
    const set = validateQuestionSet(DUPLICATE_SET, SENTENCES, "uk");
    expect(set.questions).toHaveLength(1);
    expect(set.dropped[0]?.reason).toContain("duplicate");
  });

  it("always includes the canonical answer among the acceptable ones", () => {
    const set = validateQuestionSet(VALID_SET, SENTENCES, "uk");
    for (const question of set.questions) {
      expect(question.acceptableAnswers).toContain(question.canonicalAnswer);
    }
  });

  it("refuses a response that is not a question set at all", () => {
    expect(() => validateQuestionSet({ nope: 1 }, SENTENCES, "uk")).toThrow(/questions/);
  });

  it("asks for a repair only when most questions were unusable", () => {
    expect(needsRepair(validateQuestionSet(VALID_SET, SENTENCES, "uk"))).toBe(false);
    expect(needsRepair(validateQuestionSet(BAD_CITATIONS_SET, SENTENCES, "uk"))).toBe(true);
  });
});

// ─── Cache keys ───────────────────────────────────────────────────────────

describe("cache keys", () => {
  const base = { text: STORY, level: "developing" as const, modelId: "gemini-2.5-flash", count: 3 };

  it("ignores whitespace and case, so a re-paste hits the same entry", () => {
    expect(questionSetKey({ ...base, text: `  ${STORY.toUpperCase()}  ` })).toBe(
      questionSetKey(base),
    );
  });

  it("changes with the level, the model and the count", () => {
    expect(questionSetKey({ ...base, level: "fluent" })).not.toBe(questionSetKey(base));
    expect(questionSetKey({ ...base, modelId: "other" })).not.toBe(questionSetKey(base));
    expect(questionSetKey({ ...base, count: 5 })).not.toBe(questionSetKey(base));
  });

  /**
   * Without the prompt version in the key, editing a prompt leaves every cached
   * set serving questions from the old one forever, invisibly.
   */
  it("includes the prompt version", () => {
    expect(questionSetKey(base)).toContain(PROMPT_VERSION);
  });

  it("keeps the offline generator in its own namespace", () => {
    expect(localSetKey(base)).not.toBe(questionSetKey(base));
  });
});

// ─── Prompts ──────────────────────────────────────────────────────────────

describe("buildQuestionPrompt", () => {
  const prompt = buildQuestionPrompt({ sentences: SENTENCES, level: "developing", count: 3 });

  /**
   * Both of these fail silently if dropped: no language lock and a Polish text
   * comes back with English questions; no level block and a seven-year-old is
   * asked about narrative structure.
   */
  it("always carries the language lock and the level block", () => {
    expect(prompt.system).toContain("LANGUAGE RULE");
    expect(prompt.system).toContain("TARGET READER");
  });

  it("describes the level in constraints rather than an age alone", () => {
    const beginner = buildQuestionPrompt({ sentences: SENTENCES, level: "beginner", count: 3 });
    expect(beginner.system).toContain("ONE word");
    expect(beginner.system).not.toContain("main_idea'");
  });

  it("numbers the sentences so the citation can be checked", () => {
    expect(prompt.user).toContain("[0] ");
    expect(prompt.user).toContain(`[${SENTENCES.length - 1}] `);
  });

  it("asks for the exact number of questions wanted", () => {
    expect(prompt.user).toContain("exactly 3 questions");
  });

  it("passes the child's weakest skills through when there are any", () => {
    const weighted = buildQuestionPrompt({
      sentences: SENTENCES,
      level: "fluent",
      count: 3,
      emphasise: ["inference"],
    });
    expect(weighted.system).toContain("weakest at: inference");
  });

  /** A name printed once is a spelling test, not a comprehension question. */
  it("forbids asking for a proper noun seen only once", () => {
    expect(prompt.system).toContain("proper noun");
  });
});

// ─── Model catalogue ──────────────────────────────────────────────────────

describe("selectUsableModels", () => {
  const models = selectUsableModels(MODELS_LIST.models as never);

  it("keeps only models that can generate content", () => {
    expect(models.map((m) => m.id)).not.toContain("text-embedding-004");
    expect(models.map((m) => m.id)).not.toContain("imagen-3.0-generate-002");
    expect(models.map((m) => m.id)).not.toContain("gemini-2.0-flash-live-001");
  });

  it("strips the models/ prefix", () => {
    expect(models.every((m) => !m.id.startsWith("models/"))).toBe(true);
  });

  /** Cheapest first: this app's cost model assumes a small fast model. */
  it("prefers flash-lite, then flash, then pro", () => {
    expect(models[0]?.id).toContain("flash-lite");
    expect(models.at(-1)?.id).toContain("pro");
  });

  /**
   * The rule that survives a rename: preference is expressed as patterns, so a
   * newer family is picked up without being named in the source.
   */
  it("prefers a newer family within the same rank", () => {
    const flashes = models.filter((m) => m.id.endsWith("flash"));
    expect(flashes[0]?.id).toBe("gemini-3-flash");
  });

  it("falls back to the parent's choice only while it still exists", () => {
    expect(resolveModel(models, "gemini-2.5-pro")?.id).toBe("gemini-2.5-pro");
    expect(resolveModel(models, "gemini-1.0-retired")?.id).toBe(defaultModel(models)?.id);
    expect(resolveModel([], "anything")).toBeNull();
  });
});

// ─── Provider, against a scripted network ─────────────────────────────────

describe("GeminiProvider", () => {
  it("validates a key with models.list, which costs no quota", async () => {
    const { provider: gemini, requests } = provider([{ status: 200, body: MODELS_LIST }]);
    const check = await gemini.validateKey();

    expect(check.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url).toContain("/models");
  });

  /** A key in a URL leaks into devtools history and any Referer sent. */
  it("sends the key in a header, never in the query string", async () => {
    const { provider: gemini, requests } = provider([{ status: 200, body: MODELS_LIST }]);
    await gemini.validateKey();

    expect(requests[0]?.headers["x-goog-api-key"]).toBe("AIzaTEST");
    expect(requests[0]?.url).not.toContain("key=");
  });

  it("reports an invalid key distinctly from a restricted one", async () => {
    const invalid = provider([{ status: 400, body: INVALID_KEY_BODY }]);
    expect(await invalid.provider.validateKey()).toMatchObject({ ok: false, code: "invalid_key" });

    const restricted = provider([{ status: 403, body: RESTRICTED_KEY_BODY }]);
    expect(await restricted.provider.validateKey()).toMatchObject({
      ok: false,
      code: "key_restricted",
    });
  });

  /**
   * The capability probe. Whether a model accepts `thinkingConfig` is not in
   * the catalogue, so the first 400 about it is the answer — and it must only
   * be paid once.
   */
  it("retries once without thinkingConfig, then remembers", async () => {
    const scripted = scriptFetch([
      { status: 400, body: THINKING_REJECTED_BODY },
      { status: 200, body: asCandidate(VALID_JSON) },
      { status: 200, body: asCandidate(VALID_JSON) },
    ]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    const request = {
      modelId: "picky-model",
      system: "s",
      text: "t",
      schema: QUESTION_SET_SCHEMA,
      validate: (raw: unknown) => validateQuestionSet(raw, SENTENCES, "uk"),
      temperature: 0,
      maxOutputTokens: 100,
      thinking: "low" as const,
      label: "questions" as const,
    };

    await gemini.complete(request);
    await gemini.complete(request);

    // Three calls for two completions: one wasted 400, never repeated.
    expect(scripted.requests).toHaveLength(3);
    const bodies = scripted.requests.map((r) => r.body as { generationConfig?: object });
    expect(bodies[0]?.generationConfig).toHaveProperty("thinkingConfig");
    expect(bodies[1]?.generationConfig).not.toHaveProperty("thinkingConfig");
    expect(bodies[2]?.generationConfig).not.toHaveProperty("thinkingConfig");
  });

  it("repairs a fenced response without another call", async () => {
    const scripted = scriptFetch([{ status: 200, body: asCandidate(FENCED_JSON) }]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    const result = await gemini.complete({
      modelId: "m",
      system: "s",
      text: "t",
      schema: QUESTION_SET_SCHEMA,
      validate: (raw: unknown) => validateQuestionSet(raw, SENTENCES, "uk"),
      temperature: 0,
      maxOutputTokens: 100,
      thinking: "off",
      label: "questions",
    });

    expect(result.repaired).toBe(true);
    expect(result.value.questions).toHaveLength(3);
    expect(scripted.requests).toHaveLength(1);
  });

  it("surfaces a rate limit with its retry delay", async () => {
    const scripted = scriptFetch([
      { status: 429, body: RATE_LIMIT_BODY, headers: { "retry-after": "21" } },
    ]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    await expect(
      gemini.complete({
        modelId: "m",
        system: "s",
        text: "t",
        schema: QUESTION_SET_SCHEMA,
        validate: (raw: unknown) => raw,
        temperature: 0,
        maxOutputTokens: 10,
        thinking: "off",
        label: "questions",
      }),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 21_000 });
  });
});

// ─── The pipeline ─────────────────────────────────────────────────────────

describe("generateQuestions", () => {
  const input = {
    sentences: SENTENCES,
    lang: "uk" as const,
    level: "developing" as const,
    count: 3,
    modelId: "gemini-2.5-flash",
  };

  it("produces a whole set in one call", async () => {
    const { provider: gemini, requests } = provider([
      { status: 200, body: asCandidate(VALID_JSON) },
    ]);
    const outcome = await generateQuestions(gemini, input);

    expect(requests).toHaveLength(1);
    expect(outcome.questions).toHaveLength(3);
    expect(outcome.repaired).toBe(false);
    expect(outcome.promptTokens).toBe(800);
  });

  it("reports the questions it had to throw away", async () => {
    const { provider: gemini } = provider([
      { status: 200, body: asCandidate(JSON.stringify(VALID_SET)) },
    ]);
    const outcome = await generateQuestions(gemini, input);
    expect(outcome.dropped).toEqual([]);
  });

  /**
   * One repair, and exactly one. If the model could not follow the schema when
   * told precisely what was wrong, a third attempt will not help and the
   * offline generator is waiting.
   */
  it("spends one repair call on an unusable set, then succeeds", async () => {
    const scripted = scriptFetch([
      { status: 200, body: asCandidate(JSON.stringify(BAD_CITATIONS_SET)) },
      { status: 200, body: asCandidate(VALID_JSON) },
    ]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    const outcome = await generateQuestions(gemini, input);
    expect(scripted.requests).toHaveLength(2);
    expect(outcome.repaired).toBe(true);
    expect(outcome.questions).toHaveLength(3);
  });

  it("gives up rather than looping when the repair also fails", async () => {
    const scripted = scriptFetch([
      { status: 200, body: asCandidate(JSON.stringify(BAD_CITATIONS_SET)) },
      { status: 200, body: asCandidate(JSON.stringify(BAD_CITATIONS_SET)) },
    ]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    await expect(generateQuestions(gemini, input)).rejects.toMatchObject({ code: "bad_json" });
    expect(scripted.requests).toHaveLength(2);
  });

  it("does not retry a safety block", async () => {
    const scripted = scriptFetch([{ status: 200, body: SAFETY_BLOCKED_RESPONSE }]);
    const gemini = new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch });

    await expect(generateQuestions(gemini, input)).rejects.toMatchObject({
      code: "safety_blocked",
    });
    expect(scripted.requests).toHaveLength(1);
  });

  it("sizes the output budget to the number of questions", () => {
    expect(outputBudget(3)).toBeLessThan(outputBudget(10));
    expect(outputBudget(200)).toBeLessThanOrEqual(8192);
  });
});
