// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/data/db";
import { instantQueue, setQueue } from "@/ai/runtime/queue";
import { approveQuestionSet, saveText } from "@/data/repositories";
import { DEFAULT_SETTINGS, type StoredText } from "@/engine";
import { asCandidate, scriptFetch } from "@/ai/__fixtures__/fetchMock";
import {
  DAILY_QUOTA_BODY,
  INVALID_KEY_BODY,
  SAFETY_BLOCKED_RESPONSE,
  STORY,
  VALID_JSON,
} from "@/ai/__fixtures__/questionSets";
import { getQuestionsFor } from "./questionSource.ts";

/**
 * The degradation story, end to end.
 *
 * Every one of these is a state a real family will be in: no key set up yet,
 * a typo in the key, the free quota gone by Sunday evening, a fairy tale the
 * safety filter dislikes. In all of them the child gets questions and a
 * playable round; only the grown-up ever learns why.
 */

const KEY = "read_master_api_key";
const MODEL = "read_master_model";

/**
 * Settings with review off.
 *
 * The ladder below is about what happens when the model cannot answer, which is
 * a different question from whether a grown-up has cleared the answers. With
 * review on — the default — a child's read never calls the model at all, and
 * every one of these tests would be testing that rule instead of its own.
 */
const AUTO = { ...DEFAULT_SETTINGS, reviewQuestions: false };

async function text(): Promise<StoredText> {
  const saved = await saveText({ body: STORY });
  if (!saved) throw new Error("could not save the text");
  return saved;
}

function useKey(key = "AIzaTEST", model = "gemini-2.5-flash") {
  localStorage.setItem(KEY, key);
  localStorage.setItem(MODEL, model);
}

beforeEach(async () => {
  // A fresh queue per test, with instant sleeps: the real one paces sends
  // seconds apart, which is correct in a browser and unusable in a suite.
  setQueue(instantQueue());
  localStorage.clear();
  await Promise.all([db.texts.clear(), db.questionSets.clear()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getQuestionsFor", () => {
  it("uses the offline generator when no key is set up", async () => {
    const source = await getQuestionsFor(await text(), DEFAULT_SETTINGS);

    expect(source.fromModel).toBe(false);
    expect(source.producedBy).toBe("local");
    expect(source.failure).toBe("no_key");
    expect(source.questions.length).toBeGreaterThan(0);
  });

  it("asks the model when there is a key, in one call", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const source = await getQuestionsFor(await text(), AUTO);

    expect(scripted.requests).toHaveLength(1);
    expect(source.fromModel).toBe(true);
    expect(source.producedBy).toBe("gemini:gemini-2.5-flash");
    expect(source.failure).toBeNull();
  });

  /** The cheapest possible re-read: the second one must not call anything. */
  it("serves a re-read from cache without calling the model", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const story = await text();
    const first = await getQuestionsFor(story, AUTO);
    const second = await getQuestionsFor(story, AUTO);

    expect(scripted.requests).toHaveLength(1);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.questions).toEqual(first.questions);
  });

  it("falls back to offline questions when the key is rejected", async () => {
    useKey("wrong-key");
    vi.stubGlobal("fetch", scriptFetch([{ status: 400, body: INVALID_KEY_BODY }]).fetch);

    const source = await getQuestionsFor(await text(), AUTO);

    expect(source.questions.length).toBeGreaterThan(0);
    expect(source.fromModel).toBe(false);
    expect(source.failure).toBe("invalid_key");
  });

  /**
   * The Sunday-evening case. Last week's questions beat no questions, so a set
   * already cached for this text and level is used even though the cache key
   * no longer matches.
   */
  it("reuses an older cached set when the daily quota is gone", async () => {
    useKey();
    const story = await text();

    // Monday: the model answered.
    vi.stubGlobal("fetch", scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]).fetch);
    const monday = await getQuestionsFor(story, AUTO);
    expect(monday.fromModel).toBe(true);

    // Sunday: the quota is gone, and the parent has since switched model.
    localStorage.setItem(MODEL, "gemini-2.5-pro");
    vi.stubGlobal("fetch", scriptFetch([{ status: 429, body: DAILY_QUOTA_BODY }]).fetch);

    const sunday = await getQuestionsFor(story, AUTO);
    expect(sunday.questions).toEqual(monday.questions);
    expect(sunday.failure).toBe("daily_quota");
  });

  it("falls back rather than failing when a text trips the safety filter", async () => {
    useKey();
    vi.stubGlobal("fetch", scriptFetch([{ status: 200, body: SAFETY_BLOCKED_RESPONSE }]).fetch);

    const source = await getQuestionsFor(await text(), AUTO);

    expect(source.failure).toBe("safety_blocked");
    expect(source.questions.length).toBeGreaterThan(0);
  });

  /** Offline: the same path as no key, and no request is attempted. */
  it("plays offline when the network is gone", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 500, body: {} }]);
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    const source = await getQuestionsFor(await text(), AUTO);

    expect(source.questions.length).toBeGreaterThan(0);
    expect(source.failure).toBe("offline");
    expect(scripted.requests).toHaveLength(0);
  });

  /**
   * The review setting decides whether a generated set is playable straight
   * away or waits for a grown-up — a model can ask about something the text
   * never says, and the citation check catches most of that but not all.
   */
  it("marks a set generated for review unapproved", async () => {
    useKey();
    vi.stubGlobal("fetch", scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]).fetch);

    const source = await getQuestionsFor(await text(), DEFAULT_SETTINGS, { forReview: true });

    expect(source.fromModel).toBe(true);
    expect(source.pendingReview).toBe(true);
    expect((await db.questionSets.get(source.cacheKey))?.approved).toBe(false);
  });

  it("marks it approved when the parent has turned review off", async () => {
    useKey();
    vi.stubGlobal("fetch", scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]).fetch);

    const source = await getQuestionsFor(await text(), AUTO);

    expect(source.pendingReview).toBe(false);
    expect((await db.questionSets.get(source.cacheKey))?.approved).toBe(true);
  });

  /** Offline questions are always playable: there is nothing to vet. */
  it("never makes a child wait for approval of offline questions", async () => {
    const source = await getQuestionsFor(await text(), DEFAULT_SETTINGS);
    expect((await db.questionSets.get(source.cacheKey))?.approved).toBe(true);
  });

  /**
   * The gate, and the reason it is worth having: with review on, a child's
   * read does not call the model. Questions are made on the review screen,
   * where a grown-up is looking at them, and nowhere else.
   */
  it("does not call the model on a child's read while review is on", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const source = await getQuestionsFor(await text(), DEFAULT_SETTINGS);

    expect(scripted.requests).toHaveLength(0);
    expect(source.fromModel).toBe(false);
    expect(source.pendingReview).toBe(true);
    expect(source.questions.length).toBeGreaterThan(0);
  });

  /**
   * A set the parent never cleared is not quietly played later. It is also not
   * regenerated: paying for the same questions twice while the first copy sits
   * unread is the one thing worse than practice questions.
   */
  it("plays practice questions while a generated set waits for approval", async () => {
    useKey();
    const scripted = scriptFetch([
      { status: 200, body: asCandidate(VALID_JSON) },
      { status: 200, body: asCandidate(VALID_JSON) },
    ]);
    vi.stubGlobal("fetch", scripted.fetch);

    const story = await text();
    const reviewed = await getQuestionsFor(story, DEFAULT_SETTINGS, { forReview: true });
    const childs = await getQuestionsFor(story, DEFAULT_SETTINGS);

    expect(scripted.requests).toHaveLength(1);
    expect(childs.fromModel).toBe(false);
    expect(childs.pendingReview).toBe(true);
    expect(childs.questions).not.toEqual(reviewed.questions);
  });

  it("plays the set as soon as a grown-up has cleared it", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const story = await text();
    const reviewed = await getQuestionsFor(story, DEFAULT_SETTINGS, { forReview: true });
    await approveQuestionSet(reviewed.cacheKey);

    const childs = await getQuestionsFor(story, DEFAULT_SETTINGS);

    expect(scripted.requests).toHaveLength(1);
    expect(childs.fromModel).toBe(true);
    expect(childs.pendingReview).toBe(false);
    expect(childs.questions).toEqual(reviewed.questions);
  });

  /** The review screen is shown what is waiting, not a fresh copy of it. */
  it("shows the review screen the set that is already waiting", async () => {
    useKey();
    const scripted = scriptFetch([{ status: 200, body: asCandidate(VALID_JSON) }]);
    vi.stubGlobal("fetch", scripted.fetch);

    const story = await text();
    const first = await getQuestionsFor(story, DEFAULT_SETTINGS, { forReview: true });
    const again = await getQuestionsFor(story, DEFAULT_SETTINGS, { forReview: true });

    expect(scripted.requests).toHaveLength(1);
    expect(again.cacheKey).toBe(first.cacheKey);
    expect(again.questions).toEqual(first.questions);
  });
});
