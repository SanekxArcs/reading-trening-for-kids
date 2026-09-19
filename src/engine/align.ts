import { isNear } from "./distance.ts";
import { fold, normalize } from "./normalize.ts";
import { words } from "./textStats.ts";

/**
 * Comparing what a child read aloud with what was printed.
 *
 * The model's only job is to write down what it heard. Everything here — which
 * words were misread, which were skipped, how fast they really went — is worked
 * out locally, and that is a deliberate division of labour. It is free,
 * deterministic, re-runnable without another API call, and testable against
 * hand-written transcripts.
 *
 * Needleman-Wunsch rather than a naive word-by-word walk: one skipped word
 * early on would otherwise throw every later comparison out of step and report
 * a child who read almost perfectly as having got nothing right.
 */

export type AlignOp =
  /** Read exactly. */
  | "match"
  /** Read close enough to be the same word — a slip, not a misreading. */
  | "near"
  /** A different word was said. */
  | "substitute"
  /** The word was not said at all. */
  | "omit"
  /** A word was said that is not in the text. */
  | "insert";

export interface AlignedWord {
  op: AlignOp;
  /** Index into the original word list, or null for an insertion. */
  originalIndex: number | null;
  original: string | null;
  heard: string | null;
}

const MATCH_SCORE = 2;
const NEAR_SCORE = 1;
const MISMATCH_SCORE = -1;
const GAP_SCORE = -1;

function comparable(word: string): string {
  return fold(normalize(word));
}

function scoreOf(a: string, b: string): { score: number; op: AlignOp } {
  if (a === b) return { score: MATCH_SCORE, op: "match" };
  if (isNear(a, b)) return { score: NEAR_SCORE, op: "near" };
  return { score: MISMATCH_SCORE, op: "substitute" };
}

/**
 * Aligns the printed words against the heard ones.
 *
 * Both sides are normalised and folded before comparison, so a child who says
 * the right word with a childish vowel is credited with saying it.
 */
export function alignReading(original: readonly string[], heard: readonly string[]): AlignedWord[] {
  const a = original.map(comparable);
  const b = heard.map(comparable);

  const rows = a.length + 1;
  const cols = b.length + 1;

  const score: number[][] = Array.from({ length: rows }, () =>
    Array.from<number>({ length: cols }).fill(0),
  );

  for (let i = 1; i < rows; i++) score[i]![0] = i * GAP_SCORE;
  for (let j = 1; j < cols; j++) score[0]![j] = j * GAP_SCORE;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const diagonal = score[i - 1]![j - 1]! + scoreOf(a[i - 1]!, b[j - 1]!).score;
      const up = score[i - 1]![j]! + GAP_SCORE;
      const left = score[i]![j - 1]! + GAP_SCORE;
      score[i]![j] = Math.max(diagonal, up, left);
    }
  }

  // Walk back through the matrix to recover the alignment itself.
  const out: AlignedWord[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const { score: cost, op } = scoreOf(a[i - 1]!, b[j - 1]!);
      if (score[i]![j] === score[i - 1]![j - 1]! + cost) {
        out.push({
          op,
          originalIndex: i - 1,
          original: original[i - 1] ?? null,
          heard: heard[j - 1] ?? null,
        });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && score[i]![j] === score[i - 1]![j]! + GAP_SCORE) {
      out.push({
        op: "omit",
        originalIndex: i - 1,
        original: original[i - 1] ?? null,
        heard: null,
      });
      i--;
      continue;
    }
    out.push({ op: "insert", originalIndex: null, original: null, heard: heard[j - 1] ?? null });
    j--;
  }

  // Built back to front by the traceback.
  return out.toReversed();
}

export interface ReadAloudStats {
  totalOriginalWords: number;
  /** Read exactly or near enough. */
  correct: number;
  misread: number;
  skipped: number;
  /** Words said that were not on the page — repeats, self-corrections, asides. */
  inserted: number;
  /** 0..1 of the printed words that were actually read. */
  accuracy: number;
  /**
   * Words read correctly per minute.
   *
   * Correct words, not all words: a child who says "the the the" quickly is not
   * reading quickly, and the raw figure below is kept only for comparison.
   */
  wordsPerMinute: number;
  rawWordsPerMinute: number;
}

/**
 * `durationMs` comes from the local recorder's clock, never from the model.
 *
 * Asking a model how long a recording was invites it to guess, and a guess here
 * lands straight in a reading-speed figure a parent will believe.
 */
export function readAloudStats(
  aligned: readonly AlignedWord[],
  durationMs: number,
): ReadAloudStats {
  let correct = 0;
  let misread = 0;
  let skipped = 0;
  let inserted = 0;

  for (const word of aligned) {
    if (word.op === "match" || word.op === "near") correct++;
    else if (word.op === "substitute") misread++;
    else if (word.op === "omit") skipped++;
    else inserted++;
  }

  const total = correct + misread + skipped;
  const minutes = durationMs / 60_000;

  return {
    totalOriginalWords: total,
    correct,
    misread,
    skipped,
    inserted,
    accuracy: total === 0 ? 0 : correct / total,
    wordsPerMinute: minutes <= 0 ? 0 : correct / minutes,
    rawWordsPerMinute: minutes <= 0 ? 0 : (correct + misread + inserted) / minutes,
  };
}

/** The words a child stumbled on, for the warm-up before a later text. */
export function stumbledWords(aligned: readonly AlignedWord[]): string[] {
  return aligned
    .filter((word) => (word.op === "substitute" || word.op === "omit") && word.original !== null)
    .map((word) => word.original as string);
}

/** Convenience: align a printed text against a transcript. */
export function compareReading(original: string, transcript: string): AlignedWord[] {
  return alignReading(words(original), words(transcript));
}
