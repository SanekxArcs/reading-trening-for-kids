import { describe, expect, it } from "vitest";
import {
  clampAttemptMs,
  EMPTY_STAT,
  FLUENT_MS,
  goalForLevel,
  hasNextLevel,
  HALF_LIFE_DAYS,
  masteryBand,
  MAX_ATTEMPT_MS,
  DEFAULT_SETTINGS,
  pickWeighted,
  seededRng,
  selectionWeight,
  settingsForLevel,
  skillId,
  strengthNow,
  updateStat,
  weakestSkills,
  wordId,
  type MasteryStat,
  type QuestionType,
} from "./index.ts";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function learned(times: number, level: "developing" = "developing", at = NOW): MasteryStat {
  let stat = EMPTY_STAT;
  for (let i = 0; i < times; i++) {
    stat = updateStat(stat, { isCorrect: true, ms: 5_000, level, aided: false }, at);
  }
  return stat;
}

describe("ids", () => {
  it("makes a stable skill id both ways", () => {
    expect(skillId("inference", "developing")).toBe("inference:developing");
  });

  it("folds case and surrounding punctuation into one word id", () => {
    expect(wordId("Лисиця,")).toBe(wordId("лисиця"));
    expect(wordId("«żółw»")).toBe(wordId("żółw"));
  });

  it("does not stem, so the warm-up can show the form the text used", () => {
    expect(wordId("лисиці")).not.toBe(wordId("лисиця"));
  });
});

describe("updateStat", () => {
  it("starts from nothing and never quite reaches certainty", () => {
    const stat = learned(50);
    expect(stat.strength).toBeLessThan(1);
    expect(stat.strength).toBeGreaterThan(0.9);
  });

  it("treats three quick correct answers as 'getting there', not 'knows it'", () => {
    // The gain curve is deliberately unhurried: a good afternoon moves a skill
    // up one band, not to the top. Reaching "known" takes repetition spread
    // over days, which is the only thing that actually predicts retention.
    expect(masteryBand(learned(3), NOW)).toBe("practising");
    expect(masteryBand(learned(1), NOW)).toBe("learning");
    expect(masteryBand(learned(8), NOW)).toBe("known");
  });

  it("costs far more for a mistake than one correct answer earns", () => {
    const before = learned(6);
    const after = updateStat(
      before,
      { isCorrect: false, ms: 9_000, level: "developing", aided: false },
      NOW,
    );
    const oneMore = updateStat(
      before,
      { isCorrect: true, ms: 5_000, level: "developing", aided: false },
      NOW,
    );
    expect(before.strength - after.strength).toBeGreaterThan(oneMore.strength - before.strength);
  });

  it("pays less when the child was shown the sentence", () => {
    const alone = updateStat(
      EMPTY_STAT,
      { isCorrect: true, ms: 5_000, level: "developing", aided: false },
      NOW,
    );
    const helped = updateStat(
      EMPTY_STAT,
      { isCorrect: true, ms: 5_000, level: "developing", aided: true },
      NOW,
    );
    expect(helped.strength).toBeLessThan(alone.strength);
    expect(helped.strength).toBeGreaterThan(0);
  });

  it("gives no speed credit past twice the fluent time, but does not punish", () => {
    const slow = updateStat(
      EMPTY_STAT,
      { isCorrect: true, ms: FLUENT_MS.developing * 5, level: "developing", aided: false },
      NOW,
    );
    expect(slow.strength).toBeCloseTo(0.1, 5);
  });

  it("allows a beginner much longer than an advanced reader", () => {
    expect(FLUENT_MS.beginner).toBeGreaterThan(FLUENT_MS.advanced);
  });

  it("keeps the fastest correct time, not the latest", () => {
    let stat = updateStat(
      EMPTY_STAT,
      { isCorrect: true, ms: 4_000, level: "developing", aided: false },
      NOW,
    );
    stat = updateStat(stat, { isCorrect: true, ms: 9_000, level: "developing", aided: false }, NOW);
    expect(stat.bestMs).toBe(4_000);
    expect(stat.totalMs).toBe(13_000);
  });
});

describe("strengthNow", () => {
  it("halves over the half-life", () => {
    const stat = learned(20);
    const later = strengthNow(stat, NOW + HALF_LIFE_DAYS * DAY);
    expect(later).toBeCloseTo(stat.strength / 2, 5);
  });

  it("is zero for something never attempted", () => {
    expect(strengthNow(EMPTY_STAT, NOW)).toBe(0);
  });

  it("never rises from sitting still", () => {
    const stat = learned(10);
    expect(strengthNow(stat, NOW - 5 * DAY)).toBeLessThanOrEqual(stat.strength);
  });
});

describe("selectionWeight", () => {
  it("ranks a known weakness above something never asked", () => {
    const missed = updateStat(
      EMPTY_STAT,
      { isCorrect: false, ms: 9_000, level: "developing", aided: false },
      NOW,
    );
    expect(selectionWeight(missed, NOW)).toBeGreaterThan(selectionWeight(undefined, NOW));
  });

  it("still brings mastered material round occasionally", () => {
    expect(selectionWeight(learned(60), NOW)).toBeGreaterThan(0);
  });
});

describe("pickWeighted", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickWeighted([], new Map(), seededRng(1), NOW)).toBeNull();
  });

  it("never returns the avoided id", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      expect(pickWeighted(["a", "b"], new Map(), rng, NOW, { avoid: "a" })).toBe("b");
    }
  });

  it("returns null when everything is excluded", () => {
    expect(pickWeighted(["a"], new Map(), seededRng(3), NOW, { avoid: "a" })).toBeNull();
  });

  it("favours the weak one without ever locking onto it", () => {
    const stats = new Map([["strong", learned(40)]]);
    const rng = seededRng(42);
    let weak = 0;
    for (let i = 0; i < 400; i++) {
      if (pickWeighted(["weak", "strong"], stats, rng, NOW) === "weak") weak++;
    }
    expect(weak).toBeGreaterThan(280);
    expect(weak).toBeLessThan(400);
  });
});

describe("weakestSkills", () => {
  const types: QuestionType[] = ["literal", "sequence", "inference"];

  it("puts the shakiest skill first", () => {
    const stats = new Map([
      [skillId("literal", "developing"), learned(40)],
      [skillId("sequence", "developing"), learned(40)],
    ]);
    expect(weakestSkills(types, "developing", stats, NOW, 1)).toEqual(["inference"]);
  });

  it("returns nothing when asked for nothing", () => {
    expect(weakestSkills(types, "developing", new Map(), NOW, 0)).toEqual([]);
  });
});

describe("clampAttemptMs", () => {
  it("records nonsense as the cap rather than as an instant answer", () => {
    expect(clampAttemptMs(Number.NaN)).toBe(MAX_ATTEMPT_MS);
    expect(clampAttemptMs(-1)).toBe(MAX_ATTEMPT_MS);
    expect(clampAttemptMs(MAX_ATTEMPT_MS * 10)).toBe(MAX_ATTEMPT_MS);
  });

  it("leaves a real answer alone", () => {
    expect(clampAttemptMs(7_400)).toBe(7_400);
  });
});

describe("levels", () => {
  it("plays level 1 to exactly the goal the parent typed", () => {
    expect(goalForLevel(137, 1)).toBe(137);
  });

  it("asks for more each level, rounded to something a child can read", () => {
    expect(goalForLevel(100, 2)).toBe(150);
    expect(goalForLevel(100, 3)).toBe(230);
  });

  it("changes nothing but the goal", () => {
    const settings = { ...DEFAULT_SETTINGS, goalEnabled: true, goalTarget: 100 };
    const levelled = settingsForLevel(settings, 3);
    expect(levelled.goalTarget).toBe(230);
    expect({ ...levelled, goalTarget: 100 }).toEqual(settings);
  });

  it("leaves settings untouched at level 1, object identity included", () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(settingsForLevel(settings, 1)).toBe(settings);
  });

  it("stops offering a next level once the goal has hit the ceiling", () => {
    const settings = { ...DEFAULT_SETTINGS, goalEnabled: true, goalTarget: 10_000 };
    expect(hasNextLevel(settings, 1)).toBe(false);
  });
});
