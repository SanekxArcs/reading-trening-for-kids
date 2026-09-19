import { modelGeneration } from "../core/modelLimits.ts";
import type { ModelInfo } from "../core/provider.ts";
import type { GeminiModel } from "./wire.ts";

/**
 * Which of a key's models this app can actually use.
 *
 * Nothing about the catalogue is hardcoded, and that is a deliberate response
 * to how fast it moves: model names change, families are added and retired, and
 * Google no longer publishes per-model rate limits at all. An app that names a
 * model in its source is an app that breaks on a rename.
 */

/** Models that exist but cannot do what this app needs. */
const EXCLUDE = /embedding|aqa|imagen|veo|-tts|native-audio|-live|gemma/i;

/**
 * Preference, as patterns rather than names.
 *
 * Cheapest first: this app's whole cost model assumes a small fast model, and
 * comprehension questions about a children's story do not need a frontier one.
 * A parent who wants better questions can pick a bigger model from the list.
 */
const PREFERENCE: readonly RegExp[] = [/flash-lite/i, /flash/i, /pro/i];

function rank(id: string): number {
  const index = PREFERENCE.findIndex((pattern) => pattern.test(id));
  return index === -1 ? PREFERENCE.length : index;
}

/**
 * Newer families first within the same rank, so `gemini-3-flash` outranks
 * `gemini-2.5-flash` without either being named. Shared with the rate-limit
 * table, which bands models by the same number.
 */
const version = modelGeneration;

export function selectUsableModels(raw: readonly GeminiModel[]): ModelInfo[] {
  return raw
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent") ?? false)
    .filter((model) => !EXCLUDE.test(model.name))
    .map((model): ModelInfo => {
      const id = model.name.replace(/^models\//, "");
      return {
        id,
        displayName: model.displayName ?? id,
        inputTokenLimit: model.inputTokenLimit ?? 32_768,
        outputTokenLimit: model.outputTokenLimit ?? 8_192,
        // The field when the API provides it; otherwise assume the families
        // that have had thinking since 2.5 do, and let the probe correct us.
        // 2.5 is 205 on this scale, not 250 — the old threshold here quietly
        // excluded the whole 2.5 family from thinking.
        supportsThinking: model.thinking ?? version(id) >= 205,
      };
    })
    .toSorted((a, b) => {
      const byRank = rank(a.id) - rank(b.id);
      if (byRank !== 0) return byRank;
      const byVersion = version(b.id) - version(a.id);
      if (byVersion !== 0) return byVersion;
      return a.id.localeCompare(b.id);
    });
}

/** The model to use when the parent has not chosen one. */
export function defaultModel(models: readonly ModelInfo[]): ModelInfo | null {
  return models[0] ?? null;
}

/**
 * The parent's choice, if it still exists, otherwise the default.
 *
 * A model that has been retired since they chose it must not leave the app
 * calling a 404 forever.
 */
export function resolveModel(
  models: readonly ModelInfo[],
  chosenId: string | null,
): ModelInfo | null {
  if (chosenId) {
    const chosen = models.find((model) => model.id === chosenId);
    if (chosen) return chosen;
  }
  return defaultModel(models);
}
