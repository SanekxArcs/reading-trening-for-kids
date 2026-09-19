import { normalize, type Question } from "@/engine";

/**
 * What a grown-up is allowed to do to a generated question set.
 *
 * Pure, and separate from the screen, because these are the rules that decide
 * what a child is finally asked: which answers count, what an added question
 * looks like, and when a set is fit to play. A screen is the wrong place to
 * keep any of that, and an impossible place to test it.
 */

/** How a list of accepted answers is shown in, and read back from, one field. */
export const ANSWER_SEPARATOR = ", ";

/**
 * Answers as the parent typed them.
 *
 * Commas and newlines both separate, because both are what people actually do
 * in a single-line field. Trailing punctuation goes: a child never types the
 * full stop, and an accepted answer that ends in one would only ever match by
 * accident.
 */
export function parseAnswers(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const piece of raw.split(/[,\n;]/u)) {
    const answer = piece
      .trim()
      .replace(/[.!?…]+$/u, "")
      .trim();
    if (answer.length === 0) continue;
    const key = normalize(answer);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(answer);
  }
  return out;
}

export function formatAnswers(answers: readonly string[]): string {
  return answers.join(ANSWER_SEPARATOR);
}

export interface QuestionPatch {
  prompt?: string;
  /** Already parsed; the first one becomes the answer the child is shown. */
  answers?: string[];
  sentenceIndex?: number;
}

/**
 * One edited question, the rest untouched.
 *
 * The first accepted answer becomes the canonical one, because that is the
 * string the result screen shows as "the answer" — so the order a parent types
 * them in is meaningful, and the field is theirs to reorder.
 */
export function editQuestion(
  questions: readonly Question[],
  id: string,
  patch: QuestionPatch,
): Question[] {
  return questions.map((question) => {
    if (question.id !== id) return question;

    const answers = patch.answers ?? question.acceptableAnswers;
    return {
      ...question,
      ...(patch.prompt === undefined ? {} : { prompt: patch.prompt }),
      ...(patch.sentenceIndex === undefined ? {} : { sentenceIndex: patch.sentenceIndex }),
      canonicalAnswer: answers[0] ?? question.canonicalAnswer,
      acceptableAnswers: answers,
    };
  });
}

export function removeQuestion(questions: readonly Question[], id: string): Question[] {
  return questions.filter((question) => question.id !== id);
}

/** Ids of parent-written questions, so an added one never collides with a model one. */
const ADDED_PREFIX = "own-";

/**
 * A question the parent writes themselves.
 *
 * Graded `exact-ish`: a parent who lists the answers has drawn the line around
 * them deliberately, and that is exactly the case where the local matcher is
 * allowed to say no without asking anybody.
 */
export function blankQuestion(questions: readonly Question[], sentenceIndex: number): Question {
  const taken = questions
    .map((question) => Number.parseInt(question.id.slice(ADDED_PREFIX.length), 10))
    .filter((value) => Number.isInteger(value));

  return {
    id: `${ADDED_PREFIX}${Math.max(0, ...taken) + 1}`,
    type: "literal",
    tier: "easy",
    sentenceIndex,
    prompt: "",
    canonicalAnswer: "",
    acceptableAnswers: [],
    gradingMode: "exact-ish",
    rationale: "",
  };
}

export function isOwnQuestion(question: Question): boolean {
  return question.id.startsWith(ADDED_PREFIX);
}

/** A question with no prompt or no answer cannot be asked. */
export function isUsable(question: Question): boolean {
  return question.prompt.trim().length > 0 && question.acceptableAnswers.length > 0;
}

/**
 * Whether this set can be handed to a child.
 *
 * Every question has to be answerable, and there has to be at least one:
 * approving an empty set would leave a round with nothing in it, which reads to
 * a child as the app being broken.
 */
export function readyToApprove(questions: readonly Question[]): boolean {
  return questions.length > 0 && questions.every(isUsable);
}
