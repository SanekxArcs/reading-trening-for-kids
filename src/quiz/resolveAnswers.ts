import {
  planEscalation,
  type AnswerVerdict,
  type ChildLevel,
  type Sentence,
  type TextLang,
} from "@/engine";
import { asAiError, type AiErrorCode } from "@/ai/core/errors";
import { aiContext, requestGrading, type GradeRequestItem } from "@/ai/service";
import type { RecordedAnswer } from "./useQuiz.ts";

/**
 * Settling the answers the local matcher could not.
 *
 * One call for the whole session, and only for what is genuinely unclear. With
 * no key, no quota or no signal this does nothing at all and the unclear
 * answers stay `unsure` — which is a real state the results screen shows as "a
 * grown-up will check this", not a silent zero.
 */

export interface ResolvedAnswer extends RecordedAnswer {
  verdict: AnswerVerdict;
  judgedBy: string;
  /** One warm sentence from the model, when there is one. */
  feedback?: string;
}

export interface ResolveOutcome {
  answers: ResolvedAnswer[];
  /** How many went to the model. Zero is the common case. */
  escalated: number;
  failure: AiErrorCode | null;
}

export async function resolveAnswers(
  answers: readonly RecordedAnswer[],
  sentences: readonly Sentence[],
  lang: TextLang,
  level: ChildLevel,
  signal?: AbortSignal,
): Promise<ResolveOutcome> {
  const context = aiContext();

  const plan = planEscalation(
    answers.map((answer, index) => ({
      id: String(index),
      question: answer.question,
      answer: answer.given,
    })),
    lang,
    context !== null,
  );

  const settle = (
    failure: AiErrorCode | null,
    verdicts?: Map<string, { verdict: AnswerVerdict; feedback: string }>,
  ): ResolveOutcome => ({
    answers: answers.map((answer, index): ResolvedAnswer => {
      const id = String(index);
      const fromModel = verdicts?.get(id);
      if (fromModel) {
        return {
          ...answer,
          verdict: fromModel.verdict,
          judgedBy: "ai",
          ...(fromModel.feedback ? { feedback: fromModel.feedback } : {}),
        };
      }
      const local = plan.resolved.get(id);
      return {
        ...answer,
        verdict: local?.verdict ?? answer.verdict,
        judgedBy: `local:${local?.reason ?? answer.local.reason}`,
      };
    }),
    escalated: plan.escalate.length,
    failure,
  });

  if (!context || plan.escalate.length === 0) return settle(null);

  /**
   * Only the cited sentence travels, never the whole text.
   *
   * Fewer tokens, and — the part that matters more — the model stops reading
   * around the answer and second-guessing the question it was given.
   */
  const items: GradeRequestItem[] = plan.escalate.map((id) => {
    const answer = answers[Number(id)] as RecordedAnswer;
    return {
      id,
      question: answer.question.prompt,
      canonicalAnswer: answer.question.canonicalAnswer,
      acceptableAnswers: answer.question.acceptableAnswers,
      sentence: sentences[answer.question.sentenceIndex]?.text ?? "",
      childAnswer: answer.given,
    };
  });

  try {
    const verdicts = await requestGrading(context, items, level, signal);
    return settle(null, verdicts);
  } catch (error) {
    // Nothing is marked wrong because the model could not be reached. The
    // unclear answers stay unclear, and a grown-up gets the last word.
    return settle(asAiError(error).code);
  }
}
