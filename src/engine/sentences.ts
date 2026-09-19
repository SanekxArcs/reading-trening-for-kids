import type { Sentence, TextLang } from "./types.ts";

/**
 * Splitting a text into numbered sentences is the load-bearing operation of
 * this whole app.
 *
 * Every question carries the index of the sentence that proves its answer, and
 * that index is only meaningful if the split is stable: the same text must
 * always produce the same sentences, in the browser and in a test, before and
 * after a redeploy. So this is a plain deterministic scanner rather than
 * `Intl.Segmenter` — which is available, but whose output has changed between
 * browser versions and would quietly invalidate every cached question set.
 */

/**
 * Words that end in a full stop without ending a sentence.
 *
 * Kept per language and deliberately short: a missed abbreviation splits one
 * sentence into two, which costs a slightly odd question. A wrong entry here
 * merges two real sentences, which breaks the index a question points at. The
 * asymmetry says: when unsure, leave it out.
 */
const ABBREVIATIONS: Record<TextLang, readonly string[]> = {
  uk: ["т", "тобто", "напр", "ім", "вул", "просп", "обл", "р", "рр", "ст", "стор", "гр", "проф"],
  pl: ["np", "itd", "itp", "tj", "tzn", "ul", "al", "dr", "prof", "godz", "str", "ok", "por"],
  en: ["mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "eg", "ie", "fig", "no", "vol"],
  ru: ["т", "напр", "им", "ул", "просп", "обл", "г", "гг", "ст", "стр", "проф", "др"],
  cs: ["např", "atd", "apod", "tj", "tzn", "ul", "dr", "prof", "str", "obr", "č", "mj"],
};

/** Sentence-ending punctuation, including the ellipsis as one character. */
const TERMINATORS = new Set([".", "!", "?", "…"]);

/** Characters that may trail a terminator and still belong to the sentence. */
const TRAILING = new Set(['"', "'", "»", "”", "’", ")", "]", "”", "«", "“"]);

function isUpper(char: string): boolean {
  return char !== char.toLocaleLowerCase() && char === char.toLocaleUpperCase();
}

/**
 * True when a terminator at `i` does not actually end a sentence.
 *
 * Three cases, all of which appear in real children's books:
 *  - a known abbreviation (`np.`, `т.д.`, `Mr.`);
 *  - an initial — one capital letter and a stop, as in `А. С. Пушкін`;
 *  - a decimal point or a numbered list marker, as in `3.5` or `1. Першe`.
 */
function isFalseStop(text: string, i: number, abbreviations: ReadonlySet<string>): boolean {
  if (text[i] !== ".") return false;

  // Walk back over the word that precedes the stop.
  let start = i;
  while (start > 0 && /[\p{L}\p{N}]/u.test(text[start - 1] as string)) start--;
  const word = text.slice(start, i);

  if (word.length === 0) return false;
  if (word.length === 1 && isUpper(word)) return true; // initial
  if (abbreviations.has(word.toLocaleLowerCase())) return true;

  // A digit on both sides is a decimal, not a stop.
  const next = text[i + 1];
  if (/\p{N}/u.test(word.at(-1) as string) && next !== undefined && /\p{N}/u.test(next)) {
    return true;
  }
  return false;
}

/**
 * True when what follows the terminator looks like a new sentence.
 *
 * Dialogue is the case worth naming: in Ukrainian and Polish books a line of
 * speech opens with an em dash, not a capital, and treating that as a
 * continuation would glue a whole conversation into one "sentence".
 */
function startsNewSentence(text: string, i: number): boolean {
  let j = i;
  while (j < text.length && /\s/u.test(text[j] as string)) j++;
  if (j >= text.length) return true;

  const char = text[j] as string;
  if (char === "—" || char === "–" || char === "-") return true;
  if (TRAILING.has(char)) return true;
  if (/\p{N}/u.test(char)) return true;
  return isUpper(char);
}

/**
 * Splits `text` into sentences, preserving the offsets each one occupied.
 *
 * A blank line always ends a sentence, whatever punctuation it carried: a
 * heading or a line of verse often has none at all, and without this rule a
 * poem would come back as one enormous sentence with one question about it.
 */
export function splitSentences(text: string, lang: TextLang = "uk"): Sentence[] {
  const abbreviations = new Set(ABBREVIATIONS[lang]);
  const out: Sentence[] = [];

  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const lead = raw.length - raw.trimStart().length;
      out.push({
        index: out.length,
        text: trimmed,
        start: start + lead,
        end: start + lead + trimmed.length,
      });
    }
    start = end;
  };

  while (i < text.length) {
    const char = text[i] as string;

    if (TERMINATORS.has(char)) {
      if (isFalseStop(text, i, abbreviations)) {
        i++;
        continue;
      }
      // Consume runs like "?!" and "..." and any closing quote after them.
      let end = i + 1;
      while (end < text.length && TERMINATORS.has(text[end] as string)) end++;
      while (end < text.length && TRAILING.has(text[end] as string)) end++;

      if (end >= text.length || startsNewSentence(text, end)) {
        push(end);
        i = end;
        continue;
      }
      i = end;
      continue;
    }

    // A blank line is a hard break regardless of punctuation.
    if (char === "\n") {
      const rest = text.slice(i);
      const blank = /^\n\s*\n/.exec(rest);
      if (blank) {
        push(i);
        start = i + blank[0].length;
        i = start;
        continue;
      }
    }

    i++;
  }

  push(text.length);
  return out;
}

/** Joins sentences back into the numbered form a prompt shows the model. */
export function numbered(sentences: readonly Sentence[]): string {
  return sentences.map((sentence) => `[${sentence.index}] ${sentence.text}`).join("\n");
}
