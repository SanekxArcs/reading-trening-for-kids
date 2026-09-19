import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/data/db";
import {
  finishSession,
  listAnswers,
  listSessions,
  saveAnswers,
  saveText,
  startSession,
} from "@/data/repositories";
import { getQuestionsFor, getStoredQuestions } from "./questionSource.ts";
import { DEFAULT_SETTINGS, countChars, gradeLocally, sessionMetrics, speedFlag } from "@/engine";

/**
 * The whole loop, with no API key, no network and no browser: paste a text,
 * get questions, read it, answer them, see the numbers.
 *
 * This is the check that phase 2 actually delivered a working product rather
 * than a set of modules that each pass in isolation. It runs entirely on the
 * offline path, which is exactly the state a parent is in before they have set
 * up a key.
 */

const STORY = [
  "Одного ранку маленька лисиця вийшла зі своєї затишної нори.",
  "Вона побачила великого сірого журавля біля холодного струмка.",
  "Журавель уважно ловив рибу своїм довгим гострим дзьобом.",
  "Лисиця захотіла подружитися з цим незвичайним птахом.",
  "Вони весело розмовляли аж до самого пізнього вечора.",
  "Відтоді лисиця і журавель завжди гуляли разом лісом.",
].join(" ");

beforeEach(async () => {
  await Promise.all([
    db.texts.clear(),
    db.questionSets.clear(),
    db.sessions.clear(),
    db.answers.clear(),
    db.stats.clear(),
  ]);
});

describe("a whole reading session, offline", () => {
  it("runs from pasted text to a score, with no key and no network", async () => {
    // 1. A parent pastes a text.
    const text = await saveText({ body: STORY });
    expect(text).not.toBeNull();
    expect(text!.sentenceCount).toBe(6);

    // 2. Questions are prepared while the child reads.
    const source = await getQuestionsFor(text!, DEFAULT_SETTINGS);
    expect(source.fromModel).toBe(false);
    expect(source.producedBy).toBe("local");
    expect(source.questions.length).toBeGreaterThan(0);
    expect(source.questions.length).toBeLessThanOrEqual(text!.sentenceCount);

    // Every question points at a real sentence of this text.
    for (const question of source.questions) {
      expect(question.sentenceIndex).toBeGreaterThanOrEqual(0);
      expect(question.sentenceIndex).toBeLessThan(text!.sentenceCount);
    }

    // 3. The child reads at a believable pace.
    const readingMs = text!.wordCount * 900;
    expect(speedFlag(text!.wordCount, readingMs)).toBe("ok");

    const session = await startSession({
      textId: text!.id,
      cacheKey: source.cacheKey,
      level: DEFAULT_SETTINGS.level,
      readingMs,
      wordCount: text!.wordCount,
      charCount: countChars(text!.body),
      speedCounts: true,
    });
    expect(session).not.toBeNull();

    // 4. They answer every question correctly, with one typo thrown in.
    const answers = source.questions.map((question, index) => {
      const typed =
        index === 0 ? `${question.canonicalAnswer.slice(0, -1)}${"я"}` : question.canonicalAnswer;
      const local = gradeLocally(question, typed, text!.lang);
      return {
        sessionId: session!.id,
        questionId: question.id,
        question,
        given: typed,
        verdict: local.verdict === "unsure" ? ("unsure" as const) : local.verdict,
        judgedBy: `local:${local.reason}`,
        ms: 9_000,
        usedHint: false,
      };
    });
    await saveAnswers(answers);
    await finishSession(session!.id);

    // 5. The result screen's numbers.
    const stored = await listAnswers(session!.id);
    expect(stored).toHaveLength(source.questions.length);

    const metrics = sessionMetrics({
      wordCount: session!.wordCount,
      charCount: session!.charCount,
      readingMs: session!.readingMs,
      verdicts: stored.map((answer) => answer.verdict),
      answerMs: stored.map((answer) => answer.ms),
    });

    expect(metrics.speedCounts).toBe(true);
    expect(metrics.wordsPerMinute).toBeCloseTo(66.7, 0);
    expect(metrics.comprehension.score).not.toBeNull();
    expect(metrics.effectiveWpm).toBeGreaterThan(0);

    // 6. The session is in the history, and its questions can be read back.
    expect(await listSessions(text!.id)).toHaveLength(1);
    expect(
      await getStoredQuestions(source.cacheKey, text!.id, DEFAULT_SETTINGS.level),
    ).toHaveLength(source.questions.length);
  });

  /**
   * Re-reading the same text is the cheapest progress signal there is, and it
   * must cost nothing: the second read reuses the cached set rather than
   * regenerating it.
   */
  it("reuses the cached questions on a second reading", async () => {
    const text = await saveText({ body: STORY });
    const first = await getQuestionsFor(text!, DEFAULT_SETTINGS);
    const second = await getQuestionsFor(text!, DEFAULT_SETTINGS);

    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.questions).toEqual(first.questions);
    expect(await db.questionSets.count()).toBe(1);
  });

  it("makes a different set for a different reading level", async () => {
    const text = await saveText({ body: STORY });
    const developing = await getQuestionsFor(text!, DEFAULT_SETTINGS);
    const beginner = await getQuestionsFor(text!, { ...DEFAULT_SETTINGS, level: "beginner" });

    expect(beginner.cacheKey).not.toBe(developing.cacheKey);
    expect(await db.questionSets.count()).toBe(2);
  });

  /** A child who scrolls past the text gets questions, but no speed record. */
  it("refuses to record a speed for a text that was scrolled past", async () => {
    const text = await saveText({ body: STORY });
    const readingMs = 1_000;
    expect(speedFlag(text!.wordCount, readingMs)).toBe("too_fast");

    const metrics = sessionMetrics({
      wordCount: text!.wordCount,
      charCount: countChars(text!.body),
      readingMs,
      verdicts: ["correct", "correct"],
      answerMs: [5_000, 5_000],
    });

    expect(metrics.speedCounts).toBe(false);
    // Comprehension still counts: they may have read it before.
    expect(metrics.comprehension.score).toBe(1);
  });
});
