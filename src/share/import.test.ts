// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/data/db";
import { listTexts, saveImportedPack } from "@/data/repositories";
import { importedSetKey } from "@/ai/core/cacheKey";
import { getQuestionsFor } from "@/quiz/questionSource";
import { DEFAULT_SETTINGS, splitSentences, type Question } from "@/engine";
import { buildPack } from "./pack.ts";
import { decodePack, encodePack } from "./codec.ts";

/**
 * The point of the whole feature: two children in two houses, one test.
 *
 * Which means the questions have to survive the crossing *and* be the ones
 * actually played on the other side — not a hint that the receiving app then
 * regenerates into something else.
 */

const BODY = [
  "Одного ранку лисиця вийшла з нори.",
  "Вона побачила журавля біля струмка.",
  "Журавель ловив рибу довгим дзьобом.",
  "Лисиця захотіла подружитися з птахом.",
].join(" ");

function question(id: string, sentenceIndex: number, answer: string): Question {
  return {
    id,
    type: "literal",
    tier: "easy",
    sentenceIndex,
    prompt: `Питання ${id}`,
    canonicalAnswer: answer,
    acceptableAnswers: [answer],
    gradingMode: "exact-ish",
    rationale: "",
  };
}

const QUESTIONS = [question("a", 1, "журавля"), question("b", 2, "рибу")];

function pack() {
  return buildPack({
    text: {
      id: "sender-copy",
      title: "Лисиця і журавель",
      body: BODY,
      lang: "uk",
      source: "paste",
      hash: "whatever",
      wordCount: 24,
      sentenceCount: splitSentences(BODY, "uk").length,
      createdAt: 1,
    },
    questions: QUESTIONS,
    settings: { ...DEFAULT_SETTINGS, level: "fluent" },
    producedBy: "gemini:sender",
  });
}

async function importIt() {
  const read = await decodePack(await encodePack(pack()));
  return saveImportedPack({
    cacheKey: importedSetKey({ text: read.pack.text.body, level: read.pack.settings.level }),
    title: read.pack.text.title,
    body: read.pack.text.body,
    lang: read.pack.text.lang,
    level: read.pack.settings.level,
    questions: read.pack.questions,
    producedBy: read.pack.producedBy,
  });
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all([db.texts.clear(), db.questionSets.clear()]);
});

describe("importing a shared pack", () => {
  it("lands in the library as a text with its questions", async () => {
    const text = await importIt();

    expect(text?.title).toBe("Лисиця і журавель");
    expect(text?.source).toBe("shared");
    expect(await listTexts()).toHaveLength(1);
  });

  /**
   * The claim the feature rests on. Review is on — the default — so a text this
   * device made would be playing practice questions here; a shared one plays
   * exactly what was sent, with no key and no request.
   */
  it("plays the questions that were sent, not questions of its own", async () => {
    const text = await importIt();
    const source = await getQuestionsFor(text!, { ...DEFAULT_SETTINGS, level: "fluent" });

    expect(source.questions.map((item) => item.prompt)).toEqual(
      QUESTIONS.map((item) => item.prompt),
    );
    expect(source.pendingReview).toBe(false);
    expect(source.fromModel).toBe(true);
  });

  it("asks nobody for approval: the sender already did that", async () => {
    await importIt();
    const key = importedSetKey({ text: BODY, level: "fluent" });

    expect((await db.questionSets.get(key))?.approved).toBe(true);
  });

  /** A pack forwarded twice is one library card, not two. */
  it("does not duplicate a text that is imported again", async () => {
    await importIt();
    await importIt();

    expect(await listTexts()).toHaveLength(1);
    expect(await db.questionSets.count()).toBe(1);
  });

  /**
   * The level travels with the pack, so the set has to be found at that level.
   * At another one there is nothing shared to play, and the app falls back the
   * way it always does rather than showing an empty round.
   */
  it("keeps the questions with the level they were written for", async () => {
    const text = await importIt();
    const other = await getQuestionsFor(text!, { ...DEFAULT_SETTINGS, level: "beginner" });

    expect(other.questions.map((item) => item.prompt)).not.toEqual(
      QUESTIONS.map((item) => item.prompt),
    );
  });
});
