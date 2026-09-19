import type { ChildLevel, Question, QuestionType, Sentence, TextLang } from "@/engine";
import { AiError, asAiError, type AiErrorCode } from "./core/errors.ts";
import { GeminiProvider } from "./gemini/provider.ts";
import { generateQuestions } from "./pipeline/generateQuestions.ts";
import { gradeAnswers, type AiVerdict, type GradeRequestItem } from "./pipeline/gradeAnswers.ts";
import { runOcr, type OcrOutcome, type OcrResult } from "./pipeline/ocr.ts";
import { generateStory, type StoryOutcome } from "./pipeline/generateStory.ts";
import type { StoryPromptInput } from "./core/prompts/story.ts";
import {
  compareReadAloud,
  type ReadAloudInput,
  type ReadAloudOutcome,
} from "./pipeline/readAloud.ts";
import { checkAudio } from "./core/mediaLimits.ts";
import type { MediaPart } from "./core/provider.ts";
import { checkBudget, record } from "./runtime/ledger.ts";
import { readApiKey, readModelId } from "./runtime/key.ts";
import { getQueue } from "./runtime/queue.ts";
import { noteObservedLimit } from "./runtime/quota.ts";

/**
 * The single door between the app and a model.
 *
 * Nothing above this file constructs a provider or calls a pipeline directly.
 * Everything that reaches the network goes through here, so the queue, the
 * budget gate and the ledger cannot be bypassed by a new caller forgetting
 * about them — which is exactly how a free-tier key gets drained.
 */

export interface AiContext {
  provider: GeminiProvider;
  modelId: string;
}

/** The context, or null when there is nothing configured to call. */
export function aiContext(): AiContext | null {
  const apiKey = readApiKey();
  const modelId = readModelId();
  if (!apiKey || !modelId) return null;
  return { provider: new GeminiProvider({ apiKey }), modelId };
}

export function isAiConfigured(): boolean {
  return aiContext() !== null;
}

/**
 * Gate, queue, call, record — in that order.
 *
 * The gate runs first because a cap checked after the fact is a cap that lets
 * the request through. The ledger records failures too: a parent debugging "it
 * keeps saying try again" needs to see the four rate-limited attempts, not a
 * silent gap.
 */
async function run<T>(
  label: Parameters<typeof record>[0]["label"],
  task: () => Promise<{ value: T; promptTokens: number; outputTokens: number; repaired?: boolean }>,
  priority: "interactive" | "background" = "interactive",
): Promise<T> {
  const gate = await checkBudget();
  if (!gate.allowed) throw new AiError("local_cap", "the daily request cap was reached");
  const queue = getQueue();
  if (queue.isBlocked()) {
    throw new AiError("daily_quota", "the daily quota is exhausted");
  }

  try {
    const outcome = await queue.add(task, priority);
    await record({
      label,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
      ...(outcome.repaired ? { repaired: true } : {}),
    });
    return outcome.value;
  } catch (error) {
    const aiError = asAiError(error);

    /**
     * A refusal is the one moment the API states what this key is allowed.
     *
     * Google no longer publishes per-model limits, so the number in a
     * `QuotaFailure` is the only authoritative one there is. Kept against the
     * model that earned it, and from then on the usage meter stops guessing.
     */
    const modelId = readModelId();
    if (aiError.quota && modelId) noteObservedLimit(modelId, aiError.quota);
    // A request that never left — blocked by a gate — is not spend, so it is
    // not recorded. Anything that reached the wire is.
    if (aiError.code !== "local_cap" && aiError.code !== "daily_quota") {
      await record({
        label,
        promptTokens: 0,
        outputTokens: 0,
        failed: true,
        ...(aiError.code === "rate_limited" ? { rateLimited: true } : {}),
      });
    }
    throw aiError;
  }
}

export interface QuestionRequest {
  sentences: readonly Sentence[];
  lang: TextLang;
  level: ChildLevel;
  count: number;
  emphasise?: readonly QuestionType[];
}

export interface QuestionResult {
  questions: Question[];
  producedBy: string;
}

export async function requestQuestions(
  context: AiContext,
  input: QuestionRequest,
  signal?: AbortSignal,
): Promise<QuestionResult> {
  const questions = await run("questions", async () => {
    const outcome = await generateQuestions(
      context.provider,
      {
        sentences: input.sentences,
        lang: input.lang,
        level: input.level,
        count: input.count,
        modelId: context.modelId,
        ...(input.emphasise ? { emphasise: input.emphasise } : {}),
      },
      signal,
    );
    return {
      value: outcome.questions,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
      repaired: outcome.repaired,
    };
  });

  return { questions, producedBy: `gemini:${context.modelId}` };
}

export async function requestGrading(
  context: AiContext,
  items: readonly GradeRequestItem[],
  level: ChildLevel,
  signal?: AbortSignal,
): Promise<Map<string, AiVerdict>> {
  if (items.length === 0) return new Map();

  return run("grading", async () => {
    const outcome = await gradeAnswers(context.provider, context.modelId, items, level, signal);
    return {
      value: outcome.verdicts,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
    };
  });
}

/**
 * Transcribes photographed pages.
 *
 * Chunking is the caller's job: this is one call, and the limits it refuses to
 * exceed live in `core/mediaLimits.ts`.
 */
export async function requestOcr(
  context: AiContext,
  pages: readonly MediaPart[],
  signal?: AbortSignal,
): Promise<OcrResult> {
  return run("ocr", async () => {
    const outcome: OcrOutcome = await runOcr(context.provider, context.modelId, pages, signal);
    return {
      value: outcome as OcrResult,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
    };
  });
}

/**
 * Writes an original story to read.
 *
 * The parent's escape hatch when there is no book to hand — and, because the
 * story is original, the one input that cannot trip the recitation filter.
 */
export async function requestStory(
  context: AiContext,
  input: StoryPromptInput,
  signal?: AbortSignal,
): Promise<StoryOutcome> {
  return run("story", async () => {
    const outcome = await generateStory(context.provider, context.modelId, input, signal);
    return {
      value: outcome,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
    };
  });
}

/**
 * Transcribes a child reading aloud, and compares it locally.
 *
 * The length is checked before anything is sent: audio is billed by duration,
 * so a recorder left running is the one mistake in this app that can cost real
 * money in a single request.
 */
export async function requestReadAloud(
  context: AiContext,
  input: ReadAloudInput,
  signal?: AbortSignal,
): Promise<ReadAloudOutcome> {
  const audio = checkAudio(input.durationMs);
  if (!audio.ok) {
    throw new AiError(
      audio.reason === "too_long" ? "payload_too_large" : "empty_response",
      audio.reason,
    );
  }

  return run("readaloud", async () => {
    const outcome = await compareReadAloud(context.provider, context.modelId, input, signal);
    return {
      value: outcome,
      promptTokens: outcome.promptTokens,
      outputTokens: outcome.outputTokens,
    };
  });
}

export type {
  AiErrorCode,
  AiVerdict,
  GradeRequestItem,
  MediaPart,
  OcrResult,
  ReadAloudInput,
  ReadAloudOutcome,
  StoryOutcome,
  StoryPromptInput,
};
