/**
 * Edit distance, tuned for what a child's fingers do to a word.
 */

/**
 * Damerau-Levenshtein: insertions, deletions, substitutions **and
 * transpositions**.
 *
 * The transposition is the whole reason not to use plain Levenshtein here.
 * "лисицяя" is a doubled key and "лиисця" is a swap, and both are one mistake
 * to a child but two to an algorithm that cannot see a swap — which would push
 * a perfectly good answer past the tolerance for its length.
 *
 * `max` bounds the work: once every cell of a row exceeds it, no path can come
 * back under, so the answer is "further than you care about".
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const rows = a.length + 1;
  const cols = b.length + 1;
  // Three rows are enough: the transposition case looks two rows back.
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: cols }, (_, j) => j);
  let current: number[] = Array.from<number>({ length: cols });

  for (let i = 1; i < rows; i++) {
    current[0] = i;
    let rowMin = i;

    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (current[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prev2[j - 2] as number) + 1);
      }

      current[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > max) return max + 1;

    prev2 = prev;
    prev = current;
    current = Array.from<number>({ length: cols });
  }

  return prev[cols - 1] as number;
}

/**
 * How many mistakes a word of this length is allowed.
 *
 * Grows with length, but a three-letter word gets nothing: at that size one
 * edit is the difference between "дім" and "дим", between "cat" and "cot".
 * Being generous there would not be kindness, it would be marking a different
 * answer correct.
 */
export function tolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 10) return 2;
  return Math.ceil(length * 0.25);
}

/** Two words close enough to be the same word badly typed. */
export function isNear(a: string, b: string): boolean {
  if (a === b) return true;
  // The tolerance of the *longer* word, so a short expected answer cannot be
  // matched by a long guess that happens to share a prefix.
  const allowed = tolerance(Math.max(a.length, b.length));
  if (allowed === 0) return false;
  return editDistance(a, b, allowed) <= allowed;
}

/** 0..1, where 1 is identical. Used for "are these two questions duplicates". */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}
