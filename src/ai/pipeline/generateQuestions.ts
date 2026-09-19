import type { ChildLevel, Question, QuestionType, Sentence, TextLang } from "@/engine";
import { AiError } from "../core/errors.ts";
import { buildQuestionPrompt, buildRepairPrompt } from "../core/prompts/questions.ts";
import type { LlmProvider, StructuredRequest } from "../core/provider.ts";
import { QUESTION_SET_SCHEMA } from "../core/schemas.ts";
import { needsRepair, validateQuestionSet, type ValidatedSet } from "../core/validate.ts";

/**
 * One call per text, for every question.
 *
 * Never per-sentence and never paginated: the "spread across the whole text,
 * never two questions on one sentence" constraint needs the whole text in
 * context anyway, so splitting it would cost more calls *and* produce a worse
 * set.
 */

export interface GenerateInput {
  sentences: readonly Sentence[];
  lang: TextLang;
  level: ChildLevel;
  count: number;
  modelId: string;
  /** Skills the child is weakest on, from mastery. */
  emphasise?: readonly QuestionType[];
}

export interface GenerateOutcome {
  questions: Question[];
  modelId: string;
  /** Questions the model produced that did not survive validation. */
  dropped: ValidatedSet["dropped"];
  /** True when the response needed the one repair call. */
  repaired: boolean;
  promptTokens: number;
  outputTokens: number;
}

/**
 * Sized per call, and the main defence against truncation.
 *
 * A question with its answers, keywords and rationale runs to roughly 180
 * tokens; the constant covers the wrapper. Asking for far more than needed is
 * not free — on a thinking model the budget competes with the answer.
 */
export function outputBudget(count: number): number {
  return Math.min(8192, 256 + 180 * count);
}

export async function generateQuestions(
  provider: LlmProvider,
  input: GenerateInput,
  signal?: AbortSignal,
): Promise<GenerateOutcome> {
  const prompt = buildQuestionPrompt({
    sentences: input.sentences,
    level: input.level,
    count: input.count,
    ...(input.emphasise ? { emphasise: input.emphasise } : {}),
  });

  /**
   * Validation runs inside the request, so a set that fails it reaches the
   * repair path with the reason attached rather than as a generic "bad JSON".
   */
  const validate = (raw: unknown): ValidatedSet => {
    const set = validateQuestionSet(raw, input.sentences, input.lang);
    if (needsRepair(set)) {
      const why = set.dropped[0]?.reason ?? "no usable questions";
      throw new Error(`most questions were unusable: ${why}`);
    }
    return set;
  };

  const request: StructuredRequest<ValidatedSet> = {
    modelId: input.modelId,
    system: prompt.system,
    text: prompt.user,
    schema: QUESTION_SET_SCHEMA,
    validate,
    // Some variation is wanted: a re-read of the same text at a different level
    // should not be the same questions with different wording.
    temperature: 0.4,
    maxOutputTokens: outputBudget(input.count),
    // The one call where thinking earns its tokens — inference and main-idea
    // questions are noticeably better for it. OCR and grading get none.
    thinking: "low",
    label: "questions",
  };

  try {
    const result = await provider.complete(request, signal);
    return {
      questions: result.value.questions,
      modelId: result.modelId,
      dropped: result.value.dropped,
      repaired: result.repaired,
      promptTokens: result.usage.promptTokens,
      outputTokens: result.usage.outputTokens,
    };
  } catch (error) {
    if (!(error instanceof AiError) || error.code !== "bad_json") throw error;

    /**
     * One repair attempt, and exactly one.
     *
     * Temperature zero, no thinking, given the specific validation failure. A
     * second repair has never been worth its request: if the model could not
     * follow the schema when told precisely what was wrong, a third try will
     * not help, and the offline generator is waiting.
     */
    const repair = buildRepairPrompt(error.detail, error.detail);
    const repaired = await provider.complete(
      {
        ...request,
        system: repair.system,
        text: repair.user,
        temperature: 0,
        thinking: "off",
        label: "repair",
      },
      signal,
    );

    return {
      questions: repaired.value.questions,
      modelId: repaired.modelId,
      dropped: repaired.value.dropped,
      repaired: true,
      promptTokens: repaired.usage.promptTokens,
      outputTokens: repaired.usage.outputTokens,
    };
  }
}
