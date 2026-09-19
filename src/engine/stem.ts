import type { TextLang } from "./types.ts";

/**
 * Suffix stripping, deliberately crude.
 *
 * The single most common "wrong" answer in Ukrainian and Polish is the right
 * word in the wrong grammatical case. Asked "Хто побіг до лісу?", a child
 * answers "лисицю" because that is how the question sounded in their head. They
 * understood the text perfectly. Marking that wrong teaches them that reading
 * comprehension is a spelling test.
 *
 * This is not a Porter or Snowball stemmer and should not become one. It runs
 * *after* diacritic folding and *before* bounded edit distance, and those three
 * together already absorb the palatalisation a real stemmer would model
 * (`ręka`/`ręce`, `лисиця`/`лисиці`). Keeping it small keeps it debuggable, and
 * the fixture table is what proves it works.
 */

/**
 * Longest first, so "ами" is tried before "и".
 *
 * These are noun and adjective endings only. Verb endings are deliberately
 * absent: stripping them conflates tenses, and "побіг" versus "біжить" is a
 * difference a sequence question may actually be asking about.
 */
// prettier-ignore
const SUFFIXES: Record<TextLang, readonly string[]> = {
  uk: [
    "ами", "ями", "ові", "еві", "ах", "ях", "ею", "ою", "ів", "їв", "ом", "ем",
    "им", "ім", "их", "іх", "ий", "ій", "а", "я", "е", "є", "и", "і",
    "ї", "о", "у", "ю",
  ],
  pl: [
    "ami", "ach", "owi", "ego", "emu", "ow", "om", "em", "ie", "ach", "ami", "a",
    "e", "i", "o", "u", "y", "ą", "ę",
  ],
  en: [
    "ies", "ing", "es", "ed", "s",
  ],
};

/** Below this, a stem stops being a word and starts being noise. */
const MIN_STEM = 3;

export function stem(word: string, lang: TextLang): string {
  if (word.length <= MIN_STEM) return word;

  // English "-ies" is the one irregularity worth encoding: "stories" and
  // "story" must reach the same stem, and chopping "ies" alone gives "stor".
  if (lang === "en" && word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }

  for (const suffix of SUFFIXES[lang]) {
    if (word.length - suffix.length >= MIN_STEM && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

export function stemAll(words: readonly string[], lang: TextLang): string[] {
  return words.map((word) => stem(word, lang));
}
