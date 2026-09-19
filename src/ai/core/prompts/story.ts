import type { ChildLevel, TextLang } from "@/engine";
import { JSON_DISCIPLINE, type Prompt } from "./shared.ts";

/**
 * Writing a story to read, when there is nothing to hand.
 *
 * This is the one place the app asks a model to *invent* rather than transcribe
 * or judge, and it has a pleasant side effect: an original story cannot trip
 * the recitation filter, which is exactly what a photographed page of a
 * published book does.
 *
 * The length is given in sentences rather than words because everything
 * downstream counts sentences — the question count, the citation index, the
 * spread across the text.
 */

export type StoryLength = "short" | "medium" | "long";

/** Sentences, not words: see above. */
export const STORY_SENTENCES: Record<StoryLength, number> = {
  short: 8,
  medium: 16,
  long: 28,
};

/**
 * What the vocabulary may look like at each level.
 *
 * Stated as concrete constraints because "for a seven-year-old" is interpreted
 * very differently from one model to the next, while "almost every word should
 * be one or two syllables" is not interpretable at all.
 */
const VOCABULARY: Record<ChildLevel, string> = {
  beginner:
    "Almost every word one or two syllables. Short sentences, five to nine words. Present the events in the order they happen. No subordinate clauses.",
  developing:
    "Mostly everyday words. Sentences of eight to fourteen words. At most one subordinate clause per sentence.",
  fluent:
    "Ordinary vocabulary with a few richer words a child can work out from context. Sentences of up to eighteen words.",
  advanced:
    "Varied vocabulary, including some figurative language. Longer sentences are fine, and the events need not be told in order.",
};

const LANGUAGE_NAMES: Record<TextLang, string> = {
  uk: "Ukrainian",
  pl: "Polish",
  en: "English",
};

export interface StoryPromptInput {
  lang: TextLang;
  level: ChildLevel;
  length: StoryLength;
  /** What the parent or child asked for. Optional and free-form. */
  topic?: string;
  /** Words the child got wrong before, to work back in naturally. */
  revisit?: readonly string[];
}

export function buildStoryPrompt(input: StoryPromptInput): Prompt {
  const sentences = STORY_SENTENCES[input.length];

  const topic = input.topic?.trim()
    ? `\nThe story should be about: ${input.topic.trim()}`
    : "\nChoose the subject yourself. Something ordinary and concrete — an animal, a family, a day at school, a small adventure.";

  const revisit =
    input.revisit && input.revisit.length > 0
      ? `\nWork these words in naturally, because the child has stumbled on them before: ${input.revisit.join(", ")}. Do not draw attention to them.`
      : "";

  const system = `You write short original stories for a child to read and then answer
questions about.

Write in ${LANGUAGE_NAMES[input.lang]}, and in nothing else.

LENGTH: about ${sentences} sentences. Not fewer than ${Math.max(3, sentences - 3)}.

VOCABULARY AND SENTENCES: ${VOCABULARY[input.level]}

WHAT MAKES A STORY USABLE HERE — this matters more than style:
- Concrete events, in a clear order. Someone does something, something happens,
  it is resolved. A mood piece with nothing happening gives nothing to ask about.
- Specific details: what colour, how many, who was carrying what. These are what
  a fair literal question is made of.
- Name at most two characters, and use each name at least three times. A name
  that appears once is a spelling test, not a comprehension question.
- **Do not state the moral or the lesson.** Show what happened and let it speak.
  A story that ends "and so she learned that friends help each other" has
  nothing left to infer, and inference is half of what is being taught.
- No questions to the reader, no "dear reader", no title inside the text.

CONTENT: suitable for a young child. Mild peril is fine — being lost, a
thunderstorm, a scraped knee — and it should end safely. No violence, no death,
nothing frightening at bedtime.
${topic}${revisit}
${JSON_DISCIPLINE}`;

  return {
    system,
    user: `Write the story now. Return the title separately from the text, and do not repeat the title inside the text.`,
  };
}
