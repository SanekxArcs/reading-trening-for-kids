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
 * Sized per call, generously.
 *
 * A question with its answers, keywords and rationale runs to something over
 * two hundred tokens and the constant covers the wrapper — but the number that
 * matters is the one added on top of this in `withThinkingRoom`, because
 * `maxOutputTokens` also has to cover thinking. A ceiling is not a spend:
 * nothing is billed for room the model does not use, while a ceiling that is
 * too low truncates the JSON and costs the whole call.
 */
export function outputBudget(count: number): number {
  return Math.min(8192, 512 + 220 * count);
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
   * Validation runs inside the request, but only structural failure throws.
   *
   * A set where most questions were dropped is still a set: five good
   * questions are a perfectly good round, and throwing them away to ask for a
   * replacement — which might come back worse — used to turn a usable answer
   * into "could not be read". Whether to spend the repair call is decided
   * below, with the survivors still in hand.
   */
  const validate = (raw: unknown): ValidatedSet =>
    validateQuestionSet(raw, input.sentences, input.lang);

  let failure: AiError | null = null;

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

  let first: GenerateOutcome | null = null;

  try {
    const result = await provider.complete(request, signal);
    first = {
      questions: result.value.questions,
      modelId: result.modelId,
      dropped: result.value.dropped,
      repaired: result.repaired,
      promptTokens: result.usage.promptTokens,
      outputTokens: result.usage.outputTokens,
    };

    // Good enough to play: hand it over without spending another request.
    if (!needsRepair(result.value)) return first;
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
    failure = error;
  }

  {
    const detail = failure?.detail ?? first?.dropped[0]?.reason ?? "most questions were unusable";
    const repair = buildRepairPrompt(detail, detail);
    try {
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

      // A repair that produced nothing is not an improvement on nothing: the
      // caller has an offline generator waiting and needs to be told to use it.
      const better =
        repaired.value.questions.length > 0 &&
        (first === null || repaired.value.questions.length >= first.questions.length);
      if (better) {
        return {
          questions: repaired.value.questions,
          modelId: repaired.modelId,
          dropped: repaired.value.dropped,
          repaired: true,
          promptTokens: repaired.usage.promptTokens,
          outputTokens: repaired.usage.outputTokens,
        };
      }
    } catch (error) {
      /**
       * The repair failed too, and that is survivable.
       *
       * What is not survivable is throwing away questions that were already
       * good. A round of four is a round; "could not be read" is nothing.
       */
      if (first === null || first.questions.length === 0) throw error;
    }

    if (first === null || first.questions.length === 0) {
      throw failure ?? new AiError("bad_json", "no usable questions");
    }
    return { ...first, repaired: true };
  }
}
