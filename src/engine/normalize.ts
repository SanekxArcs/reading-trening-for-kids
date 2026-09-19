/**
 * Turning what a child typed into something comparable.
 *
 * Every step here exists because of a specific way a seven-year-old's answer
 * differs from the "right" one while meaning exactly the same thing.
 */

/**
 * Letters that survive Unicode decomposition and still need folding.
 *
 * NFD + strip-marks handles ó, ą, ř and the Cyrillic ї. It does not handle ł,
 * because ł is a single indivisible code point — and ł is precisely the letter
 * a child typing on a plain keyboard will get wrong.
 */
const SPECIAL_FOLD: Record<string, string> = {
  ł: "l",
  Ł: "L",
  đ: "d",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ь: "",
  ъ: "",
};

/**
 * Lowercased, NFKC-normalised, stripped of punctuation and collapsed.
 *
 * Punctuation goes because a child answers "лисиця." as often as "лисиця", and
 * because voice input inserts commas nobody said.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s'’ʼ-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Diacritics removed, plus the special cases above.
 *
 * Applied to both sides of every comparison, never stored: the app shows the
 * child the properly spelled word, it just does not insist they typed it.
 */
export function fold(text: string): string {
  const mapped = [...text].map((char) => SPECIAL_FOLD[char] ?? char).join("");
  return mapped.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Words of an already-normalised string.
 *
 * Soft hyphens and apostrophes are dropped here rather than in `normalize`,
 * because "м'яч" must stay one token while still comparing equal to "мяч" —
 * which is how most children type it.
 */
export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .map((token) => token.replace(/['’ʼ-]/gu, ""))
    .filter((token) => token.length > 0);
}

/** The full pipeline, for the common case. */
export function foldedTokens(text: string): string[] {
  return tokens(fold(text));
}

/**
 * Answers that mean "I don't know", in every language the app reads.
 *
 * Graded as wrong rather than escalated: a child who types this has told us
 * plainly, and sending it to a model to be judged would waste a call and risk
 * a generous model calling it partial.
 */
const GIVE_UP =
  /^(?:\?+|-+|\.+|idk|dunno|no idea|don'?t know|nie wiem|niewiem|nevim|не знаю|незнаю|не знаю не знаю|я не знаю|ne znayu|хз)$/iu;

export function isGiveUp(raw: string): boolean {
  return GIVE_UP.test(normalize(raw));
}

export function isBlank(raw: string): boolean {
  return normalize(raw).length === 0;
}

/** Vowels of every alphabet the app reads, for `skeleton`. */
const VOWELS = /[aeiouyąęóàâäåãæeéèêëíìîïаоуеыиэюяєїіёąęůõöøœáăĕŏŭ]/giu;

/**
 * A word with its vowels removed.
 *
 * This exists for one decision only: whether an answer that shares no stem with
 * the expected one is *wrong*, or merely *unrecognised*.
 *
 * Slavic case endings and English irregular verbs both change vowels and leave
 * consonants alone — `las`/`lesie`, `ran`/`runned`. So do genuinely different
 * words: `дім`/`дим`, `cat`/`cot`. The skeleton cannot tell those two situations
 * apart, and that is exactly the point: when the skeletons are close, the local
 * matcher must admit it does not know instead of calling a child wrong.
 */
export function skeleton(word: string): string {
  return fold(word).toLocaleLowerCase().replace(VOWELS, "");
}
