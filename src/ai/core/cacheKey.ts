import { textHash, type ChildLevel } from "@/engine";
import { PROMPT_VERSION } from "./prompts/shared.ts";

/**
 * What identifies a cached question set.
 *
 * Everything that would change the questions goes in. `promptVersion` is the
 * one that is easy to forget and expensive to forget: without it, editing a
 * prompt leaves every existing cache entry serving questions from the old one,
 * forever, with no way to tell. There is a test that fails if a prompt changes
 * without the version moving.
 *
 * `modelId` is in the key because question quality genuinely differs between
 * models — but the lookup falls back to *any* set for the same text and level
 * when the API is unavailable, so a parent out of quota gets last week's
 * questions rather than nothing.
 */
export interface QuestionSetKeyInput {
  text: string;
  level: ChildLevel;
  modelId: string;
  count: number;
}

export function questionSetKey(input: QuestionSetKeyInput): string {
  // `textHash` already normalises whitespace and case, so a re-paste of the
  // same page with different line wrapping hits the same entry.
  return [
    textHash(input.text),
    input.level,
    input.modelId,
    PROMPT_VERSION,
    String(input.count),
  ].join(":");
}

/** The offline generator's namespace, kept distinct from any model's. */
export function localSetKey(input: Omit<QuestionSetKeyInput, "modelId">): string {
  return questionSetKey({ ...input, modelId: "local" });
}
