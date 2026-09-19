import { describe, expect, it } from "vitest";
import {
  comprehension,
  displayPercent,
  displayRate,
  generateFallbackQuestions,
  gradeLocally,
  MAX_READING_MS,
  MIN_MS_PER_WORD,
  seededRng,
  sessionMetrics,
  sessionMetrics as metrics,
  speedFlag,
  splitSentences,
  wordsPerMinute,
  type AnswerVerdict,
} from "./index.ts";

describe("wordsPerMinute", () => {
  it("is words over minutes", () => {
    expect(wordsPerMinute(100, 60_000)).toBe(100);
    expect(wordsPerMinute(50, 30_000)).toBe(100);
  });

  it("is zero rather than infinite when the clock did not run", () => {
    expect(wordsPerMinute(100, 0)).toBe(0);
    expect(wordsPerMinute(0, 60_000)).toBe(0);
  });
});

describe("speedFlag", () => {
  it("accepts an ordinary child's reading", () => {
    // 100 words in 75 seconds is 80 wpm — a real developing reader.
    expect(speedFlag(100, 75_000)).toBe("ok");
  });

  /**
   * The threshold is generous on purpose. Wrongly accusing a proud child of
   * skipping costs far more than letting the occasional skim through.
   */
  it("leaves a genuinely fast child alone", () => {
    // 200 wpm, about as fast as a strong young reader gets.
    expect(speedFlag(200, 60_000)).toBe("ok");
  });

  it("flags a text that was scrolled past rather than read", () => {
    expect(speedFlag(300, 300 * MIN_MS_PER_WORD - 1)).toBe("too_fast");
    expect(speedFlag(500, 5_000)).toBe("too_fast");
  });

  it("flags an instant finish however short the text", () => {
    expect(speedFlag(3, 500)).toBe("too_fast");
  });

  it("flags a clock left running", () => {
    expect(speedFlag(100, MAX_READING_MS + 1)).toBe("too_slow");
  });
});

describe("comprehension", () => {
  it("scores correct, partial and incorrect", () => {
    const verdicts: AnswerVerdict[] = ["correct", "correct", "partial", "incorrect"];
    expect(comprehension(verdicts).score).toBeCloseTo(0.625, 5);
  });

  /**
   * The rule that keeps the percentage honest: an answer nobody has judged is
   * out of the fraction entirely, not counted as zero.
   */
  it("leaves unjudged answers out of both halves of the fraction", () => {
    const result = comprehension(["correct", "correct", "unsure", "unsure"]);
    expect(result.score).toBe(1);
    expect(result.judged).toBe(2);
    expect(result.pending).toBe(2);
  });

  it("has no score at all when nothing has been judged", () => {
    expect(comprehension(["unsure", "unsure"]).score).toBeNull();
    expect(comprehension([]).score).toBeNull();
  });
});

describe("sessionMetrics", () => {
  const base = {
    wordCount: 120,
    charCount: 700,
    readingMs: 90_000,
    answerMs: [8_000, 12_000, 10_000],
  };

  it("discounts speed by understanding", () => {
    const result = metrics({ ...base, verdicts: ["correct", "correct", "incorrect"] });
    expect(displayRate(result.wordsPerMinute)).toBe(80);
    expect(result.comprehension.score).toBeCloseTo(2 / 3, 5);
    expect(displayRate(result.effectiveWpm)).toBe(53);
  });

  /**
   * The headline metric is speed times understanding, exactly — so the honest
   * claim is not "careful always wins" but "the trade is one for one". Reading
   * three times faster with a third of the comprehension scores identically;
   * anything less than a proportional gain is a loss.
   */
  it("is a one-for-one trade between speed and understanding", () => {
    const careful = metrics({
      ...base,
      readingMs: 120_000,
      verdicts: ["correct", "correct", "correct"],
    });
    const skimmedProportionally = metrics({
      ...base,
      readingMs: 40_000,
      verdicts: ["correct", "incorrect", "incorrect"],
    });
    expect(skimmedProportionally.effectiveWpm).toBeCloseTo(careful.effectiveWpm, 5);
  });

  it("punishes a skim that loses more comprehension than it gains speed", () => {
    const careful = metrics({
      ...base,
      readingMs: 120_000,
      verdicts: ["correct", "correct", "correct"],
    });
    // Twice as fast, but only one answer in three survives.
    const skimmed = metrics({
      ...base,
      readingMs: 60_000,
      verdicts: ["correct", "incorrect", "incorrect"],
    });
    expect(skimmed.wordsPerMinute).toBeGreaterThan(careful.wordsPerMinute);
    expect(skimmed.effectiveWpm).toBeLessThan(careful.effectiveWpm);
  });

  it("reports no effective speed until something has been judged", () => {
    const result = metrics({ ...base, verdicts: ["unsure", "unsure"] });
    expect(result.effectiveWpm).toBe(0);
    expect(result.wordsPerMinute).toBeGreaterThan(0);
  });

  it("says when the speed figures must not be kept", () => {
    const skimmed = metrics({ ...base, readingMs: 2_500, verdicts: ["correct"] });
    expect(skimmed.speed).toBe("too_fast");
    expect(skimmed.speedCounts).toBe(false);
  });

  it("averages the answer times", () => {
    expect(metrics({ ...base, verdicts: ["correct"] }).averageAnswerMs).toBe(10_000);
  });

  it("survives a session with no questions at all", () => {
    const result = sessionMetrics({ ...base, verdicts: [], answerMs: [] });
    expect(result.averageAnswerMs).toBe(0);
    expect(result.comprehension.score).toBeNull();
  });
});

describe("display helpers", () => {
  it("rounds rates to whole numbers", () => {
    expect(displayRate(73.6)).toBe(74);
  });

  it("passes a missing score straight through", () => {
    expect(displayPercent(null)).toBeNull();
    expect(displayPercent(0.666)).toBe(67);
  });
});

describe("generateFallbackQuestions", () => {
  const story = [
    "Одного ранку маленька лисиця вийшла з нори.",
    "Вона побачила великого журавля біля струмка.",
    "Журавель ловив рибу довгим дзьобом.",
    "Лисиця захотіла подружитися з птахом.",
    "Вони розмовляли до самого вечора.",
    "Відтоді лисиця і журавель ходили разом.",
  ].join(" ");

  const sentences = splitSentences(story, "uk");

  it("produces the number of questions asked for", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 3,
      rng: seededRng(1),
    });
    expect(out).toHaveLength(3);
  });

  it("asks about a different sentence each time", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 4,
      rng: seededRng(2),
    });
    const used = out.map((q) => q.sentenceIndex);
    expect(new Set(used).size).toBe(used.length);
  });

  /**
   * Spread matters: taking the globally best candidates would cluster every
   * question in whichever paragraph used the longest words.
   */
  it("spreads the questions across the whole text", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 3,
      rng: seededRng(3),
    });
    const used = out.map((q) => q.sentenceIndex).toSorted((a, b) => a - b);
    expect(used[0]).toBeLessThan(2);
    expect(used.at(-1)).toBeGreaterThan(3);
  });

  it("puts a blank where the answer was, and the answer nowhere in the prompt", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 4,
      rng: seededRng(4),
    });
    for (const question of out) {
      expect(question.prompt).toContain("…");
      expect(question.prompt.toLocaleLowerCase()).not.toContain(question.canonicalAnswer);
    }
  });

  it("never blanks a function word", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 5,
      rng: seededRng(5),
    });
    for (const question of out) {
      expect(question.canonicalAnswer.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("produces answers its own matcher then accepts", () => {
    const out = generateFallbackQuestions(sentences, {
      lang: "uk",
      level: "developing",
      count: 4,
      rng: seededRng(6),
    });
    for (const question of out) {
      expect(gradeLocally(question, question.canonicalAnswer, "uk").verdict).toBe("correct");
    }
  });

  it("is deterministic for a given seed", () => {
    const options = { lang: "uk", level: "developing", count: 3 } as const;
    const a = generateFallbackQuestions(sentences, { ...options, rng: seededRng(7) });
    const b = generateFallbackQuestions(sentences, { ...options, rng: seededRng(7) });
    expect(a).toEqual(b);
  });

  it("returns nothing rather than throwing on an empty or unusable text", () => {
    expect(
      generateFallbackQuestions([], { lang: "uk", level: "beginner", count: 3, rng: seededRng(8) }),
    ).toEqual([]);
    expect(
      generateFallbackQuestions(splitSentences("Ні. Так."), {
        lang: "uk",
        level: "beginner",
        count: 3,
        rng: seededRng(9),
      }),
    ).toEqual([]);
  });
});
