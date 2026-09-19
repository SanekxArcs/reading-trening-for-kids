import type { AnswerVerdict, ChildLevel } from "@/engine";
import { buildGradingPrompt, type GradeRequestItem } from "../core/prompts/grading.ts";
import type { LlmProvider, StructuredRequest } from "../core/provider.ts";
import { GRADING_SCHEMA } from "../core/schemas.ts";

/**
 * The answers the local matcher could not settle, judged in one call.
 *
 * One call for the whole session, not one per answer. The UX cost is real and
 * is paid deliberately: the answers the local tier resolved get their tick
 * immediately, the unclear ones show a neutral "we'll check that later", and
 * the batch runs during the short "checking your answers" screen between the
 * last question and the results.
 */

export interface AiVerdict {
  id: string;
  verdict: AnswerVerdict;
  confidence: number;
  /** One warm sentence for the child, in the text's language. */
  feedback: string;
  /** One sentence for the parent. */
  reasoning: string;
}

export interface GradeOutcome {
  verdicts: Map<string, AiVerdict>;
  promptTokens: number;
  outputTokens: number;
}

const VERDICTS = new Set(["correct", "partial", "incorrect"]);

/**
 * Validates leniently, and drops rather than throws.
 *
 * A malformed row for one answer must not cost the other six their verdicts —
 * anything unusable simply stays `unsure`, which is a state the UI already
 * handles properly.
 */
function validate(raw: unknown): Map<string, AiVerdict> {
  if (typeof raw !== "object" || raw === null) throw new Error("response is not an object");
  const list = (raw as { results?: unknown }).results;
  if (!Array.isArray(list)) throw new Error("results: expected an array");

  const out = new Map<string, AiVerdict>();
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;

    const id = typeof entry["id"] === "string" ? entry["id"] : null;
    const verdict = entry["verdict"];
    if (!id || typeof verdict !== "string" || !VERDICTS.has(verdict)) continue;

    out.set(id, {
      id,
      verdict: verdict as AnswerVerdict,
      confidence: typeof entry["confidence"] === "number" ? entry["confidence"] : 0.5,
      feedback: typeof entry["feedback"] === "string" ? entry["feedback"] : "",
      reasoning: typeof entry["reasoning"] === "string" ? entry["reasoning"] : "",
    });
  }

  if (out.size === 0) throw new Error("no usable verdicts");
  return out;
}

export async function gradeAnswers(
  provider: LlmProvider,
  modelId: string,
  items: readonly GradeRequestItem[],
  level: ChildLevel,
  signal?: AbortSignal,
): Promise<GradeOutcome> {
  if (items.length === 0) {
    return { verdicts: new Map(), promptTokens: 0, outputTokens: 0 };
  }

  const prompt = buildGradingPrompt(items, level);

  const request: StructuredRequest<Map<string, AiVerdict>> = {
    modelId,
    system: prompt.system,
    text: prompt.user,
    schema: GRADING_SCHEMA,
    validate,
    // Judging is not a creative task, and two runs disagreeing about the same
    // child's answer would be worse than either verdict.
    temperature: 0,
    maxOutputTokens: Math.min(4096, 120 * items.length + 128),
    // Nothing here benefits from deliberation; the budget would be spent on
    // re-reading a one-word answer.
    thinking: "off",
    label: "grading",
  };

  const result = await provider.complete(request, signal);
  return {
    verdicts: result.value,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
  };
}

export type { GradeRequestItem };
