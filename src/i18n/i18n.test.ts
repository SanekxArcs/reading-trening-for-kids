import { describe, expect, it } from "vitest";
import {
  LANGS,
  isLang,
  translate,
  translations,
  type Lang,
  type TranslationKey,
} from "./translations.ts";

const KEYS = Object.keys(translations.en) as TranslationKey[];

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).toSorted();
}

describe("translations", () => {
  it("covers every key in every language", () => {
    // The types already enforce this, but the check is cheap and it also catches
    // a key that exists with an empty string.
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(translations[lang][key], `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it("has no extra keys in the non-English languages", () => {
    for (const lang of LANGS) {
      expect(Object.keys(translations[lang]).toSorted()).toEqual(KEYS.toSorted());
    }
  });

  /**
   * The one failure the type system cannot see: a translator drops `{count}`
   * from a string and the number silently disappears from the UI. Nothing
   * crashes, and nobody notices until a child is looking at a sentence with a
   * hole in it.
   */
  it("keeps the same placeholders across every language", () => {
    for (const key of KEYS) {
      const expected = placeholders(translations.en[key]);
      for (const lang of LANGS) {
        expect(placeholders(translations[lang][key]), `${lang}.${key}`).toEqual(expected);
      }
    }
  });

  it("does not leave stray braces in any string", () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        const value = translations[lang][key];
        const opens = (value.match(/\{/g) ?? []).length;
        const closes = (value.match(/\}/g) ?? []).length;
        expect(opens, `${lang}.${key}`).toBe(closes);
      }
    }
  });

  /**
   * The child never learns that an API exists. This is a product rule, not a
   * style preference: a seven-year-old who is told "quota exceeded" hears "you
   * did something wrong", and there is nothing they could do about it anyway.
   */
  it("keeps API vocabulary out of every string the child can see", () => {
    const childKeys = KEYS.filter((key) => key.startsWith("child"));
    expect(childKeys.length).toBeGreaterThan(0);

    const forbidden = /gemini|api|token|quota|model|klucz|ключ|klucza|limit/i;
    for (const lang of LANGS) {
      for (const key of childKeys) {
        expect(translations[lang][key], `${lang}.${key}`).not.toMatch(forbidden);
      }
    }
  });

  /** Every error a parent can hit must have copy, in every language. */
  it("has parent-facing copy for every error key", () => {
    const errorKeys = KEYS.filter((key) => key.startsWith("err"));
    expect(errorKeys.length).toBeGreaterThan(10);

    for (const lang of LANGS) {
      for (const key of errorKeys) {
        expect(translations[lang][key].length, `${lang}.${key}`).toBeGreaterThan(20);
      }
    }
  });
});

describe("translate", () => {
  it("substitutes named values", () => {
    expect(translate("en", "wordsCount", { count: 120 })).toBe("120 words");
    expect(translate("uk", "wordsCount", { count: 120 })).toBe("120 слів");
  });

  it("substitutes every placeholder in a multi-value string", () => {
    const result = translate("en", "questionOf", { current: 3, total: 7 });
    expect(result).toBe("Question 3 of 7");
    expect(result).not.toMatch(/[{}]/);
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    // Failing loudly beats rendering a sentence with a hole in it.
    expect(translate("en", "wordsCount", {})).toBe("{count} words");
  });

  it("returns the template untouched when no values are given", () => {
    expect(translate("uk", "settings")).toBe(translations.uk.settings);
  });

  it("renders every language's every key without leftover placeholders", () => {
    // Every placeholder used anywhere in the catalogue. A new key with a new
    // placeholder name fails here until it is added, which is the point.
    const sample = {
      count: 1,
      current: 2,
      total: 3,
      points: 4,
      seconds: 5,
      requests: 6,
      tokens: 7,
      answer: "лисиця",
      sentence: "Лисиця побігла до лісу.",
      when: "09:00",
    };
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(translate(lang, key, sample), `${lang}.${key}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe("isLang", () => {
  it("accepts the supported languages and nothing else", () => {
    for (const lang of LANGS) expect(isLang(lang)).toBe(true);
    for (const value of ["de", "", "UK", null, undefined, 42, {}]) {
      expect(isLang(value)).toBe(false);
    }
  });

  it("narrows the type", () => {
    const value: unknown = "uk";
    if (isLang(value)) {
      const lang: Lang = value;
      expect(translations[lang]).toBeDefined();
    }
  });
});
