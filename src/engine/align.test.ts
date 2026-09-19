import { describe, expect, it } from "vitest";
import { alignReading, compareReading, readAloudStats, stumbledWords, words } from "./index.ts";

const PRINTED = "Одного ранку лисиця вийшла з нори до лісу";

function align(heard: string) {
  return compareReading(PRINTED, heard);
}

describe("alignReading", () => {
  it("matches a perfect reading word for word", () => {
    const aligned = align(PRINTED);
    expect(aligned).toHaveLength(words(PRINTED).length);
    expect(aligned.every((word) => word.op === "match")).toBe(true);
  });

  /**
   * The whole reason for an alignment rather than a word-by-word walk: one word
   * skipped early would otherwise throw every later comparison out of step and
   * report an almost perfect reading as almost entirely wrong.
   */
  it("stays in step after a skipped word", () => {
    const aligned = align("Одного ранку вийшла з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    expect(stats.skipped).toBe(1);
    expect(stats.correct).toBe(words(PRINTED).length - 1);
    expect(stumbledWords(aligned)).toEqual(["лисиця"]);
  });

  it("marks a different word as misread, not as skipped", () => {
    const aligned = align("Одного ранку ведмідь вийшла з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    expect(stats.misread).toBe(1);
    expect(stats.skipped).toBe(0);
    expect(stumbledWords(aligned)).toEqual(["лисиця"]);
  });

  /** A childish vowel is a slip, not a misreading. */
  it("credits a word said close enough", () => {
    const aligned = align("Одного ранку лисеця вийшла з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    expect(stats.correct).toBe(words(PRINTED).length);
    expect(stats.misread).toBe(0);
    expect(aligned.some((word) => word.op === "near")).toBe(true);
  });

  it("counts a repeated word as an insertion", () => {
    const aligned = align("Одного одного ранку лисиця вийшла з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    expect(stats.inserted).toBe(1);
    expect(stats.correct).toBe(words(PRINTED).length);
  });

  it("handles a self-correction without losing the rest", () => {
    const aligned = align("Одного ранку ведмідь лисиця вийшла з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    // The wrong word is an insertion; the right one that follows is a match.
    expect(stats.correct).toBe(words(PRINTED).length);
  });

  it("copes with a reading that stopped halfway", () => {
    const aligned = align("Одного ранку лисиця");
    const stats = readAloudStats(aligned, 30_000);

    expect(stats.correct).toBe(3);
    expect(stats.skipped).toBe(words(PRINTED).length - 3);
  });

  it("reports everything skipped for an empty transcript", () => {
    const stats = readAloudStats(align(""), 30_000);
    expect(stats.correct).toBe(0);
    expect(stats.skipped).toBe(words(PRINTED).length);
    expect(stats.accuracy).toBe(0);
  });

  it("survives an empty text", () => {
    expect(alignReading([], [])).toEqual([]);
    expect(readAloudStats([], 1000).accuracy).toBe(0);
  });
});

describe("readAloudStats", () => {
  /**
   * Correct words per minute, not all words: a child saying "the the the"
   * quickly is not reading quickly. The raw figure is kept only for comparison.
   */
  it("counts speed in words actually read", () => {
    const aligned = align("Одного ранку ведмідь ведмідь ведмідь з нори до лісу");
    const stats = readAloudStats(aligned, 60_000);

    expect(stats.wordsPerMinute).toBeLessThan(stats.rawWordsPerMinute);
    expect(stats.wordsPerMinute).toBe(stats.correct);
  });

  it("is zero rather than infinite for a zero-length recording", () => {
    expect(readAloudStats(align(PRINTED), 0).wordsPerMinute).toBe(0);
  });

  it("reports accuracy over the printed words, not the heard ones", () => {
    const aligned = align("Одного ранку лисиця вийшла з нори до лісу і ще щось зайве");
    const stats = readAloudStats(aligned, 60_000);
    expect(stats.accuracy).toBe(1);
    expect(stats.inserted).toBeGreaterThan(0);
  });
});
