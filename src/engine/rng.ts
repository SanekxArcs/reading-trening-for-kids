/**
 * All randomness in the engine is injected, so every test is deterministic and
 * the distribution claims in problem/distractor generation are actually
 * checkable rather than aspirational.
 */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** mulberry32 — small, fast, good enough for a quiz, and seedable for tests. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive on both ends. */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new RangeError(`randInt: max ${max} < min ${min}`);
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("pick: empty array");
  return items[randInt(rng, 0, items.length - 1)] as T;
}

/**
 * Fisher-Yates. Returns a new array.
 *
 * The old game used `array.sort(() => Math.random() - 0.5)`, which is not a
 * uniform shuffle — the correct answer landed in some positions measurably more
 * often than others. Over a few hundred rounds a child picks up on that and
 * starts playing the position instead of the sum.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
