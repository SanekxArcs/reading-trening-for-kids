import {
  compareReading,
  readAloudStats,
  stumbledWords,
  type AlignedWord,
  type ReadAloudStats,
  type Sentence,
} from "@/engine";
import { AiError } from "../core/errors.ts";
import { buildReadAloudPrompt } from "../core/prompts/readAloud.ts";
import type { LlmProvider, MediaPart, StructuredRequest } from "../core/provider.ts";
import { READ_ALOUD_SCHEMA } from "../core/schemas.ts";

export interface Transcript {
  language: string;
  audible: boolean;
  transcript: string;
  confidence: number;
}

export interface ReadAloudOutcome {
  transcript: string;
  audible: boolean;
  aligned: AlignedWord[];
  stats: ReadAloudStats;
  /** Words to bring back in a later warm-up. */
  stumbled: string[];
  promptTokens: number;
  outputTokens: number;
}

/**
 * Markers the model was asked to insert, stripped before alignment.
 *
 * They are useful to a parent reading the transcript and meaningless to a word
 * aligner, which would otherwise count every `<unclear>` as a word the child
 * inserted.
 */
function cleanTranscript(raw: string): string {
  return raw
    .replace(/<pause>|<unclear>/gi, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function validate(raw: unknown): Transcript {
  if (typeof raw !== "object" || raw === null) throw new Error("response is not an object");
  const root = raw as Record<string, unknown>;

  const transcript = typeof root["transcript"] === "string" ? root["transcript"].trim() : "";
  // `audible === false` with text is contradictory; trust the flag, since it is
  // the one the prompt makes load-bearing.
  const audible = root["audible"] !== false && transcript.length > 0;

  return {
    language: typeof root["language"] === "string" ? root["language"] : "",
    audible,
    transcript: audible ? transcript : "",
    confidence: typeof root["confidence"] === "number" ? root["confidence"] : 0,
  };
}

export interface ReadAloudInput {
  sentences: readonly Sentence[];
  /** The printed text, as the child saw it. */
  original: string;
  audio: MediaPart;
  /** From the local recorder's clock, never from the model. */
  durationMs: number;
}

/**
 * Transcribes a recording, then compares it locally.
 *
 * One call, and the comparison costs nothing — which is why this feature is
 * affordable at all. A five-minute recording is already the heaviest request
 * the app makes: audio bills at 32 tokens a second, so five minutes is about
 * 9,600 input tokens, more than a week of question sets.
 */
export async function compareReadAloud(
  provider: LlmProvider,
  modelId: string,
  input: ReadAloudInput,
  signal?: AbortSignal,
): Promise<ReadAloudOutcome> {
  const prompt = buildReadAloudPrompt(input.sentences);

  const request: StructuredRequest<Transcript> = {
    modelId,
    system: prompt.system,
    text: prompt.user,
    media: [input.audio],
    schema: READ_ALOUD_SCHEMA,
    validate,
    temperature: 0,
    // Roughly the length of the text, plus room for repeats and markers.
    maxOutputTokens: Math.min(8192, 512 + Math.ceil(input.original.length / 3)),
    thinking: "off",
    label: "readaloud",
  };

  const result = await provider.complete(request, signal);

  if (!result.value.audible) {
    /**
     * Silence is a failure, not a score of zero.
     *
     * A muted microphone and a child who read nothing are indistinguishable
     * from the audio, and reporting 0% accuracy for the first would be telling
     * a parent something false about their child.
     */
    throw new AiError("empty_response", "nothing audible in the recording");
  }

  const aligned = compareReading(input.original, cleanTranscript(result.value.transcript));

  return {
    transcript: result.value.transcript,
    audible: true,
    aligned,
    stats: readAloudStats(aligned, input.durationMs),
    stumbled: stumbledWords(aligned),
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
  };
}
