import { randInt, type Rng } from "./rng.ts";
import { isStopword } from "./stopwords.ts";
import { stem } from "./stem.ts";
import { words } from "./textStats.ts";
import type { ChildLevel, Question, Sentence, TextLang } from "./types.ts";

/**
 * Questions with no model, no key and no network.
 *
 * This is what makes the app a working product on the evening a parent has not
 * set up a key yet, on a train with no signal, and on the day the free quota
 * runs out. It is honestly worse than what Gemini produces — it can only test
 * recall of what was actually on the page, never inference — and the UI labels
 * it as practice rather than pretending otherwise.
 *
 * Deterministic given a seeded `Rng`, like everything else in this folder, so
 * the same text and seed always produce the same set.
 */

/** Below this, a sentence has nothing to hide that would not give itself away. */
const MIN_SENTENCE_WORDS = 5;

/** A word has to be at least this long to be worth blanking out. */
const MIN_WORD_LENGTH = 4;

interface Candidate {
  sentence: Sentence;
  word: string;
  /** Index of the word within the sentence, for the blank. */
  position: number;
  score: number;
}

/**
 * How much a word is worth asking about.
 *
 * Longer is better (a long word carries more meaning than a short one), and
 * rarer within this text is much better: a word that appears once is the thing
 * the sentence was about, while a word repeated five times is the character's
 * name and the child would get it right without having read anything.
 */
function scoreWord(word: string, occurrences: number): number {
  return word.length + (occurrences === 1 ? 6 : occurrences === 2 ? 2 : 0);
}

function collectCandidates(sentences: readonly Sentence[], lang: TextLang): Candidate[] {
  const frequency = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of words(sentence.text)) {
      const key = stem(word.toLocaleLowerCase(), lang);
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }

  const out: Candidate[] = [];
  for (const sentence of sentences) {
    const sentenceWords = words(sentence.text);
    if (sentenceWords.length < MIN_SENTENCE_WORDS) continue;

    for (const [position, word] of sentenceWords.entries()) {
      if (word.length < MIN_WORD_LENGTH) continue;
      if (isStopword(word, lang)) continue;
      if (/^\p{N}+$/u.test(word)) continue;
      // Never blank the first word: the capital letter and the sentence shape
      // give it away, and it is usually the subject anyway.
      if (position === 0) continue;

      const occurrences = frequency.get(stem(word.toLocaleLowerCase(), lang)) ?? 1;
      out.push({ sentence, word, position, score: scoreWord(word, occurrences) });
    }
  }
  return out;
}

/** Replaces the chosen word with a blank, leaving the punctuation around it. */
function blankOut(sentenceText: string, word: string, position: number): string {
  let seen = -1;
  return sentenceText.replace(/[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu, (match) => {
    seen++;
    return seen === position && match === word ? "…………" : match;
  });
}

export interface FallbackOptions {
  lang: TextLang;
  level: ChildLevel;
  count: number;
  rng: Rng;
}

/**
 * Builds `count` cloze questions spread across the text.
 *
 * "Spread" is done by bucketing: the sentences are divided into as many bands
 * as there are questions and the best candidate is taken from each. Taking the
 * globally best `count` candidates instead would cluster every question in
 * whichever paragraph happened to use the longest words.
 */
export function generateFallbackQuestions(
  sentences: readonly Sentence[],
  options: FallbackOptions,
): Question[] {
  const { lang, count, rng } = options;
  if (count <= 0 || sentences.length === 0) return [];

  const candidates = collectCandidates(sentences, lang);
  if (candidates.length === 0) return [];

  const bands = Math.min(count, sentences.length);
  const bandSize = sentences.length / bands;
  const questions: Question[] = [];
  const usedSentences = new Set<number>();

  for (let band = 0; band < bands; band++) {
    const from = Math.floor(band * bandSize);
    const to = Math.floor((band + 1) * bandSize);

    const inBand = candidates.filter(
      (candidate) =>
        candidate.sentence.index >= from &&
        candidate.sentence.index < to &&
        !usedSentences.has(candidate.sentence.index),
    );
    if (inBand.length === 0) continue;

    // Among the best few, pick at random: a fixed "always the longest word"
    // rule makes a re-read of the same text identical, and re-reading is a
    // thing this app actively encourages.
    const best = inBand.toSorted((a, b) => b.score - a.score).slice(0, 3);
    const chosen = best[randInt(rng, 0, best.length - 1)] as Candidate;
    usedSentences.add(chosen.sentence.index);

    const answer = chosen.word.toLocaleLowerCase();
    questions.push({
      id: `local-${chosen.sentence.index}-${chosen.position}`,
      type: "literal",
      // Rare words are harder to recall than common ones, and `score` already
      // encodes rarity, so it doubles as the tier.
      tier: chosen.score >= 12 ? "medium" : "easy",
      sentenceIndex: chosen.sentence.index,
      prompt: blankOut(chosen.sentence.text, chosen.word, chosen.position),
      canonicalAnswer: answer,
      acceptableAnswers: [answer, stem(answer, lang)].filter(
        (value, index, all) => all.indexOf(value) === index,
      ),
      gradingMode: "exact-ish",
      rationale: `The word was taken out of sentence ${chosen.sentence.index + 1}.`,
    });
  }

  return questions;
}
