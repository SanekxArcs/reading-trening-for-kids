import type { JsonSchema } from "./provider.ts";

/**
 * The shape a question set must come back in.
 *
 * `propertyOrdering` is the part that does real work. Providers generate fields
 * in the order given, so `rationale` and `sentenceIndex` come before `prompt`
 * and the answers: the model states which sentence proves the answer *before*
 * it writes the question, rather than attaching a citation afterwards to
 * whatever it already wrote.
 */
export const QUESTION_SET_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    language: {
      type: "STRING",
      description: "BCP-47 tag of the source text, e.g. uk, pl, en",
    },
    questions: {
      type: "ARRAY",
      minItems: 1,
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["literal", "sequence", "vocabulary", "inference", "main_idea"],
          },
          tier: { type: "STRING", enum: ["easy", "medium", "hard"] },
          sentenceIndex: {
            type: "INTEGER",
            description: "Index in [brackets] of the sentence that proves the answer",
          },
          rationale: {
            type: "STRING",
            description: "One short sentence for the parent, in the text's language",
          },
          prompt: { type: "STRING" },
          canonicalAnswer: {
            type: "STRING",
            description: "Shortest correct answer, lowercase, no final punctuation",
          },
          acceptableAnswers: {
            type: "ARRAY",
            items: { type: "STRING" },
            minItems: 1,
            maxItems: 8,
          },
          requiredKeywords: {
            type: "ARRAY",
            description: "Only for inference and main_idea: groups, one word from each required",
            items: { type: "ARRAY", items: { type: "STRING" } },
          },
          gradingMode: { type: "STRING", enum: ["exact-ish", "semantic"] },
        },
        required: [
          "type",
          "tier",
          "sentenceIndex",
          "rationale",
          "prompt",
          "canonicalAnswer",
          "acceptableAnswers",
          "gradingMode",
        ],
        propertyOrdering: [
          "type",
          "tier",
          "sentenceIndex",
          "rationale",
          "prompt",
          "canonicalAnswer",
          "acceptableAnswers",
          "requiredKeywords",
          "gradingMode",
        ],
      },
    },
  },
  required: ["language", "questions"],
  propertyOrdering: ["language", "questions"],
};

/**
 * Batch grading.
 *
 * `reasoning` comes before `verdict` in the ordering, for the same reason the
 * question schema puts the citation first: the model states its case before it
 * commits to an answer, rather than justifying one it already gave.
 */
export const GRADING_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      minItems: 1,
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          reasoning: { type: "STRING", description: "One short sentence, for the parent" },
          verdict: { type: "STRING", enum: ["correct", "partial", "incorrect"] },
          confidence: { type: "NUMBER" },
          feedback: {
            type: "STRING",
            description: "One warm sentence for the child, in the text's language",
          },
        },
        required: ["id", "reasoning", "verdict", "confidence", "feedback"],
        propertyOrdering: ["id", "reasoning", "verdict", "confidence", "feedback"],
      },
    },
  },
  required: ["results"],
  propertyOrdering: ["results"],
};

/**
 * An original story.
 *
 * The title is a separate field rather than a first line, so the reading screen
 * can show it as a heading and the sentence splitter never sees it — a title
 * has no full stop, and as a sentence it would be one a question could cite.
 */
export const STORY_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING", description: "BCP-47 tag of the language written in" },
    title: { type: "STRING" },
    text: { type: "STRING", description: "The story itself, without the title" },
  },
  required: ["language", "title", "text"],
  propertyOrdering: ["language", "title", "text"],
};

/**
 * Page transcription.
 *
 * `pages` as well as `mergedText` because a grown-up fixing a bad page needs to
 * see where it starts, and `unreadableCount` so the editor can say "three words
 * could not be read" rather than leaving them to notice the [...] themselves.
 */
export const OCR_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING", description: "BCP-47 tag of the printed text" },
    pages: {
      type: "ARRAY",
      minItems: 1,
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          text: { type: "STRING" },
        },
        required: ["index", "text"],
        propertyOrdering: ["index", "text"],
      },
    },
    mergedText: { type: "STRING", description: "Every page joined in reading order" },
    unreadableCount: { type: "INTEGER" },
    notes: { type: "STRING", description: "For the parent: blurred or cut-off pages" },
  },
  required: ["language", "pages", "mergedText", "unreadableCount"],
  propertyOrdering: ["language", "pages", "mergedText", "unreadableCount", "notes"],
};

/**
 * A transcript of a child reading aloud.
 *
 * `audible` is load-bearing rather than informational: it is how the app
 * distinguishes "the child read badly" from "the microphone was muted", and
 * the two must never produce the same reading-accuracy figure.
 */
export const READ_ALOUD_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING" },
    audible: { type: "BOOLEAN", description: "False when the recording is silent or unusable" },
    transcript: { type: "STRING", description: "Verbatim, including mistakes" },
    confidence: { type: "NUMBER" },
  },
  required: ["language", "audible", "transcript", "confidence"],
  propertyOrdering: ["language", "audible", "transcript", "confidence"],
};
