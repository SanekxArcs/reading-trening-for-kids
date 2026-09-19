import { describe, expect, it } from "vitest";
import { splitSentences } from "@/engine";
import { buildStoryPrompt, STORY_SENTENCES } from "./core/prompts/story.ts";
import { generateStory, storyBudget } from "./pipeline/generateStory.ts";
import { GeminiProvider } from "./gemini/provider.ts";
import { asCandidate, scriptFetch } from "./__fixtures__/fetchMock.ts";

const GOOD_STORY = [
  "Одного ранку Оленка знайшла біля ґанку маленьке сіре кошеня.",
  "Кошеня було мокре і тремтіло від холодного дощу.",
  "Оленка обережно взяла його на руки і понесла додому.",
  "Вдома вона витерла кошеня рушником і налила йому теплого молока.",
  "Кошеня випило все молоко і голосно замуркотіло.",
  "Оленка назвала його Сірко і постелила йому ковдру біля печі.",
  "Увечері Сірко вже бігав по кухні за клубком ниток.",
  "Мама подивилася на них і тільки усміхнулася.",
].join(" ");

function storyJson(text = GOOD_STORY, title = "Сірко") {
  return JSON.stringify({ language: "uk", title, text });
}

function provider(steps: Parameters<typeof scriptFetch>[0]) {
  const scripted = scriptFetch(steps);
  return {
    gemini: new GeminiProvider({ apiKey: "k", fetchImpl: scripted.fetch }),
    requests: scripted.requests,
  };
}

const INPUT = { lang: "uk" as const, level: "developing" as const, length: "medium" as const };

describe("buildStoryPrompt", () => {
  const prompt = buildStoryPrompt(INPUT);

  it("names the language in plain words rather than a tag", () => {
    expect(prompt.system).toContain("Ukrainian");
    expect(buildStoryPrompt({ ...INPUT, lang: "pl" }).system).toContain("Polish");
  });

  /** Everything downstream counts sentences, not words. */
  it("asks for a length in sentences", () => {
    expect(prompt.system).toContain(`${STORY_SENTENCES.medium} sentences`);
    expect(buildStoryPrompt({ ...INPUT, length: "short" }).system).toContain(
      `${STORY_SENTENCES.short} sentences`,
    );
  });

  it("states the vocabulary as constraints, not as an age", () => {
    const beginner = buildStoryPrompt({ ...INPUT, level: "beginner" });
    expect(beginner.system).toContain("one or two syllables");
    expect(beginner.system).not.toContain("6-7 years");
  });

  /**
   * The rule that makes a generated story usable here. A story that ends "and
   * so she learned that friends help each other" has nothing left to infer, and
   * inference is half of what the app is teaching.
   */
  it("forbids stating the moral", () => {
    expect(prompt.system).toContain("Do not state the moral");
  });

  /** A name printed once is a spelling test, not a comprehension question. */
  it("requires any character name to repeat", () => {
    expect(prompt.system).toContain("at least three times");
  });

  it("passes a topic through, and invents one when there is none", () => {
    expect(buildStoryPrompt({ ...INPUT, topic: "  a lost umbrella  " }).system).toContain(
      "about: a lost umbrella",
    );
    expect(prompt.system).toContain("Choose the subject yourself");
  });

  it("works the child's missed words back in without pointing at them", () => {
    const revisiting = buildStoryPrompt({ ...INPUT, revisit: ["струмок", "журавель"] });
    expect(revisiting.system).toContain("струмок, журавель");
    expect(revisiting.system).toContain("Do not draw attention to them");
  });
});

describe("generateStory", () => {
  it("returns a story with the counts the app made of it", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(storyJson()) }]);
    const story = await generateStory(gemini, "m", INPUT);

    expect(requests).toHaveLength(1);
    expect(story.title).toBe("Сірко");
    expect(story.sentenceCount).toBe(splitSentences(GOOD_STORY, "uk").length);
    expect(story.wordCount).toBeGreaterThan(40);
  });

  /**
   * The one call in the app that wants variety: asking twice for a story about
   * a fox should not produce the same fox.
   */
  it("asks for variety, unlike every other call", async () => {
    const { gemini, requests } = provider([{ status: 200, body: asCandidate(storyJson()) }]);
    await generateStory(gemini, "m", INPUT);

    const body = requests[0]?.body as { generationConfig: Record<string, unknown> } | undefined;
    expect(body?.generationConfig["temperature"]).toBeGreaterThan(0.5);
  });

  /**
   * Three sentences is a failed generation, not a short story: there is nothing
   * to spread questions across.
   */
  it("rejects a story far shorter than asked for", async () => {
    const { gemini } = provider([
      { status: 200, body: asCandidate(storyJson("Кіт спав. Потім прокинувся.")) },
    ]);
    await expect(generateStory(gemini, "m", INPUT)).rejects.toMatchObject({ code: "bad_json" });
  });

  it("accepts a story longer than asked for", async () => {
    const long = `${GOOD_STORY} ${GOOD_STORY}`;
    const { gemini } = provider([{ status: 200, body: asCandidate(storyJson(long)) }]);
    await expect(generateStory(gemini, "m", INPUT)).resolves.toBeTruthy();
  });

  /** The library derives a title from the opening words, exactly as for a paste. */
  it("does not fail over a missing title", async () => {
    const { gemini } = provider([{ status: 200, body: asCandidate(storyJson(GOOD_STORY, "")) }]);
    const story = await generateStory(gemini, "m", INPUT);
    expect(story.title).toBe("");
    expect(story.text.length).toBeGreaterThan(0);
  });

  it("refuses an empty story", async () => {
    const { gemini } = provider([{ status: 200, body: asCandidate(storyJson("   ", "T")) }]);
    await expect(generateStory(gemini, "m", INPUT)).rejects.toMatchObject({ code: "bad_json" });
  });

  it("sizes the budget to the length asked for", () => {
    expect(storyBudget(STORY_SENTENCES.short)).toBeLessThan(storyBudget(STORY_SENTENCES.long));
    expect(storyBudget(1000)).toBeLessThanOrEqual(4096);
  });

  /**
   * A generated story is original, so it cannot be recited from anything — the
   * failure mode a photographed page of a published book runs straight into.
   */
  it("produces a text the question pipeline can then work on", async () => {
    const { gemini } = provider([{ status: 200, body: asCandidate(storyJson()) }]);
    const story = await generateStory(gemini, "m", INPUT);

    const sentences = splitSentences(story.text, "uk");
    expect(sentences.length).toBeGreaterThanOrEqual(5);
    expect(sentences.every((sentence) => sentence.text.length > 0)).toBe(true);
  });
});
