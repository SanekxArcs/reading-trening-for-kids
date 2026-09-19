import type { GradingMode, TextLang } from "./types.ts";

/**
 * What real children type, and what the app must make of it.
 *
 * This table is the highest-value asset in the project. Leniency is not a
 * property you can eyeball — every threshold in `grade.ts` trades false
 * "wrong" against wasted API calls, and the only way to know which way a change
 * moved that trade is to run it against cases that actually happened.
 *
 * **The rule: every time a real misgrading is found, a row goes in here.**
 * When the parent review screen gets its override button, every press should
 * end up as a line in this file.
 */

export type Want =
  /** The local cascade must accept it, with no API call. */
  | "correct"
  /** The local cascade must reject it, with no API call. */
  | "incorrect"
  /** Too ambiguous to decide locally; a model has to look. */
  | "escalate";

export interface GradingCase {
  lang: TextLang;
  accepted: string[];
  typed: string;
  want: Want;
  mode?: GradingMode;
  keywords?: string[][];
  /** Why this case exists, for whoever breaks it later. */
  note: string;
}

export const GRADING_CASES: readonly GradingCase[] = [
  // ─── Exact and near-exact ────────────────────────────────────────────────
  { lang: "uk", accepted: ["лисиця"], typed: "лисиця", want: "correct", note: "exact" },
  { lang: "uk", accepted: ["лисиця"], typed: "Лисиця", want: "correct", note: "capital letter" },
  { lang: "uk", accepted: ["лисиця"], typed: " лисиця ", want: "correct", note: "stray spaces" },
  {
    lang: "uk",
    accepted: ["лисиця"],
    typed: "лисиця.",
    want: "correct",
    note: "trailing full stop",
  },
  { lang: "en", accepted: ["the fox"], typed: "The Fox", want: "correct", note: "title case" },

  // ─── Grammatical case: the single commonest "wrong" right answer ─────────
  { lang: "uk", accepted: ["лисиця"], typed: "лисицю", want: "correct", note: "accusative" },
  { lang: "uk", accepted: ["лисиця"], typed: "лисиці", want: "correct", note: "genitive" },
  { lang: "uk", accepted: ["ліс"], typed: "лісі", want: "correct", note: "locative" },
  { lang: "uk", accepted: ["мама"], typed: "мамі", want: "correct", note: "dative" },
  {
    lang: "pl",
    accepted: ["las"],
    typed: "lesie",
    want: "escalate",
    note: "locative with a vowel shift: shares no stem with the dictionary form, so only a model can confirm it. In practice the generated acceptableAnswers include the form the question invites",
  },
  {
    lang: "pl",
    accepted: ["las", "lesie", "w lesie"],
    typed: "lesie",
    want: "correct",
    note: "the same answer once the question lists the case a child would actually type",
  },
  { lang: "pl", accepted: ["żółw"], typed: "żółwiem", want: "correct", note: "instrumental" },

  // ─── Diacritics a plain keyboard cannot produce ──────────────────────────
  { lang: "pl", accepted: ["żółw"], typed: "zolw", want: "correct", note: "no Polish keyboard" },
  { lang: "pl", accepted: ["źrebię"], typed: "zrebie", want: "correct", note: "no diacritics" },
  { lang: "uk", accepted: ["їжак"], typed: "ижак", want: "correct", note: "ї typed as и" },

  // ─── Typing mistakes ─────────────────────────────────────────────────────
  { lang: "uk", accepted: ["лисиця"], typed: "лисеця", want: "correct", note: "vowel typo" },
  { lang: "uk", accepted: ["лисиця"], typed: "лиисця", want: "correct", note: "transposition" },
  { lang: "uk", accepted: ["ведмідь"], typed: "ведмиідь", want: "correct", note: "doubled key" },
  { lang: "en", accepted: ["forest"], typed: "forrest", want: "correct", note: "doubled letter" },
  { lang: "en", accepted: ["mother"], typed: "mothr", want: "correct", note: "dropped letter" },

  // ─── Child grammar ───────────────────────────────────────────────────────
  {
    lang: "en",
    accepted: ["ran"],
    typed: "runned",
    want: "escalate",
    note: "over-regularised irregular verb; consonants line up but nothing else does, so the matcher must not judge it",
  },
  {
    lang: "en",
    accepted: ["stories"],
    typed: "story",
    want: "correct",
    note: "plural vs singular",
  },
  {
    lang: "uk",
    accepted: ["яблука"],
    typed: "яблуко",
    want: "correct",
    note: "plural vs singular",
  },

  // ─── The child said more than was asked ──────────────────────────────────
  {
    lang: "en",
    accepted: ["the fox"],
    typed: "a big grey fox",
    want: "correct",
    note: "extra adjectives around the right noun",
  },
  {
    lang: "uk",
    accepted: ["до лісу"],
    typed: "вона побігла до лісу",
    want: "correct",
    note: "full sentence containing the answer",
  },
  {
    lang: "pl",
    accepted: ["czerwony kapturek"],
    typed: "kapturek",
    want: "escalate",
    note: "half of a two-word name; partial, which the local tier may not decide",
  },

  // ─── Plainly wrong ───────────────────────────────────────────────────────
  {
    lang: "pl",
    accepted: ["las"],
    typed: "dom",
    want: "incorrect",
    note: "different word entirely",
  },
  { lang: "en", accepted: ["fox"], typed: "dog", want: "incorrect", note: "different animal" },
  { lang: "uk", accepted: ["лисиця"], typed: "", want: "incorrect", note: "nothing typed" },
  {
    lang: "uk",
    accepted: ["лисиця"],
    typed: "не знаю",
    want: "incorrect",
    note: "said so plainly",
  },
  { lang: "en", accepted: ["fox"], typed: "idk", want: "incorrect", note: "said so plainly" },
  { lang: "uk", accepted: ["лисиця"], typed: "???", want: "incorrect", note: "punctuation only" },

  /**
   * Short words get no fuzzy tolerance, so neither of these is ever marked
   * *correct*. Nor are they marked wrong: `дім`/`дим` is indistinguishable from
   * a case alternation by any measure short of a dictionary, and calling a
   * right child wrong is the one failure this matcher may not have. So they
   * escalate — and the questions that produce them are rare.
   */
  {
    lang: "uk",
    accepted: ["дім"],
    typed: "дим",
    want: "escalate",
    note: "3 letters, differs by one vowel: could be a different word, could be a case form",
  },
  {
    lang: "en",
    accepted: ["cat"],
    typed: "cot",
    want: "escalate",
    note: "3 letters, differs by one vowel",
  },
  {
    lang: "uk",
    accepted: ["ліс"],
    typed: "дім",
    want: "incorrect",
    note: "different consonants entirely — this is what a local no is for",
  },

  // ─── Open-ended: only a model, or the keyword groups, can judge ──────────
  {
    lang: "en",
    accepted: ["bravery"],
    typed: "he was brave",
    want: "correct",
    mode: "semantic",
    keywords: [["brave", "bravery", "courage"]],
    note: "keyword group catches a differently-phrased right answer for free",
  },
  {
    lang: "uk",
    accepted: ["про дружбу"],
    typed: "що треба допомагати друзям",
    want: "escalate",
    mode: "semantic",
    note: "right idea, no shared word — exactly what the model is for",
  },
  {
    lang: "uk",
    accepted: ["бо злякався"],
    typed: "він боявся",
    want: "escalate",
    mode: "semantic",
    note: "same meaning, different root",
  },
  {
    lang: "en",
    accepted: ["because he was late"],
    typed: "the moon is made of cheese",
    want: "escalate",
    mode: "semantic",
    note: "plainly wrong, but semantic questions never get a local no",
  },
];
