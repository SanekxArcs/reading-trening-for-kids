/**
 * The vocabulary of the reading trainer.
 *
 * Everything here is data, never behaviour, and nothing in this folder may
 * import React, the DOM, the network or storage. That rule is what makes the
 * whole engine testable in a node environment, and it is enforced by
 * `purity.test.ts`.
 */

/**
 * How good a reader the child is. This is the single knob that steers question
 * difficulty, expected answer length and how long an answer is allowed to take
 * before it stops counting as fluent.
 *
 * Deliberately named for reading ability rather than for age: a seven-year-old
 * who reads well and a ten-year-old who is still decoding need different texts,
 * not different birthdays.
 */
export type ChildLevel = "beginner" | "developing" | "fluent" | "advanced";

export const CHILD_LEVELS: readonly ChildLevel[] = ["beginner", "developing", "fluent", "advanced"];

/**
 * What a question is asking the child to do. These are the skills the progress
 * screen reports on, and the dimensions mastery is tracked along — so a parent
 * can see "good at facts, weak at drawing conclusions" rather than one number.
 */
export type QuestionType =
  /** A fact stated plainly in one sentence. */
  | "literal"
  /** What happened before/after/first/last. */
  | "sequence"
  /** What a word from the text means in this text. */
  | "vocabulary"
  /** True but not stated; provable from one or two sentences. */
  | "inference"
  /** What the text, or a named part of it, is mostly about. */
  | "main_idea";

export const QUESTION_TYPES: readonly QuestionType[] = [
  "literal",
  "sequence",
  "vocabulary",
  "inference",
  "main_idea",
];

/** How hard one question is, independent of how good the reader is. */
export type QuestionTier = "easy" | "medium" | "hard";

/**
 * How an answer may be judged.
 *
 * `exact-ish` means the set of right answers is closed and short, so the local
 * fuzzy matcher can decide on its own — including deciding "no". `semantic`
 * means a child could phrase it many ways, so a local "no" is never trusted.
 */
export type GradingMode = "exact-ish" | "semantic";

/** How the child reads the text. */
export type ReadingMode =
  /** Reads silently, presses a button when done. Speed is self-reported timing. */
  | "silent"
  /** Reads aloud into the microphone; speed and word accuracy are measured. */
  | "aloud";

/** How the child gives an answer. */
export type AnswerMode = "type" | "voice";

/** Where a text came from, kept so the library can show it and OCR can be redone. */
export type TextSource = "paste" | "ocr" | "sample";

/**
 * One question about one text.
 *
 * `sentenceIndex` is the load-bearing field: it points at the sentence that
 * proves the answer, which turns "the model says this is in the text" into a
 * claim the app can check locally before ever showing the question to a child.
 */
export interface Question {
  id: string;
  type: QuestionType;
  tier: QuestionTier;
  /** Index into the text's sentence array. Always in range; validated on import. */
  sentenceIndex: number;
  prompt: string;
  /** Shortest correct answer: lowercase, no trailing punctuation. */
  canonicalAnswer: string;
  /** Forms that count as correct, including the case a child would naturally type. */
  acceptableAnswers: string[];
  /** AND of ORs, for open-ended types. An answer must hit one word from every group. */
  requiredKeywords?: string[][];
  gradingMode: GradingMode;
  /** One sentence for the parent explaining why the answer is right. */
  rationale: string;
}

/** Everything the child needs to answer, plus where it came from. */
export interface QuestionSet {
  id: string;
  textId: string;
  /** Identifies the cache entry; see ai/core/cacheKey.ts. */
  cacheKey: string;
  level: ChildLevel;
  questions: Question[];
  /** "gemini:<model>" or "local" when generated without the API. */
  producedBy: string;
  createdAt: number;
}

/** Settings a parent chooses. Mirrors math's GameSettings in spirit. */
export interface ReadingSettings {
  level: ChildLevel;
  readingMode: ReadingMode;
  answerMode: AnswerMode;
  /** Bias question selection towards the skills the child is weakest on. */
  adaptive: boolean;
  /** Warm-up screen with a few hard words explained before the timer starts. */
  warmupEnabled: boolean;
  /** Parent reviews generated questions before the child sees them. */
  reviewQuestions: boolean;
  /** Upper bound on questions per text; the real count also scales with length. */
  maxQuestions: number;
  goalEnabled: boolean;
  goalTarget: number;
  soundEnabled: boolean;
  /** Reader comfort. Stored here so the child's choice survives a reload. */
  fontScale: number;
  lineHeight: number;
  dyslexicFont: boolean;
}

export const DEFAULT_SETTINGS: ReadingSettings = {
  level: "developing",
  readingMode: "silent",
  answerMode: "type",
  adaptive: true,
  warmupEnabled: true,
  // On by default until the question prompt has earned trust. A model that asks
  // about something the text never says is worse than no question at all.
  reviewQuestions: true,
  maxQuestions: 10,
  goalEnabled: true,
  goalTarget: 100,
  soundEnabled: true,
  fontScale: 1.25,
  lineHeight: 1.8,
  dyslexicFont: false,
};
