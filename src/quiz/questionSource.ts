import {
  defaultRng,
  generateFallbackQuestions,
  questionCount,
  splitSentences,
  weakestSkills,
  QUESTION_TYPES,
  type Question,
  type ReadingSettings,
  type StoredText,
} from "@/engine";
import {
  findAnyQuestionSet,
  getQuestionSet,
  loadStats,
  saveQuestionSet,
} from "@/data/repositories";
import type { StoredQuestionSet } from "@/data/db";
import { importedSetKey, localSetKey, questionSetKey } from "@/ai/core/cacheKey";
import { asAiError, type AiErrorCode } from "@/ai/core/errors";
import { aiContext, requestQuestions } from "@/ai/service";

/**
 * Where the quiz gets its questions.
 *
 * The order is the whole degradation story in one function:
 *
 *   1. the exact cache entry — free, and the common case on a re-read;
 *   2. the model, if there is a key;
 *   3. any cached set for this text and level, whatever model made it — which
 *      is what a parent out of quota falls back to;
 *   4. the offline generator, which always works.
 *
 * The screens above never learn which one answered. They read `producedBy` only
 * to label a round as practice, and `failure` only to show a grown-up what
 * happened — the child's screen is identical in every case.
 *
 * Across all of it runs one rule from the settings: while `reviewQuestions` is
 * on, a set a grown-up has not cleared is not played — and is not generated
 * behind their back either. With review on, questions are made on the review
 * screen and nowhere else, which is also the cheapest possible reading of that
 * setting: a child's read never spends a request.
 */

/** Bumped whenever the offline generator changes shape, so old sets are re-made. */
const LOCAL_VERSION = "v1";

export interface QuestionSource {
  cacheKey: string;
  questions: Question[];
  producedBy: string;
  /** False for the offline generator, which the UI labels honestly. */
  fromModel: boolean;
  /** Why the model was not used, when it was not. Parent-facing only. */
  failure: AiErrorCode | null;
  /**
   * A grown-up has to prepare or clear this text before the real questions are
   * played. The child still gets a full round of practice questions and never
   * learns why.
   */
  pendingReview: boolean;
}

export interface QuestionOptions {
  signal?: AbortSignal;
  /**
   * The review screen. It is the one caller that sees a set nobody has cleared
   * yet, and the one allowed to generate while review is on.
   */
  forReview?: boolean;
}

function localKey(text: StoredText, settings: ReadingSettings, count: number): string {
  return `${localSetKey({ text: text.body, level: settings.level, count })}:${LOCAL_VERSION}`;
}

function offline(
  text: StoredText,
  settings: ReadingSettings,
  count: number,
  failure: AiErrorCode | null,
  pendingReview = false,
): QuestionSource {
  const sentences = splitSentences(text.body, text.lang);
  const questions = generateFallbackQuestions(sentences, {
    lang: text.lang,
    level: settings.level,
    count,
    // Not seeded: a second read of the same text should pick different words.
    // The set is cached afterwards, so within one text they stay put.
    rng: defaultRng,
  });

  return {
    cacheKey: localKey(text, settings, count),
    questions,
    producedBy: "local",
    fromModel: false,
    failure,
    pendingReview,
  };
}

function fromStored(set: StoredQuestionSet): QuestionSource {
  return {
    cacheKey: set.cacheKey,
    questions: set.questions,
    producedBy: set.producedBy,
    fromModel: set.producedBy !== "local",
    failure: null,
    pendingReview: !set.approved,
  };
}

export async function getQuestionsFor(
  text: StoredText,
  settings: ReadingSettings,
  options: QuestionOptions = {},
): Promise<QuestionSource> {
  const forReview = options.forReview === true;
  const sentences = splitSentences(text.body, text.lang);
  const count = questionCount(sentences.length, settings.level, settings.maxQuestions);
  if (count === 0) return offline(text, settings, 0, null);

  const context = aiContext();

  // ─── 1. The exact entry ─────────────────────────────────────────────────
  const modelKey = context
    ? questionSetKey({ text: text.body, level: settings.level, modelId: context.modelId, count })
    : null;

  /**
   * An imported set outranks anything this device would make.
   *
   * Two children handed the same pack have to be asked the same questions, so
   * a set that arrived from somebody else is used as it is — never regenerated,
   * never supplemented, and never quietly replaced by a local one.
   */
  for (const key of [
    importedSetKey({ text: text.body, level: settings.level }),
    modelKey,
    localKey(text, settings, count),
  ]) {
    if (!key) continue;
    const set = await getQuestionSet(key);
    if (!set || set.questions.length === 0) continue;
    // A set waiting for a grown-up is not a cache miss — it is a set. Falling
    // through to the model here would pay for the same questions a second time
    // while the first copy sits unread.
    if (!set.approved && !forReview) return await persistOffline(text, settings, count, null, true);
    return fromStored(set);
  }

  // ─── 2. The model ───────────────────────────────────────────────────────
  const mayGenerate = forReview || !settings.reviewQuestions;
  if (context && modelKey && mayGenerate) {
    try {
      const stats = await loadStats();
      const outcome = await requestQuestions(
        context,
        {
          sentences,
          lang: text.lang,
          level: settings.level,
          count,
          ...(settings.adaptive
            ? { emphasise: weakestSkills(QUESTION_TYPES, settings.level, stats, Date.now(), 2) }
            : {}),
        },
        options.signal,
      );

      if (outcome.questions.length > 0) {
        const approved = !settings.reviewQuestions;
        await saveQuestionSet({
          cacheKey: modelKey,
          textId: text.id,
          level: settings.level,
          questions: outcome.questions,
          producedBy: outcome.producedBy,
          // A model can ask about something the text never says. The citation
          // check catches most of it, but a grown-up gets the last word until
          // the prompt has earned trust.
          approved,
        });

        return {
          cacheKey: modelKey,
          questions: outcome.questions,
          producedBy: outcome.producedBy,
          fromModel: true,
          failure: null,
          pendingReview: !approved,
        };
      }
    } catch (error) {
      const failure = asAiError(error).code;

      // ─── 3. Any set for this text and level, whatever made it ───────────
      const any = await findAnyQuestionSet(text.id, settings.level);
      if (any && any.questions.length > 0) {
        if (!any.approved && !forReview) {
          return await persistOffline(text, settings, count, failure, true);
        }
        return { ...fromStored(any), failure };
      }
      return await persistOffline(text, settings, count, failure);
    }
  }

  // Review is on and nobody has prepared this text yet: the round is practice
  // questions, and the library card tells the grown-up there is work waiting.
  if (context && !mayGenerate) return await persistOffline(text, settings, count, null, true);

  // ─── 4. The offline generator ───────────────────────────────────────────
  return await persistOffline(text, settings, count, context ? null : "no_key");
}

async function persistOffline(
  text: StoredText,
  settings: ReadingSettings,
  count: number,
  failure: AiErrorCode | null,
  pendingReview = false,
): Promise<QuestionSource> {
  const source = offline(text, settings, count, failure, pendingReview);
  await saveQuestionSet({
    cacheKey: source.cacheKey,
    textId: text.id,
    level: settings.level,
    questions: source.questions,
    producedBy: "local",
    // The offline generator copies words straight out of the text, so there is
    // nothing for a parent to vet — the review step exists for the model.
    approved: true,
  });
  return source;
}

/**
 * Whatever is stored for this set, for the result screen to read back.
 *
 * Falls back to any set for the same text and level: a session recorded
 * yesterday must still open even if the cache key has changed since.
 */
export async function getStoredQuestions(
  cacheKey: string,
  textId: string,
  level: ReadingSettings["level"],
): Promise<Question[]> {
  const exact = await getQuestionSet(cacheKey);
  if (exact) return exact.questions;
  const any = await findAnyQuestionSet(textId, level);
  return any?.questions ?? [];
}
