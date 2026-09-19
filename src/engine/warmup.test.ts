import { describe, expect, it } from "vitest";
import { warmupWords, WARMUP_COUNT } from "./warmup.ts";

const UK = [
  "Одного ранку лисиця вийшла з нори.",
  "Вона здригнулася, побачивши журавля біля струмка.",
  "Журавель уважно розглядав воду.",
].join(" ");

describe("warmupWords", () => {
  it("picks words out of the text, never invents them", () => {
    const picked = warmupWords(UK, { lang: "uk", level: "developing" });
    expect(picked.length).toBeGreaterThan(0);
    for (const word of picked) expect(UK).toContain(word);
  });

  it("leaves out the little words nobody stalls on", () => {
    const picked = warmupWords(UK, { lang: "uk", level: "developing" });
    expect(picked).not.toContain("з");
    expect(picked).not.toContain("Вона");
  });

  /** Clusters are what stall a child, not length alone. */
  it("puts the hardest word first", () => {
    const picked = warmupWords(UK, { lang: "uk", level: "developing", count: 1 });
    expect(picked).toEqual(["здригнулася"]);
  });

  /**
   * The whole reason the app keeps a stumble list. A word this child got wrong
   * last week outranks a longer word they have never had trouble with.
   */
  it("puts a word the child has tripped over before ahead of a longer one", () => {
    const picked = warmupWords(UK, {
      lang: "uk",
      level: "developing",
      struggled: ["журавля"],
      count: 1,
    });
    expect(picked).toEqual(["журавля"]);
  });

  /** A known-hard word is worth a look even when it is short. */
  it("keeps a short word the child has struggled with", () => {
    const picked = warmupWords(UK, { lang: "uk", level: "advanced", struggled: ["нори"] });
    expect(picked).toContain("нори");
  });

  it("shows the form the text actually uses, not a dictionary one", () => {
    const picked = warmupWords("Лисиця бачила лисицю.", {
      lang: "uk",
      level: "beginner",
      count: 1,
    });
    // First occurrence wins: the child meets "Лисиця" in sentence one.
    expect(picked).toEqual(["Лисиця"]);
  });

  it("never repeats a word that appears twice", () => {
    const picked = warmupWords("Журавель прилетів. Журавель полетів геть.", {
      lang: "uk",
      level: "developing",
    });
    expect(picked.filter((word) => word.toLowerCase() === "журавель")).toHaveLength(1);
  });

  it("asks less of a stronger reader", () => {
    const beginner = warmupWords(UK, { lang: "uk", level: "beginner", count: 10 });
    const advanced = warmupWords(UK, { lang: "uk", level: "advanced", count: 10 });
    expect(advanced.length).toBeLessThan(beginner.length);
  });

  it("shows no more than a handful by default", () => {
    const long = Array.from({ length: 40 }, (_, index) => `розмальовував${index}`).join(" ");
    expect(warmupWords(long, { lang: "uk", level: "developing" })).toHaveLength(WARMUP_COUNT);
  });

  /** An easy text has nothing to warm up on, and says so by staying empty. */
  it("returns nothing rather than padding with easy words", () => {
    expect(warmupWords("Кіт спав. Пес їв.", { lang: "uk", level: "fluent" })).toEqual([]);
  });

  it("works the same way in Polish and English", () => {
    expect(
      warmupWords("Żółw przeczytał niesamowitą książkę.", { lang: "pl", level: "developing" }),
    ).toContain("niesamowitą");
    expect(
      warmupWords("The caterpillar munched a leaf.", { lang: "en", level: "developing" }),
    ).toContain("caterpillar");
  });
});
