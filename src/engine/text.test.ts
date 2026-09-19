import { describe, expect, it } from "vitest";
import {
  countChars,
  countWords,
  deriveTitle,
  guessLanguage,
  numbered,
  questionCount,
  splitSentences,
  textHash,
  words,
} from "./index.ts";

describe("splitSentences", () => {
  it("splits on the three terminators", () => {
    const out = splitSentences("Лисиця побігла. Куди вона біжить? До лісу!");
    expect(out.map((s) => s.text)).toEqual(["Лисиця побігла.", "Куди вона біжить?", "До лісу!"]);
  });

  it("numbers sentences from zero and keeps the numbering dense", () => {
    const out = splitSentences("Раз. Два. Три.");
    expect(out.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("records offsets that point back at the original text", () => {
    const text = "Перше речення. Друге речення.";
    const out = splitSentences(text);
    for (const sentence of out) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });

  it("does not split inside a known abbreviation", () => {
    expect(splitSentences("Купили яблука, груші і т. д. Потім пішли додому.", "uk")).toHaveLength(
      2,
    );
    expect(splitSentences("Weź np. jabłko i gruszkę. Potem wracaj.", "pl")).toHaveLength(2);
    expect(splitSentences("Mr. Brown went home. He was tired.", "en")).toHaveLength(2);
  });

  it("does not split on an initial", () => {
    expect(splitSentences("Це написав А. С. Пушкін давно.", "uk")).toHaveLength(1);
  });

  it("does not split a decimal number", () => {
    expect(splitSentences("Було 3.5 метра тканини.", "uk")).toHaveLength(1);
  });

  it("keeps a run of terminators together", () => {
    const out = splitSentences("Що?! Не може бути... Справді.");
    expect(out).toHaveLength(3);
    expect(out[0]?.text).toBe("Що?!");
  });

  it("keeps a closing quote with the sentence it closes", () => {
    const out = splitSentences('Він сказав: "Я вже йду." Потім вийшов.');
    expect(out[0]?.text).toBe('Він сказав: "Я вже йду."');
  });

  /**
   * Dialogue is the case that would otherwise glue a whole conversation into
   * one "sentence", and children's books are mostly dialogue.
   */
  it("treats a dash-opened line of dialogue as a new sentence", () => {
    const out = splitSentences("— Куди ти йдеш? — запитала мама. — До школи.");
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("ends a sentence at a blank line even without punctuation", () => {
    const out = splitSentences("Заголовок без крапки\n\nА це вже текст далі.");
    expect(out).toHaveLength(2);
    expect(out[0]?.text).toBe("Заголовок без крапки");
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n\n  ")).toEqual([]);
  });

  it("keeps a trailing fragment that has no terminator", () => {
    const out = splitSentences("Перше речення. І ще щось без крапки");
    expect(out).toHaveLength(2);
    expect(out[1]?.text).toBe("І ще щось без крапки");
  });

  it("is stable: the same text always splits the same way", () => {
    const text = "Один. Два! Три? Чотири...";
    expect(splitSentences(text)).toEqual(splitSentences(text));
  });
});

describe("numbered", () => {
  it("renders the form a prompt shows the model", () => {
    expect(numbered(splitSentences("Раз. Два."))).toBe("[0] Раз.\n[1] Два.");
  });
});

describe("words", () => {
  it("keeps an internal apostrophe inside one word", () => {
    expect(words("м'яч летить")).toEqual(["м'яч", "летить"]);
  });

  it("keeps a hyphenated word whole", () => {
    expect(countWords("biało-czerwony sztandar")).toBe(2);
  });

  it("ignores punctuation and counts numbers", () => {
    expect(countWords("Було 3 яблука, 2 груші!")).toBe(5);
  });

  it("counts characters without whitespace", () => {
    expect(countChars("аб вг\nде")).toBe(6);
  });
});

describe("guessLanguage", () => {
  it.each([
    ["Лисиця побігла до лісу, бо її кликали друзі.", "uk"],
    ["Lisica pobiegła do lasu, żeby znaleźć jedzenie.", "pl"],
    ["The fox ran into the forest to find some food.", "en"],
  ])("recognises %s", (text, expected) => {
    expect(guessLanguage(text)).toBe(expected);
  });

  it("falls back to Ukrainian for Cyrillic with no distinguishing letters", () => {
    expect(guessLanguage("Мама мала раму")).toBe("uk");
  });

  /**
   * Ukrainian is the only Cyrillic language the app reads now. A Russian text
   * is stemmed with Ukrainian suffixes rather than refused — close enough to
   * grade fairly, and the parent sees the guess beside a picker.
   */
  it("reads any other Cyrillic as Ukrainian rather than refusing it", () => {
    expect(guessLanguage("Лисица побежала в лес, потому что её звали друзья.")).toBe("uk");
  });
});

describe("questionCount", () => {
  it("is about one question per two sentences", () => {
    expect(questionCount(10, "fluent", 20)).toBe(5);
  });

  it("never asks nothing about a text that has sentences", () => {
    expect(questionCount(1, "beginner", 20)).toBe(1);
  });

  it("asks nothing about nothing", () => {
    expect(questionCount(0, "fluent", 20)).toBe(0);
  });

  /**
   * The rule that matters: a child still decoding has spent everything on the
   * reading itself, so a long text must not turn into a long test.
   */
  it("caps hard for a beginner however long the text is", () => {
    expect(questionCount(200, "beginner", 50)).toBe(5);
    expect(questionCount(200, "advanced", 50)).toBe(16);
  });

  it("respects the parent's own maximum", () => {
    expect(questionCount(200, "advanced", 6)).toBe(6);
  });

  it("never asks more questions than there are sentences", () => {
    expect(questionCount(3, "advanced", 50)).toBeLessThanOrEqual(3);
  });
});

describe("textHash", () => {
  it("ignores whitespace and case, so a re-paste hits the same entry", () => {
    expect(textHash("Лисиця  побігла\nдо лісу.")).toBe(textHash("лисиця побігла до лісу."));
  });

  it("changes when the text changes", () => {
    expect(textHash("Лисиця побігла.")).not.toBe(textHash("Лисиця побігли."));
  });
});

describe("deriveTitle", () => {
  it("uses the whole text when it is short", () => {
    expect(deriveTitle("Лисиця і журавель")).toBe("Лисиця і журавель");
  });

  it("cuts at a word boundary and marks the cut", () => {
    const title = deriveTitle("Одного разу лисиця побігла до лісу шукати собі вечерю", 24);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(25);
    expect(title).not.toMatch(/\s…$/);
  });
});
