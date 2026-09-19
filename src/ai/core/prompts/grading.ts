import type { ChildLevel } from "@/engine";
import { JSON_DISCIPLINE, LANGUAGE_LOCK, type Prompt } from "./shared.ts";

/**
 * One item to judge.
 *
 * `sentence` is the cited sentence alone, never the whole text. For a 400-word
 * passage with three escalations that is roughly 200 input tokens instead of
 * 600 — and, more usefully, it stops the model second-guessing the question
 * author by reading around the answer.
 */
export interface GradeRequestItem {
  id: string;
  question: string;
  canonicalAnswer: string;
  acceptableAnswers: string[];
  sentence: string;
  childAnswer: string;
}

const LEVEL_NOTE: Record<ChildLevel, string> = {
  beginner: "6-7 years old, still learning to read, types very slowly",
  developing: "8-9 years old",
  fluent: "10-11 years old",
  advanced: "12 or older",
};

/**
 * The second opinion, for the answers the local matcher could not settle.
 *
 * The framing in the first line does real work: telling the model it is the
 * second opinion, and that the obvious cases were already accepted, stops it
 * re-litigating answers nobody asked about and keeps it focused on the genuinely
 * unclear ones.
 */
export function buildGradingPrompt(items: readonly GradeRequestItem[], level: ChildLevel): Prompt {
  const system = `You grade a young child's short typed answers to reading questions.
You are the second opinion: an automatic matcher already accepted the obvious
answers and sent you only the unclear ones.
${LANGUAGE_LOCK}
The child is ${LEVEL_NOTE[level]}. The child is a beginner typist.

BE LENIENT ABOUT FORM, STRICT ABOUT MEANING.
Ignore entirely: spelling mistakes, missing or wrong diacritics, capitalisation,
doubled or missing letters, adjacent-key typos, wrong grammatical case, wrong
number, wrong gender, missing articles, missing punctuation, and filler like
"I think" or "it was".
Mark correct if the child clearly means the right thing, however badly phrased.
Mark correct if the child gives ONE correct content word out of a two-word
expected answer, when that word alone identifies the right thing.

MARK INCORRECT when the answer names a different thing from the text, or is a
guess unrelated to the cited sentence.

USE "partial" ONLY when the answer is half of a two-part answer, or names the
right category but not the right thing.

For each item give a verdict, a confidence from 0 to 1, and one sentence of
feedback addressed to the child — warm, never sarcastic, in the text's language.
Never mention spelling in the feedback unless the answer was wrong BECAUSE a
misspelling turned it into a different word.
${JSON_DISCIPLINE}`;

  const user = `Grade these ${items.length} answers:

${JSON.stringify(items, null, 1)}`;

  return { system, user };
}
