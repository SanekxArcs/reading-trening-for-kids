import { countWords, splitSentences, type TextLang } from "@/engine";
import { buildStoryPrompt, STORY_SENTENCES, type StoryPromptInput } from "../core/prompts/story.ts";
import type { LlmProvider, StructuredRequest } from "../core/provider.ts";
import { STORY_SCHEMA } from "../core/schemas.ts";

export interface Story {
  language: string;
  title: string;
  text: string;
}

export interface StoryOutcome extends Story {
  /** What the app made of it — shown before the parent keeps it. */
  sentenceCount: number;
  wordCount: number;
  promptTokens: number;
  outputTokens: number;
}

/**
 * Enough room for the story, and not much more.
 *
 * A sentence at this reading level runs to roughly 25 tokens; the multiple
 * leaves headroom for a long one without inviting the model to keep writing
 * past the length it was asked for.
 */
export function storyBudget(sentences: number): number {
  return Math.min(4096, 256 + sentences * 45);
}

function makeValidator(lang: TextLang, wanted: number) {
  return (raw: unknown): Story => {
    if (typeof raw !== "object" || raw === null) throw new Error("response is not an object");
    const root = raw as Record<string, unknown>;

    const text = typeof root["text"] === "string" ? root["text"].trim() : "";
    if (text.length === 0) throw new Error("text: the story is empty");

    /**
     * A story far shorter than asked for is a failed generation, not a short
     * story: with three sentences there is nothing to spread questions across.
     * Longer is fine and is not rejected — a child does not mind.
     */
    const sentences = splitSentences(text, lang).length;
    if (sentences < Math.max(3, Math.floor(wanted / 2))) {
      throw new Error(`text: only ${sentences} sentences, wanted about ${wanted}`);
    }

    const title = typeof root["title"] === "string" ? root["title"].trim() : "";

    return {
      language: typeof root["language"] === "string" ? root["language"] : lang,
      // A missing title is not worth a repair call; the library derives one
      // from the opening words exactly as it does for a pasted text.
      title,
      text,
    };
  };
}

export async function generateStory(
  provider: LlmProvider,
  modelId: string,
  input: StoryPromptInput,
  signal?: AbortSignal,
): Promise<StoryOutcome> {
  const wanted = STORY_SENTENCES[input.length];
  const prompt = buildStoryPrompt(input);

  const request: StructuredRequest<Story> = {
    modelId,
    system: prompt.system,
    text: prompt.user,
    schema: STORY_SCHEMA,
    validate: makeValidator(input.lang, wanted),
    // The one call in the app that wants variety: asking twice for a story
    // about a fox should not produce the same fox.
    temperature: 0.9,
    maxOutputTokens: storyBudget(wanted),
    // Structure is what makes a story usable here — events in order, something
    // to infer — and that is worth a little deliberation.
    thinking: "low",
    label: "story",
  };

  const result = await provider.complete(request, signal);
  return {
    ...result.value,
    sentenceCount: splitSentences(result.value.text, input.lang).length,
    wordCount: countWords(result.value.text),
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
  };
}
