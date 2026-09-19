import { fold, skeleton } from "./normalize.ts";
import { isStopword } from "./stopwords.ts";
import { words } from "./textStats.ts";
import type { ChildLevel, TextLang } from "./types.ts";

/**
 * The handful of words worth looking at before the clock starts.
 *
 * Pre-exposure is the cheapest reading intervention there is: a child who has
 * already decoded the two hardest words once does not stall on them mid-
 * sentence, and the timing they produce is a measure of reading rather than of
 * one unlucky word. Everything here comes out of the text itself, so it costs
 * nothing and works with no key and no network.
 *
 * Words the child has tripped over before come first. Those are the ones the
 * word statistics and the stumble list from reading aloud have been collecting
 * all along, and this is what they were collected for.
 */

export const WARMUP_COUNT = 4;

/**
 * How long a word has to be before it is worth warming up on, by reader.
 *
 * A six-letter word is a wall for a child who is still decoding and beneath
 * notice for one who is not, so the threshold moves with the reader rather
 * than the text.
 */
const MIN_LENGTH: Record<ChildLevel, number> = {
  beginner: 5,
  developing: 6,
  fluent: 7,
  advanced: 8,
};

export interface WarmupOptions {
  lang: TextLang;
  level: ChildLevel;
  /** Words this child has missed or stumbled over before, in any text. */
  struggled?: readonly string[];
  count?: number;
}

function key(word: string): string {
  return fold(word).toLocaleLowerCase();
}

/**
 * How hard a word is to decode, roughly.
 *
 * Length plus consonants rather than length alone: it is the clusters that
 * stall a child, which is why "здригнувся" is harder than "малювала" despite
 * being shorter.
 */
function hardness(word: string): number {
  return fold(word).length + skeleton(word).length;
}

export function warmupWords(text: string, options: WarmupOptions): string[] {
  const limit = options.count ?? WARMUP_COUNT;
  if (limit <= 0) return [];

  const minLength = MIN_LENGTH[options.level];
  const struggled = new Set((options.struggled ?? []).map(key));

  // First occurrence wins, so the child is shown the form the text actually
  // uses rather than a dictionary form they will not meet.
  const seen = new Map<string, string>();
  for (const word of words(text)) {
    const folded = key(word);
    if (folded.length === 0 || seen.has(folded)) continue;
    if (isStopword(word, options.lang)) continue;
    // A known-hard word is worth warming up on at any length; everything else
    // has to earn its place by being long enough to be worth the interruption.
    if (folded.length < minLength && !struggled.has(folded)) continue;
    seen.set(folded, word);
  }

  const candidates = [...seen.entries()].map(([folded, word]) => ({
    word,
    known: struggled.has(folded),
    difficulty: hardness(word),
  }));

  return candidates
    .toSorted((a, b) => Number(b.known) - Number(a.known) || b.difficulty - a.difficulty)
    .slice(0, limit)
    .map((candidate) => candidate.word);
}
