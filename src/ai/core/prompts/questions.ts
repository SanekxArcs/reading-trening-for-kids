import type { ChildLevel, QuestionType, Sentence } from "@/engine";
import { JSON_DISCIPLINE, LANGUAGE_LOCK, levelBlock, sourceBlock, type Prompt } from "./shared.ts";

export interface QuestionPromptInput {
  sentences: readonly Sentence[];
  level: ChildLevel;
  count: number;
  /** Skills the child is weakest on, from mastery. Optional. */
  emphasise?: readonly QuestionType[];
}

/**
 * The prompt that produces a question set.
 *
 * Two rules in here are worth defending because they look like fussiness and
 * are not:
 *
 * **"Never a proper noun that appears once."** Otherwise the model asks "What
 * was the fox's name?" about a name printed a single time, and the app becomes
 * a spelling test with extra steps. A name the child has seen twice is fair.
 *
 * **The `acceptableAnswers` rules.** This is where fair grading is actually
 * decided. A question asked in one grammatical case invites an answer in
 * another, and a list containing only the dictionary form means the local
 * matcher has to guess — or escalate, which costs a request. Asking the model
 * for the form the child would *naturally type* is far cheaper than any amount
 * of cleverness downstream.
 */
export function buildQuestionPrompt(input: QuestionPromptInput): Prompt {
  const emphasis =
    input.emphasise && input.emphasise.length > 0
      ? `\nThis child is weakest at: ${input.emphasise.join(", ")}. Include more of those types than usual, but only where the text genuinely supports them.`
      : "";

  const system = `You write reading-comprehension questions for a child, about a text the
child has just read. The child will type short answers from memory, with the
text hidden.
${LANGUAGE_LOCK}
${levelBlock(input.level)}${emphasis}

QUESTION TYPES, in order of preference for this level:
  literal     — a fact stated plainly in one sentence
  sequence    — what happened before/after/first/last
  vocabulary  — what a word from the text means IN THIS TEXT
  inference   — something true but not stated, provable from one or two sentences
  main_idea   — what the text, or a named part of it, is mostly about

DIFFICULTY TIERS — aim for roughly 50% easy, 35% medium, 15% hard.
  easy   : the answer is a single word appearing verbatim in the cited sentence
  medium : the answer is 1-3 words, paraphrased or combined from the cited sentence
  hard   : the answer requires linking the cited sentence to another one

COVERAGE
Spread the questions across the WHOLE text. Walk the sentence numbers roughly in
order. Never ask two questions about the same sentence unless the text has fewer
than three sentences.

ANSWER RULES — these decide whether a real child is graded fairly:
- canonicalAnswer: the shortest correct answer, lowercase, no final punctuation.
- acceptableAnswers: 3 to 6 entries, all lowercase and free of punctuation.
  Include (a) the canonical form, (b) the grammatical case and number a child
  would naturally type in answer to YOUR question, (c) the base or dictionary
  form, (d) a plausible shorter form or synonym a child might use.
  Each entry is at most 4 words. Never a full sentence. Never a restatement of
  the question.
- requiredKeywords: only for inference and main_idea. Groups of words; an answer
  counts if it contains at least one word from EVERY group. Use base forms.
- gradingMode: "exact-ish" when the set of right answers is closed and short
  (literal, sequence, vocabulary). "semantic" when a child could phrase it many
  ways (inference, main_idea).
- sentenceIndex: the index in [brackets] of the sentence that proves the answer.
  For a hard question, the primary one. This is checked; a wrong index means the
  question is discarded.
- rationale: one short sentence, for the parent, in the text's language.

FORBIDDEN
- Questions about the number of paragraphs, letters, or anything typographic.
- Yes/no questions.
- "Why do you think..." opinion questions that have no right answer.
- Questions whose answer is a proper noun the child would have to spell from
  memory, unless that name appears at least twice in the text.
${JSON_DISCIPLINE}`;

  const user = `Produce exactly ${input.count} questions.

${sourceBlock(input.sentences)}`;

  return { system, user };
}

/**
 * The one repair attempt.
 *
 * Temperature zero, thinking off, and it is given the exact failure rather than
 * asked to try again — "sentenceIndex 14 out of range" is actionable in a way
 * that "that was invalid" is not.
 */
export function buildRepairPrompt(raw: string, problem: string): Prompt {
  return {
    system: `You fix malformed JSON. You are given a response that failed validation and
the reason it failed. Return the corrected JSON and nothing else.
Do not invent new content: keep every field that was already valid, and drop
only what cannot be repaired.
${JSON_DISCIPLINE}`,
    user: `VALIDATION ERROR: ${problem}

RESPONSE TO FIX:
${raw}`,
  };
}
