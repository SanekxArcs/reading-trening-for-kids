/**
 * The numbers a session produces, and the rules that decide when a number is
 * not to be believed.
 */

/**
 * Below this many milliseconds per word, nobody is reading.
 *
 * 150 ms/word is 400 words a minute. A strong adult reads about 250-300 silently;
 * a child who is genuinely fluent might touch 200. So this is not a strict
 * threshold — it is well clear of any honest reading — and that is on purpose:
 * the cost of wrongly flagging a proud child is much higher than the cost of
 * letting one skim go uncaught.
 */
export const MIN_MS_PER_WORD = 150;

/** Nothing longer than a sentence can be read in under two seconds. */
export const MIN_READING_MS = 2_000;

/**
 * Above this, the clock was left running rather than the child reading slowly.
 * Ten minutes on one passage means they wandered off; the session still counts
 * for comprehension, just not for speed.
 */
export const MAX_READING_MS = 10 * 60_000;

export type SpeedFlag = "ok" | "too_fast" | "too_slow";

export function speedFlag(wordCount: number, readingMs: number): SpeedFlag {
  if (readingMs < MIN_READING_MS || readingMs < wordCount * MIN_MS_PER_WORD) return "too_fast";
  if (readingMs > MAX_READING_MS) return "too_slow";
  return "ok";
}

export function wordsPerMinute(wordCount: number, readingMs: number): number {
  if (readingMs <= 0 || wordCount <= 0) return 0;
  return (wordCount * 60_000) / readingMs;
}

export function charsPerMinute(charCount: number, readingMs: number): number {
  if (readingMs <= 0 || charCount <= 0) return 0;
  return (charCount * 60_000) / readingMs;
}

/**
 * The score one answer contributes.
 *
 * `unsure` is not 0 and not 0.5 — it is absent. An answer nobody has judged yet
 * must not drag a percentage down, so it leaves the denominator as well as the
 * numerator. This is why `comprehension` takes verdicts rather than a count.
 */
export type AnswerVerdict = "correct" | "partial" | "incorrect" | "unsure";

const VERDICT_SCORE: Record<AnswerVerdict, number | null> = {
  correct: 1,
  partial: 0.5,
  incorrect: 0,
  unsure: null,
};

export interface Comprehension {
  /** 0..1, or null when nothing has been judged yet. */
  score: number | null;
  judged: number;
  /** Answers waiting on a grown-up, excluded from the score entirely. */
  pending: number;
}

export function comprehension(verdicts: readonly AnswerVerdict[]): Comprehension {
  let total = 0;
  let judged = 0;
  let pending = 0;

  for (const verdict of verdicts) {
    const score = VERDICT_SCORE[verdict];
    if (score === null) {
      pending++;
      continue;
    }
    total += score;
    judged++;
  }

  return { score: judged === 0 ? null : total / judged, judged, pending };
}

export interface SessionInput {
  wordCount: number;
  charCount: number;
  readingMs: number;
  verdicts: readonly AnswerVerdict[];
  /** One entry per question, in the order asked. */
  answerMs: readonly number[];
}

export interface SessionMetrics {
  wordsPerMinute: number;
  charsPerMinute: number;
  comprehension: Comprehension;
  /**
   * Speed discounted by how much was actually understood.
   *
   * The headline number, and the only one that cannot be gamed. Reading speed
   * on its own rewards skimming, and comprehension on its own rewards crawling;
   * a child cannot improve this one without improving at reading.
   */
  effectiveWpm: number;
  averageAnswerMs: number;
  speed: SpeedFlag;
  /** True when the speed figures are not to be shown or stored as progress. */
  speedCounts: boolean;
}

export function sessionMetrics(input: SessionInput): SessionMetrics {
  const flag = speedFlag(input.wordCount, input.readingMs);
  const wpm = wordsPerMinute(input.wordCount, input.readingMs);
  const understood = comprehension(input.verdicts);

  const averageAnswerMs =
    input.answerMs.length === 0
      ? 0
      : input.answerMs.reduce((sum, ms) => sum + ms, 0) / input.answerMs.length;

  return {
    wordsPerMinute: wpm,
    charsPerMinute: charsPerMinute(input.charCount, input.readingMs),
    comprehension: understood,
    // With nothing judged yet there is no honest effective figure, and showing
    // the raw speed in its place would be the exact misreading this metric
    // exists to prevent.
    effectiveWpm: understood.score === null ? 0 : wpm * understood.score,
    averageAnswerMs,
    speed: flag,
    speedCounts: flag === "ok",
  };
}

/**
 * Rounds a rate for display. One decimal place would imply a precision that a
 * child pressing "I've read it" a second late does not provide.
 */
export function displayRate(value: number): number {
  return Math.round(value);
}

export function displayPercent(score: number | null): number | null {
  return score === null ? null : Math.round(score * 100);
}
