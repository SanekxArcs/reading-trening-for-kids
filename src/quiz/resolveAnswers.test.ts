// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/data/db";
import { instantQueue, setQueue } from "@/ai/runtime/queue";
import { gradeLocally, splitSentences, type Question } from "@/engine";
import { asCandidate, scriptFetch } from "@/ai/__fixtures__/fetchMock";
import { RATE_LIMIT_BODY, STORY } from "@/ai/__fixtures__/questionSets";
import { resolveAnswers } from "./resolveAnswers.ts";
import type { RecordedAnswer } from "./useQuiz.ts";

/**
 * Settling the answers the local matcher could not.
 *
 * The behaviour worth protecting is not "the model is called" — it is
 * everything around that: that it is called once, only for what is genuinely
 * unclear, and that nothing is marked wrong when it cannot be reached.
 */

const SENTENCES = splitSentences(STORY, "uk");

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q",
    type: "literal",
    tier: "easy",
    sentenceIndex: 0,
    prompt: "Хто вийшов з нори?",
    canonicalAnswer: "лисиця",
    acceptableAnswers: ["лисиця"],
    gradingMode: "exact-ish",
    rationale: "",
    ...overrides,
  };
}

function answer(given: string, overrides: Partial<Question> = {}): RecordedAnswer {
  const q = question(overrides);
  const local = gradeLocally(q, given, "uk");
  return {
    question: q,
    given,
    verdict: local.verdict === "unsure" ? "unsure" : local.verdict,
    local,
    ms: 8000,
    usedHint: false,
  };
}

/** An answer the local cascade cannot settle: a semantic question, no overlap. */
const unclear = () =>
  answer("щось зовсім інше без спільних слів", {
    gradingMode: "semantic",
    acceptableAnswers: ["про дружбу"],
  });

function useKey() {
  localStorage.setItem("read_master_api_key", "AIzaTEST");
  localStorage.setItem("read_master_model", "gemini-2.5-flash");
}

const verdicts = (ids: string[], verdict = "correct") =>
  JSON.stringify({
    results: ids.map((id) => ({
      id,
      reasoning: "The child named the right thing.",
      verdict,
      confidence: 0.9,
      feedback: "Молодець!",
    })),
  });

beforeEach(async () => {
  // A fresh queue per test, with instant sleeps: the real one paces sends
  // seconds apart, which is correct in a browser and unusable in a suite.
  setQueue(instantQueue());
  localStorage.clear();
  await db.ledger.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAnswers", () => {
  /** The cheap path, and the common one: no key needed, nothing sent. */
  it("settles clear answers locally, with no call at all", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(verdicts(["0"])) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const outcome = await resolveAnswers(
      [answer("лисиця"), answer("будинок")],
      SENTENCES,
      "uk",
      "developing",
    );

    expect(scripted.requests).toHaveLength(0);
    expect(outcome.escalated).toBe(0);
    expect(outcome.answers.map((a) => a.verdict)).toEqual(["correct", "incorrect"]);
    expect(outcome.answers.every((a) => a.judgedBy.startsWith("local:"))).toBe(true);
  });

  it("sends only the unclear ones, and only once", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(verdicts(["1", "2"])) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const outcome = await resolveAnswers(
      [answer("лисиця"), unclear(), unclear()],
      SENTENCES,
      "uk",
      "developing",
    );

    expect(scripted.requests).toHaveLength(1);
    expect(outcome.escalated).toBe(2);
    expect(outcome.answers[0]?.judgedBy).toContain("local:");
    expect(outcome.answers[1]?.judgedBy).toBe("ai");
    expect(outcome.answers[1]?.verdict).toBe("correct");
    expect(outcome.answers[1]?.feedback).toBe("Молодець!");
  });

  /**
   * Only the cited sentence travels, never the whole text: fewer tokens, and
   * the model stops reading around the answer and second-guessing the question.
   */
  it("sends the cited sentence rather than the whole text", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(verdicts(["0"])) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    await resolveAnswers([unclear()], SENTENCES, "uk", "developing");

    const sent = JSON.stringify(scripted.requests[0]?.body);
    expect(sent).toContain(SENTENCES[0]?.text);
    expect(sent).not.toContain(SENTENCES[4]?.text);
  });

  /**
   * The rule that matters most here: with nobody to ask, nothing becomes
   * "wrong". It stays unclear, out of the percentage, and a grown-up decides.
   */
  it("marks nothing wrong when there is no key", async () => {
    const outcome = await resolveAnswers([unclear()], SENTENCES, "uk", "developing");

    expect(outcome.escalated).toBe(0);
    expect(outcome.answers[0]?.verdict).toBe("unsure");
  });

  it("leaves the unclear ones unclear when the call fails", async () => {
    useKey();
    vi.stubGlobal("fetch", scriptFetch([{ status: 429, body: RATE_LIMIT_BODY }]).fetch);

    const outcome = await resolveAnswers(
      [answer("лисиця"), unclear()],
      SENTENCES,
      "uk",
      "developing",
    );

    expect(outcome.failure).toBe("rate_limited");
    expect(outcome.answers[0]?.verdict).toBe("correct");
    expect(outcome.answers[1]?.verdict).toBe("unsure");
  });

  it("records what the call cost", async () => {
    useKey();
    vi.stubGlobal(
      "fetch",
      scriptFetch([{ status: 200, body: asCandidate(verdicts(["0"])) }]).fetch,
    );

    await resolveAnswers([unclear()], SENTENCES, "uk", "developing");

    const rows = await db.ledger.toArray();
    expect(rows[0]?.requests).toBe(1);
    expect(rows[0]?.byLabel.grading).toBe(1);
    expect(rows[0]?.promptTokens).toBe(800);
  });

  it("survives a session with no answers", async () => {
    const outcome = await resolveAnswers([], SENTENCES, "uk", "developing");
    expect(outcome.answers).toEqual([]);
    expect(outcome.escalated).toBe(0);
  });
});
