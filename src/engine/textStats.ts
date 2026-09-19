import type { ChildLevel, TextLang } from "./types.ts";

/**
 * Word and character counting, language detection and the question-count
 * heuristic — everything that reads a text and reports a number about it.
 */

/**
 * A "word" for counting purposes.
 *
 * Internal apostrophes and hyphens stay inside the word, because "м'яч" and
 * "biało-czerwony" are one word each and counting them as two would inflate
 * every reading speed the app reports.
 */
const WORD = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu;

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Characters excluding whitespace.
 *
 * Ukrainian and Polish schools measure reading in characters per minute as
 * often as in words, and a word-based figure alone is misleading across
 * languages: the same story is noticeably fewer, longer words in Ukrainian
 * than in English.
 */
export function countChars(text: string): number {
  return text.replace(/\s+/gu, "").length;
}

/**
 * Letters that only appear in one of the supported languages.
 *
 * Detection by distinctive characters rather than by word lists: it is a few
 * lines, it needs no dictionary, and it cannot be fooled by a text that happens
 * to contain a foreign name.
 */
const MARKERS: Record<TextLang, RegExp> = {
  uk: /[іїєґ]/iu,
  pl: /[ąćęłńóśźż]/iu,
  en: /^$/u, // never matches; English is the fallback for plain Latin
};

/**
 * Best guess at the language of a text.
 *
 * Returns a guess, always — the caller shows it to the parent as an editable
 * field rather than trusting it, because getting this wrong means stemming a
 * Polish answer with Ukrainian suffixes and quietly grading a child unfairly.
 */
export function guessLanguage(text: string): TextLang {
  // Any Cyrillic is Ukrainian here, because it is the only Cyrillic language
  // the app reads. A Russian text pasted in is stemmed with Ukrainian suffixes
  // rather than refused — close enough to grade fairly, and the guess sits next
  // to a picker with all three languages on it.
  if (/\p{Script=Cyrillic}/u.test(text)) return "uk";
  if (MARKERS.pl.test(text)) return "pl";
  return "en";
}

/**
 * How many questions a text of this many sentences deserves.
 *
 * Roughly one question per two sentences, because every question has to be
 * about a *different* sentence — asking two things about the same line is how a
 * comprehension test turns into a memory test for one detail.
 *
 * The per-level ceiling is the part that matters most. A child who is still
 * decoding has spent everything they had on the reading itself; twelve
 * questions afterwards does not measure comprehension, it measures stamina.
 */
const LEVEL_CEILING: Record<ChildLevel, number> = {
  beginner: 5,
  developing: 8,
  fluent: 12,
  advanced: 16,
};

export function questionCount(
  sentenceCount: number,
  level: ChildLevel,
  maxQuestions: number,
): number {
  if (sentenceCount <= 0) return 0;
  const proportional = Math.ceil(sentenceCount / 2);
  const ceiling = Math.min(LEVEL_CEILING[level], maxQuestions, sentenceCount);
  return Math.max(1, Math.min(proportional, ceiling));
}

/**
 * A stable content hash, used as the identity of a text and as part of the
 * question-set cache key.
 *
 * FNV-1a over the normalised text rather than SHA-256 via Web Crypto, for one
 * practical reason: this has to be callable synchronously from pure code and
 * from a test, and `crypto.subtle` is async and absent in a plain node
 * environment. Collisions do not matter here — the worst case is a cache miss.
 */
export function normaliseForHash(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

export function textHash(text: string): string {
  const source = normaliseForHash(text);
  // Two independent FNV-1a streams give 64 bits, which is plenty to keep a
  // family's few hundred texts apart.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(36).padStart(7, "0") + h2.toString(36).padStart(7, "0");
}

/**
 * A title for a text the parent did not name: the first few words, trimmed at a
 * word boundary. Better than "Untitled 3" in a library a child browses.
 */
export function deriveTitle(text: string, maxChars = 48): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
