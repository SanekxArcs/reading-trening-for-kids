import type { QuestionTier, ReadingSettings } from "./types.ts";

export interface ScoreState {
  /** True running total. May go negative; see `displayPoints`. */
  rawPoints: number;
  goodStreak: number;
  badStreak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
}

export const INITIAL_SCORE: ScoreState = {
  rawPoints: 0,
  goodStreak: 0,
  badStreak: 0,
  bestStreak: 0,
  correct: 0,
  wrong: 0,
};

/**
 * A harder question is worth more. Unlike the math app, difficulty here is a
 * property of the question rather than of the input method: recalling a stated
 * fact and working out why someone did something are not the same job, even
 * when both are typed into the same box.
 */
export const BASE_POINTS: Record<QuestionTier, number> = {
  easy: 5,
  medium: 10,
  hard: 20,
};

/** Checked high-to-low; the first tier the streak reaches wins. */
const COMBO_TIERS = [
  { from: 12, multiplier: 4 },
  { from: 7, multiplier: 3 },
  { from: 3, multiplier: 2 },
  { from: 0, multiplier: 1 },
] as const;

/**
 * Tiers are reached far sooner than in the math app, and that is deliberate: a
 * maths round is fifty questions long, a reading round is five to twelve. A
 * combo that needs thirty correct answers would never once fire.
 */

/**
 * Penalties climb faster than the combo does: a bad run should hurt quickly
 * enough to be worth escaping, and the only way out is a correct answer. The
 * last entry repeats as the cap.
 */
const PENALTIES = [5, 12, 20, 30] as const;

const FAST_FACTOR = 1.25;

export function comboMultiplier(goodStreak: number): number {
  for (const tier of COMBO_TIERS) {
    if (goodStreak >= tier.from) return tier.multiplier;
  }
  return 1;
}

/** `badStreak` is 1-based: the first wrong answer in a row is 1. */
export function penaltyFor(badStreak: number): number {
  if (badStreak <= 0) return 0;
  const index = Math.min(badStreak, PENALTIES.length) - 1;
  return PENALTIES[index] as number;
}

/** Streak length that unlocks the next multiplier, or null at the cap. */
export function nextTierAt(goodStreak: number): number | null {
  const ascending = COMBO_TIERS.toReversed();
  for (const tier of ascending) {
    if (goodStreak < tier.from) return tier.from;
  }
  return null;
}

export interface AttemptInput {
  isCorrect: boolean;
  tier: QuestionTier;
  /** The child asked to see the sentence the answer came from. */
  usedHint: boolean;
  /** Answered quickly for their level. See mastery.FLUENT_MS. */
  fast: boolean;
}

export interface AttemptResult {
  state: ScoreState;
  /** Signed points change, already rounded. */
  delta: number;
  /** Multiplier that was applied (1 for a wrong answer). */
  multiplier: number;
  /** The multiplier just went up — the moment worth celebrating. */
  tierUp: boolean;
  /** The penalty just got worse than last time. */
  tierDown: boolean;
}

/**
 * The single place where a score changes. Pure: same input, same output, no
 * clock, no storage, no DOM.
 */
export function applyAttempt(state: ScoreState, input: AttemptInput): AttemptResult {
  const previousMultiplier = comboMultiplier(state.goodStreak);
  const previousPenalty = penaltyFor(state.badStreak);

  if (input.isCorrect) {
    /**
     * Being shown the sentence scores nothing and ends the run, but still
     * counts as correct and still clears a bad run. A child who is stuck should
     * reach for the hint rather than guess — the hint is how they learn where
     * the answer lives in a text, which is the skill being taught.
     */
    if (input.usedHint) {
      return {
        state: {
          rawPoints: state.rawPoints,
          goodStreak: 0,
          badStreak: 0,
          bestStreak: state.bestStreak,
          correct: state.correct + 1,
          wrong: state.wrong,
        },
        delta: 0,
        multiplier: 1,
        tierUp: false,
        tierDown: false,
      };
    }

    const goodStreak = state.goodStreak + 1;
    const multiplier = comboMultiplier(goodStreak);
    const modifier = input.fast ? FAST_FACTOR : 1;
    const delta = Math.round(BASE_POINTS[input.tier] * multiplier * modifier);

    return {
      state: {
        rawPoints: state.rawPoints + delta,
        goodStreak,
        badStreak: 0, // a correct answer is the only way out of a bad run
        bestStreak: Math.max(state.bestStreak, goodStreak),
        correct: state.correct + 1,
        wrong: state.wrong,
      },
      delta,
      multiplier,
      tierUp: multiplier > previousMultiplier,
      tierDown: false,
    };
  }

  const badStreak = state.badStreak + 1;
  const delta = -penaltyFor(badStreak);

  return {
    state: {
      rawPoints: state.rawPoints + delta,
      goodStreak: 0, // one mistake ends the combo outright
      badStreak,
      bestStreak: state.bestStreak,
      correct: state.correct,
      wrong: state.wrong + 1,
    },
    delta,
    multiplier: 1,
    tierUp: false,
    tierDown: -delta > previousPenalty,
  };
}

/**
 * What the child sees. The true total is kept in `rawPoints` for the progress
 * screen, but a visible negative score reads as "you are bad at this" to a
 * seven-year-old, so the display floors at zero.
 */
export function displayPoints(state: ScoreState): number {
  return Math.max(0, state.rawPoints);
}

export function isGoalReached(state: ScoreState, settings: ReadingSettings): boolean {
  return settings.goalEnabled && displayPoints(state) >= settings.goalTarget;
}
