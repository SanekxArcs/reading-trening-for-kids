import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db.ts";
import {
  deleteText,
  findAnyQuestionSet,
  finishSession,
  getQuestionSet,
  getSession,
  listSessions,
  listTexts,
  loadStats,
  recordOutcome,
  saveAnswers,
  saveQuestionSet,
  saveText,
  startSession,
} from "./repositories.ts";
import { masteryBand, skillId, type Question } from "@/engine";

const STORY =
  "Одного ранку маленька лисиця вийшла з нори. Вона побачила великого журавля біля струмка. " +
  "Журавель ловив рибу довгим дзьобом. Лисиця захотіла подружитися з птахом.";

function question(id = "q1"): Question {
  return {
    id,
    type: "literal",
    tier: "easy",
    sentenceIndex: 0,
    prompt: "Хто вийшов з нори?",
    canonicalAnswer: "лисиця",
    acceptableAnswers: ["лисиця"],
    gradingMode: "exact-ish",
    rationale: "",
  };
}

beforeEach(async () => {
  await Promise.all([
    db.texts.clear(),
    db.questionSets.clear(),
    db.sessions.clear(),
    db.answers.clear(),
    db.stats.clear(),
  ]);
});

describe("saveText", () => {
  it("counts words and sentences and guesses the language", async () => {
    const text = await saveText({ body: STORY });
    expect(text).not.toBeNull();
    expect(text?.lang).toBe("uk");
    expect(text?.sentenceCount).toBe(4);
    expect(text?.wordCount).toBeGreaterThan(20);
  });

  it("derives a title when none is given", async () => {
    const text = await saveText({ body: STORY });
    expect(text?.title.length).toBeGreaterThan(0);
  });

  /**
   * De-duplication is what makes re-reading work at all: the same page pasted
   * twice must reach the same library card, its history and its cached
   * questions, not a second card that costs another API call to fill.
   */
  it("returns the existing entry for the same content", async () => {
    const first = await saveText({ body: STORY });
    const second = await saveText({ body: `  ${STORY.replace(/ /g, "  ")}  ` });
    expect(second?.id).toBe(first?.id);
    expect(await listTexts()).toHaveLength(1);
  });

  it("refuses an empty text", async () => {
    expect(await saveText({ body: "   \n " })).toBeNull();
  });
});

describe("question sets", () => {
  it("round-trips by cache key", async () => {
    await saveQuestionSet({
      cacheKey: "k1",
      textId: "t1",
      level: "developing",
      questions: [question()],
      producedBy: "local",
      approved: true,
    });
    expect((await getQuestionSet("k1"))?.questions).toHaveLength(1);
  });

  /**
   * The fallback a parent with no quota left depends on: any set for this text
   * and level, whatever model made it, newest first.
   */
  it("finds any set for a text and level, newest first", async () => {
    await saveQuestionSet({
      cacheKey: "old",
      textId: "t1",
      level: "developing",
      questions: [question("a")],
      producedBy: "gemini:flash",
      approved: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveQuestionSet({
      cacheKey: "new",
      textId: "t1",
      level: "developing",
      questions: [question("b")],
      producedBy: "local",
      approved: true,
    });

    expect((await findAnyQuestionSet("t1", "developing"))?.cacheKey).toBe("new");
    expect(await findAnyQuestionSet("t1", "fluent")).toBeNull();
  });
});

describe("sessions", () => {
  it("records a reading and lists it oldest first", async () => {
    const text = await saveText({ body: STORY });
    const base = {
      textId: text!.id,
      cacheKey: "k",
      level: "developing" as const,
      wordCount: 30,
      charCount: 180,
      speedCounts: true,
    };
    await startSession({ ...base, readingMs: 40_000 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await startSession({ ...base, readingMs: 30_000 });

    const sessions = await listSessions(text!.id);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.readingMs).toBe(40_000);
  });

  /**
   * The round's score is written down, not recomputed.
   *
   * A result screen that recalculates points from stored answers would drift
   * from the number the child watched climbing during the quiz — a parent
   * overruling one answer afterwards would silently change what the child was
   * told they earned.
   */
  it("keeps the score the round finished with", async () => {
    const text = await saveText({ body: STORY });
    const session = await startSession({
      textId: text!.id,
      cacheKey: "k",
      level: "developing",
      readingMs: 40_000,
      wordCount: 30,
      charCount: 180,
      speedCounts: true,
    });

    await finishSession(session!.id, {
      points: 120,
      bestStreak: 5,
      goalReached: true,
      playerLevel: 2,
    });

    const stored = await getSession(session!.id);
    expect(stored?.points).toBe(120);
    expect(stored?.bestStreak).toBe(5);
    expect(stored?.goalReached).toBe(true);
    expect(stored?.playerLevel).toBe(2);
    expect(stored?.finishedAt).not.toBeNull();
  });

  /** A session from before the game layer existed still finishes cleanly. */
  it("finishes a session with no score at all", async () => {
    const text = await saveText({ body: STORY });
    const session = await startSession({
      textId: text!.id,
      cacheKey: "k",
      level: "developing",
      readingMs: 40_000,
      wordCount: 30,
      charCount: 180,
      speedCounts: true,
    });

    await finishSession(session!.id);

    const stored = await getSession(session!.id);
    expect(stored?.finishedAt).not.toBeNull();
    expect(stored?.points).toBeUndefined();
  });
});

describe("deleteText", () => {
  /**
   * The only delete in the app. It has to take the sessions with it: a history
   * row whose text is gone cannot open a result screen, and orphans would
   * slowly fill the progress list with links to nothing.
   */
  it("takes the sessions, answers and question sets with it", async () => {
    const text = await saveText({ body: STORY });
    const session = await startSession({
      textId: text!.id,
      cacheKey: "k",
      level: "developing",
      readingMs: 30_000,
      wordCount: 30,
      charCount: 180,
      speedCounts: true,
    });
    await saveQuestionSet({
      cacheKey: "k",
      textId: text!.id,
      level: "developing",
      questions: [question()],
      producedBy: "local",
      approved: true,
    });
    await saveAnswers([
      {
        sessionId: session!.id,
        questionId: "q1",
        question: question(),
        given: "лисиця",
        verdict: "correct",
        judgedBy: "local:exact",
        ms: 4000,
        usedHint: false,
      },
    ]);

    await deleteText(text!.id);

    expect(await db.texts.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.answers.count()).toBe(0);
    expect(await db.questionSets.count()).toBe(0);
  });
});

describe("recordOutcome", () => {
  it("accumulates into one row per skill", async () => {
    const id = skillId("inference", "developing");
    const outcome = { isCorrect: true, ms: 6_000, level: "developing" as const, aided: false };

    await recordOutcome(id, outcome, 1_000);
    await recordOutcome(id, outcome, 2_000);

    const stats = await loadStats();
    expect(stats.get(id)?.attempts).toBe(2);
    expect(masteryBand(stats.get(id), 2_000)).toBe("learning");
  });

  it("starts from empty for a skill never seen", async () => {
    await recordOutcome(
      skillId("main_idea", "fluent"),
      { isCorrect: false, ms: 9_000, level: "fluent", aided: false },
      1_000,
    );
    const stats = await loadStats();
    expect(stats.get(skillId("main_idea", "fluent"))?.correct).toBe(0);
  });
});
