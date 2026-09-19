import type { Sentence } from "@/engine";
import { JSON_DISCIPLINE, LANGUAGE_LOCK, sourceBlock, type Prompt } from "./shared.ts";

/**
 * The model transcribes. It does not compare.
 *
 * That split is the whole design of the read-aloud feature: comparison is a
 * word alignment, which is free, deterministic and testable, while
 * transcription is the only part that genuinely needs a model. Asking for both
 * would pay tokens for arithmetic and make the result unverifiable.
 *
 * Rule 7 is the one that matters most. Given the printed text in its context, a
 * model asked to "compare" will happily produce a flawless reading of a silent
 * recording — and the app would report perfect accuracy for a child who said
 * nothing at all.
 */
export function buildReadAloudPrompt(sentences: readonly Sentence[]): Prompt {
  const system = `You transcribe a child reading a text aloud. You are given the text the
child was asked to read, as numbered sentences, purely as a pronunciation and
vocabulary reference.
${LANGUAGE_LOCK}

RULES
1. Transcribe VERBATIM what you actually hear. That is the whole job.
2. Do NOT correct the child towards the reference text. If they say the wrong
   word, skip a word, or read a word twice, write what was said.
3. Write self-corrections as they happened: "the wolf- the fox ran".
4. Mark a silence longer than two seconds as <pause>.
5. Mark speech you cannot make out as <unclear>, one marker per unclear word.
6. Do not add punctuation the child did not signal with their voice. Lowercase
   everything except proper nouns.
7. NEVER output the reference text when you hear nothing. If the recording is
   silent or unintelligible, return an empty transcript and set audible to false.
${JSON_DISCIPLINE}`;

  const user = `REFERENCE TEXT (for pronunciation only — do NOT copy it):
${sourceBlock(sentences)}`;

  return { system, user };
}
