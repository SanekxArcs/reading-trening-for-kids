import { editDistance, isNear } from "./distance.ts";
import { fold, isBlank, isGiveUp, skeleton, tokens } from "./normalize.ts";
import { stem } from "./stem.ts";
import { isStopword } from "./stopwords.ts";
import type { Question, TextLang } from "./types.ts";

/**
 * Judging a child's answer without calling anything.
 *
 * The cascade below resolves the large majority of answers for free. What is
 * left goes to a model in one batch at the end of the session — so the cheaper
 * this file is at saying "yes", the fewer API calls the whole app makes.
 */

export type LocalReason =
  | "exact"
  | "folded"
  | "stem"
  | "fuzzy"
  | "token-set"
  | "keywords"
  | "blank"
  | "gave-up"
  | "no-overlap"
  | "escalate";

export interface LocalVerdict {
  verdict: "correct" | "incorrect" | "unsure";
  /** 0..1. Not shown to anyone; used to order what gets escalated first. */
  confidence: number;
  reason: LocalReason;
}

/**
 * Tokenises, folds, drops function words and stems.
 *
 * Dropping stopwords is what makes "a big grey fox" match "the fox": the
 * article differs, and no child has ever failed a comprehension question by
 * choosing the wrong one. The fallback matters though — if an expected answer
 * is *entirely* function words ("до нього", "in it"), filtering would leave
 * nothing to compare, so the unfiltered tokens are used instead.
 */
function prepare(text: string, lang: TextLang): { plain: string[]; stems: string[] } {
  const all = tokens(fold(text));
  const content = all.filter((token) => !isStopword(token, lang));
  const plain = content.length > 0 ? content : all;
  return { plain, stems: plain.map((token) => stem(token, lang)) };
}

/** Every token of `expected` is matched by some token of `given`. */
function coversAll(expected: readonly string[], given: readonly string[]): boolean {
  if (expected.length === 0) return false;
  return expected.every((token) => given.some((candidate) => isNear(candidate, token)));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && coversAll(a, b) && coversAll(b, a);
}

/**
 * How far apart two consonant skeletons may be and still count as "might be
 * the same word". One edit covers a doubled consonant (`ran`/`runned`) without
 * reaching across to an unrelated word.
 */
const SKELETON_SLACK = 1;

/** True when any expected word and any given word share their consonants. */
function sharesConsonants(
  accepted: readonly { stems: string[] }[],
  given: { stems: string[] },
): boolean {
  const givenSkeletons = given.stems.map(skeleton).filter((s) => s.length > 0);
  if (givenSkeletons.length === 0) return false;

  return accepted.some((expected) =>
    expected.stems.some((token) => {
      const wanted = skeleton(token);
      if (wanted.length === 0) return false;
      return givenSkeletons.some(
        (candidate) => editDistance(wanted, candidate, SKELETON_SLACK) <= SKELETON_SLACK,
      );
    }),
  );
}

/**
 * Judges one answer.
 *
 * The asymmetry between "correct" and "incorrect" here is the most important
 * decision in the file, and it is deliberate. The cascade is allowed to say
 * **yes** on fuzzy evidence, but it may only say **no** for a question whose
 * set of right answers is closed and short. A child who was right and is told
 * they were wrong learns that the app is unfair and stops trusting it; a child
 * wrongly told they were right loses nothing at all.
 */
export function gradeLocally(
  question: Pick<Question, "acceptableAnswers" | "gradingMode"> &
    Partial<Pick<Question, "requiredKeywords" | "canonicalAnswer">>,
  rawAnswer: string,
  lang: TextLang,
): LocalVerdict {
  if (isBlank(rawAnswer)) return { verdict: "incorrect", confidence: 1, reason: "blank" };
  if (isGiveUp(rawAnswer)) return { verdict: "incorrect", confidence: 1, reason: "gave-up" };

  const given = prepare(rawAnswer, lang);
  const accepted = question.acceptableAnswers.map((answer) => prepare(answer, lang));

  // 1. Exact, once folded and tokenised. The overwhelmingly common case.
  if (accepted.some((expected) => sameSet(expected.plain, given.plain))) {
    return { verdict: "correct", confidence: 1, reason: "exact" };
  }

  // 2. Same words, different grammatical case. Not a comprehension error.
  if (accepted.some((expected) => sameSet(expected.stems, given.stems))) {
    return { verdict: "correct", confidence: 0.9, reason: "stem" };
  }

  // 3. Same words, typed badly.
  if (
    accepted.some(
      (expected) =>
        coversAll(expected.stems, given.stems) && given.stems.length === expected.stems.length,
    )
  ) {
    return { verdict: "correct", confidence: 0.82, reason: "fuzzy" };
  }

  // 4. The child said more than was asked: "a big grey wolf" for "wolf".
  //    Containment only in that direction — an answer missing half of a
  //    two-part expected answer is not correct, it is partial, and partial is
  //    a judgement this file is not allowed to make.
  if (accepted.some((expected) => coversAll(expected.stems, given.stems))) {
    return { verdict: "correct", confidence: 0.75, reason: "token-set" };
  }

  // 5. Open-ended questions carry keyword groups instead of a closed answer
  //    list: hit one word from every group and the meaning is there, whatever
  //    the phrasing.
  const groups = question.requiredKeywords;
  if (groups && groups.length > 0) {
    const hitsEveryGroup = groups.every((group) =>
      group.some((keyword) => {
        const wanted = prepare(keyword, lang);
        return coversAll(wanted.stems, given.stems);
      }),
    );
    if (hitsEveryGroup) return { verdict: "correct", confidence: 0.72, reason: "keywords" };
  }

  // 6. The only route to a local "no". Closed-answer question, not one word of
  //    the answer anywhere in what the child wrote — and, crucially, not even a
  //    near-miss on consonants.
  //
  //    That last condition is what stops the matcher calling a right child
  //    wrong. Polish `las`/`lesie` and English `ran`/`runned` share no stem and
  //    no edit-distance neighbourhood, yet both are the same word; `дім`/`дим`
  //    and `cat`/`cot` look identical by the same measure and are different
  //    words. Nothing short of a dictionary separates those two situations, so
  //    when the consonants line up the answer is escalated rather than judged.
  if (question.gradingMode === "exact-ish") {
    const anyOverlap = accepted.some((expected) =>
      expected.stems.some((token) => given.stems.some((candidate) => isNear(candidate, token))),
    );
    if (!anyOverlap && !sharesConsonants(accepted, given)) {
      return { verdict: "incorrect", confidence: 0.85, reason: "no-overlap" };
    }
  }

  return { verdict: "unsure", confidence: 0, reason: "escalate" };
}

export interface GradeItem {
  id: string;
  question: Question;
  answer: string;
}

export interface EscalationPlan {
  resolved: Map<string, LocalVerdict>;
  /** Ids to send to the model, in one batch. Empty when there is no model. */
  escalate: string[];
}

/**
 * Caps how many answers can reach the API from one session even in the worst
 * case — a child who guessed at everything must not cost more than a child who
 * tried.
 */
export const MAX_ESCALATIONS = 8;

export function planEscalation(
  items: readonly GradeItem[],
  lang: TextLang,
  aiAvailable: boolean,
): EscalationPlan {
  const resolved = new Map<string, LocalVerdict>();
  const unsure: GradeItem[] = [];

  for (const item of items) {
    const verdict = gradeLocally(item.question, item.answer, lang);
    if (verdict.verdict === "unsure") unsure.push(item);
    else resolved.set(item.id, verdict);
  }

  if (!aiAvailable) {
    // Nothing is silently marked wrong when there is nobody to ask. These
    // become "a grown-up will check this", sit outside the comprehension
    // percentage, and appear in a review list with an override button.
    for (const item of unsure) {
      resolved.set(item.id, { verdict: "unsure", confidence: 0, reason: "escalate" });
    }
    return { resolved, escalate: [] };
  }

  // Semantic questions first: they are the ones a human would actually dispute,
  // and the ones where the local cascade has the least to go on.
  const ordered = unsure.toSorted(
    (a, b) =>
      Number(b.question.gradingMode === "semantic") - Number(a.question.gradingMode === "semantic"),
  );

  const escalate = ordered.slice(0, MAX_ESCALATIONS).map((item) => item.id);
  for (const item of ordered.slice(MAX_ESCALATIONS)) {
    resolved.set(item.id, { verdict: "unsure", confidence: 0, reason: "escalate" });
  }

  return { resolved, escalate };
}
