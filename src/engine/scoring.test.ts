import { describe, expect, it } from "vitest";
import {
  applyAttempt,
  comboMultiplier,
  displayPoints,
  DEFAULT_SETTINGS,
  INITIAL_SCORE,
  isGoalReached,
  nextTierAt,
  penaltyFor,
  type AttemptInput,
  type ScoreState,
} from "./index.ts";

const correct: AttemptInput = {
  isCorrect: true,
  tier: "medium",
  usedHint: false,
  fast: false,
};

const wrong: AttemptInput = { ...correct, isCorrect: false };

function run(inputs: readonly AttemptInput[], from: ScoreState = INITIAL_SCORE): ScoreState {
  return inputs.reduce((state, input) => applyAttempt(state, input).state, from);
}

describe("comboMultiplier", () => {
  it("starts at 1 and climbs within a short round", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(2)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(7)).toBe(3);
    expect(comboMultiplier(12)).toBe(4);
  });

  it("reaches its top tier inside a realistic reading round", () => {
    // The whole reason the tiers were re-cut from the math app: a set is five
    // to twelve questions, so a tier the child can never reach is dead code.
    expect(comboMultiplier(12)).toBeGreaterThan(comboMultiplier(11));
  });

  it("reports the next tier, and null at the cap", () => {
    expect(nextTierAt(0)).toBe(3);
    expect(nextTierAt(3)).toBe(7);
    expect(nextTierAt(12)).toBeNull();
  });
});

describe("penaltyFor", () => {
  it("is nothing before a mistake and escalates after one", () => {
    expect(penaltyFor(0)).toBe(0);
    expect(penaltyFor(1)).toBe(5);
    expect(penaltyFor(2)).toBe(12);
  });

  it("caps rather than growing without limit", () => {
    expect(penaltyFor(4)).toBe(penaltyFor(40));
  });
});

describe("applyAttempt", () => {
  it("scores by tier", () => {
    expect(applyAttempt(INITIAL_SCORE, { ...correct, tier: "easy" }).delta).toBe(5);
    expect(applyAttempt(INITIAL_SCORE, { ...correct, tier: "medium" }).delta).toBe(10);
    expect(applyAttempt(INITIAL_SCORE, { ...correct, tier: "hard" }).delta).toBe(20);
  });

  it("pays a bonus for a fast answer", () => {
    const plain = applyAttempt(INITIAL_SCORE, correct).delta;
    const quick = applyAttempt(INITIAL_SCORE, { ...correct, fast: true }).delta;
    expect(quick).toBeGreaterThan(plain);
  });

  it("gives a hinted answer no points and ends the combo, but still counts it", () => {
    const state = run([correct, correct, correct]);
    expect(state.goodStreak).toBe(3);

    const hinted = applyAttempt(state, { ...correct, usedHint: true });
    expect(hinted.delta).toBe(0);
    expect(hinted.state.goodStreak).toBe(0);
    expect(hinted.state.correct).toBe(state.correct + 1);
  });

  it("lets a hinted answer clear a bad run", () => {
    const state = run([wrong, wrong]);
    expect(state.badStreak).toBe(2);

    const hinted = applyAttempt(state, { ...correct, usedHint: true });
    expect(hinted.state.badStreak).toBe(0);
  });

  it("ends the combo on a single mistake", () => {
    const state = run([correct, correct, correct, correct, wrong]);
    expect(state.goodStreak).toBe(0);
    expect(state.badStreak).toBe(1);
    expect(state.bestStreak).toBe(4);
  });

  it("only lets a correct answer end a bad run", () => {
    const state = run([wrong, wrong, correct]);
    expect(state.badStreak).toBe(0);
    expect(state.goodStreak).toBe(1);
  });

  it("flags the moment the multiplier goes up", () => {
    const before = run([correct, correct]);
    expect(applyAttempt(before, correct).tierUp).toBe(true);
    expect(applyAttempt(INITIAL_SCORE, correct).tierUp).toBe(false);
  });

  it("flags a deepening penalty", () => {
    const first = applyAttempt(INITIAL_SCORE, wrong);
    expect(first.tierDown).toBe(true);
    expect(applyAttempt(first.state, wrong).tierDown).toBe(true);
  });
});

describe("displayPoints", () => {
  it("never shows a child a negative score", () => {
    const state = run([wrong, wrong, wrong, wrong]);
    expect(state.rawPoints).toBeLessThan(0);
    expect(displayPoints(state)).toBe(0);
  });
});

describe("isGoalReached", () => {
  it("uses the displayed points, not the raw total", () => {
    const settings = { ...DEFAULT_SETTINGS, goalEnabled: true, goalTarget: 10 };
    expect(isGoalReached({ ...INITIAL_SCORE, rawPoints: 10 }, settings)).toBe(true);
    expect(isGoalReached({ ...INITIAL_SCORE, rawPoints: -50 }, settings)).toBe(false);
  });

  it("is never reached when the goal is switched off", () => {
    const settings = { ...DEFAULT_SETTINGS, goalEnabled: false, goalTarget: 10 };
    expect(isGoalReached({ ...INITIAL_SCORE, rawPoints: 9999 }, settings)).toBe(false);
  });
});
