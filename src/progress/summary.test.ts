import { describe, expect, it } from "vitest";
import { EMPTY_STAT, skillId, updateStat, type MasteryStat } from "@/engine";
import {
  dailySeries,
  readingStreak,
  skillSummary,
  totals,
  type SessionSummary,
} from "./summary.ts";

const NOW = new Date(2026, 8, 19, 20, 0);
const DAY = 86_400_000;

function session(daysAgo: number, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: `s${daysAgo}`,
    startedAt: NOW.getTime() - daysAgo * DAY,
    wordCount: 120,
    readingMs: 90_000, // 80 wpm
    speedCounts: true,
    verdicts: ["correct", "correct", "correct", "incorrect"],
    ...overrides,
  };
}

function learned(times: number): MasteryStat {
  let stat = EMPTY_STAT;
  for (let i = 0; i < times; i++) {
    stat = updateStat(
      stat,
      { isCorrect: true, ms: 6_000, level: "developing", aided: false },
      NOW.getTime(),
    );
  }
  return stat;
}

describe("dailySeries", () => {
  /** A gap reads as missing data; a zero reads as a day nobody read. */
  it("fills every day in the window, including the empty ones", () => {
    const series = dailySeries([session(0), session(3)], 7, NOW);
    expect(series).toHaveLength(7);
    expect(series.at(-1)?.sessions).toBe(1);
    expect(series.filter((point) => point.sessions === 0)).toHaveLength(5);
  });

  it("averages the effective speed within a day", () => {
    const series = dailySeries([session(0), session(0, { id: "b", readingMs: 180_000 })], 3, NOW);
    // 80 wpm and 40 wpm, both at 75% comprehension.
    expect(series.at(-1)?.effectiveWpm).toBeCloseTo(45, 0);
  });

  it("leaves a day with no usable figure as null rather than zero", () => {
    const series = dailySeries([session(0, { speedCounts: false })], 3, NOW);
    expect(series.at(-1)?.sessions).toBe(1);
    expect(series.at(-1)?.effectiveWpm).toBeNull();
  });

  it("ignores a session nobody has judged yet", () => {
    const series = dailySeries([session(0, { verdicts: ["unsure", "unsure"] })], 3, NOW);
    expect(series.at(-1)?.effectiveWpm).toBeNull();
  });
});

describe("readingStreak", () => {
  it("counts consecutive days", () => {
    expect(readingStreak([session(0), session(1), session(2)], NOW)).toBe(3);
  });

  it("stops at the first gap", () => {
    expect(readingStreak([session(0), session(1), session(3)], NOW)).toBe(2);
  });

  /**
   * A family that reads in the evening must not lose their streak at midnight
   * for not having read yet today. Encouragement that resets while everyone is
   * asleep discourages.
   */
  it("survives a today that has not happened yet", () => {
    expect(readingStreak([session(1), session(2)], NOW)).toBe(2);
  });

  it("is broken by two days off", () => {
    expect(readingStreak([session(2), session(3)], NOW)).toBe(0);
  });

  it("is zero with no reading at all", () => {
    expect(readingStreak([], NOW)).toBe(0);
  });

  it("counts a day once however many times they read", () => {
    expect(readingStreak([session(0), session(0, { id: "b" }), session(1)], NOW)).toBe(2);
  });
});

describe("skillSummary", () => {
  /**
   * "We have never asked them to draw a conclusion" is as useful to a parent as
   * "they are weak at it" — and a list that omits the untried looks like a
   * clean bill of health.
   */
  it("shows every skill, including ones never asked", () => {
    const summary = skillSummary(new Map(), "developing", NOW.getTime());
    expect(summary).toHaveLength(5);
    expect(summary.every((skill) => skill.band === "unseen")).toBe(true);
  });

  it("puts the strongest first", () => {
    const stats = new Map([[skillId("literal", "developing"), learned(10)]]);
    const summary = skillSummary(stats, "developing", NOW.getTime());
    expect(summary[0]?.type).toBe("literal");
    expect(summary[0]?.band).not.toBe("unseen");
  });

  it("reads the level it was asked about, not another", () => {
    const stats = new Map([[skillId("literal", "fluent"), learned(10)]]);
    expect(skillSummary(stats, "developing", NOW.getTime())[0]?.attempts).toBe(0);
  });
});

describe("totals", () => {
  it("averages over sessions, so one long text does not outvote a week", () => {
    const strong = session(0, { verdicts: ["correct", "correct", "correct", "correct"] });
    const weak = session(1, { verdicts: Array.from({ length: 20 }, () => "incorrect" as const) });
    expect(totals([strong, weak], NOW).comprehension).toBeCloseTo(0.5, 5);
  });

  it("has no figure at all until something has been judged", () => {
    const result = totals([session(0, { verdicts: ["unsure"] })], NOW);
    expect(result.comprehension).toBeNull();
    expect(result.effectiveWpm).toBeNull();
    expect(result.pending).toBe(1);
  });

  it("leaves an implausible read out of the speed average but keeps its score", () => {
    const result = totals([session(0, { speedCounts: false })], NOW);
    expect(result.effectiveWpm).toBeNull();
    expect(result.comprehension).toBeCloseTo(0.75, 5);
  });

  it("survives having nothing to summarise", () => {
    expect(totals([], NOW)).toEqual({
      sessions: 0,
      comprehension: null,
      effectiveWpm: null,
      streak: 0,
      pending: 0,
    });
  });
});
