import { numbered, type ChildLevel, type Sentence } from "@/engine";

/**
 * Blocks every prompt shares.
 *
 * Two of these carry almost all the weight, and both fail silently if dropped:
 * lose the language lock and a Polish text comes back with English questions;
 * lose the level block and a seven-year-old is asked about narrative structure.
 * Neither shows up in a type error, so there is a snapshot test asserting both
 * appear in every prompt the app builds.
 */

/** Bumped on any prompt change. Part of the cache key; see `cacheKey.ts`. */
export const PROMPT_VERSION = "p1";

export const JSON_DISCIPLINE = `
Return ONLY a JSON object matching the provided schema.
No markdown, no code fences, no commentary before or after the JSON.`;

export const LANGUAGE_LOCK = `
LANGUAGE RULE — absolute:
Every string you output (questions, answers, rationales) must be in the SAME
language as the SOURCE TEXT. Never translate. Never mix languages.
If the source text is Polish, write Polish. If Ukrainian, write Ukrainian.
The only exception is the "language" field, which is a BCP-47 tag.`;

/**
 * What the child can actually do, in the model's terms.
 *
 * Written as concrete constraints rather than an age, because "for a
 * seven-year-old" is interpreted very differently from one model to the next,
 * while "answerable with one word copied almost directly from the text" is not
 * interpretable at all.
 */
const LEVEL_DESCRIPTION: Record<ChildLevel, string> = {
  beginner:
    "6-7 years old, reads word by word, types slowly with two fingers. Questions must be answerable with ONE word that appears almost directly in the text. Use only the 'literal' and 'vocabulary' types. Never ask about anything that is merely implied.",
  developing:
    "8-9 years old. Answers of one to three words. Mostly 'literal' and 'sequence'; at most one easy 'inference'.",
  fluent:
    "10-11 years old. Answers up to four words. The full mix of types, including 'inference' and 'main_idea'.",
  advanced:
    "12+ years old. Answers up to six words. Favour 'inference' and 'main_idea'; a 'literal' question should require combining two sentences.",
};

export function levelBlock(level: ChildLevel): string {
  return `
TARGET READER: ${LEVEL_DESCRIPTION[level]}
Vocabulary in your questions must never be harder than the vocabulary in the source text.`;
}

/**
 * The text, as numbered sentences.
 *
 * Numbered locally, by the app's own splitter. That is what turns "the model
 * says this answer is in the text" into a claim `validate.ts` can check — and
 * it is why the split has to be deterministic.
 */
export function sourceBlock(sentences: readonly Sentence[]): string {
  return `SOURCE TEXT (${sentences.length} numbered sentences):
${numbered(sentences)}`;
}

export interface Prompt {
  system: string;
  user: string;
}
