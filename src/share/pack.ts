import {
  countWords,
  splitSentences,
  textHash,
  TEXT_LANGS,
  CHILD_LEVELS,
  type ChildLevel,
  type Question,
  type ReadingSettings,
  type StoredText,
  type TextLang,
} from "@/engine";
import { validateQuestionSet } from "@/ai/core/validate";

/**
 * A reading pack: one text, its questions, and the settings the test was set
 * up with — everything needed to give two children in two houses the same
 * test on the same evening.
 *
 * There is no server to put this on, so the pack *is* the transport: a small
 * JSON object that travels as a file or inside a link. That constraint turns
 * out to be a feature. Nothing is uploaded, nothing is account-bound, and a
 * pack works in a classroom with no wifi as long as somebody has the file.
 *
 * What is deliberately **not** in it: the API key, the parent PIN, the child's
 * name, their stats, their answers, their reading speeds. A pack is a lesson,
 * not a profile — it is going to be forwarded to people the sender has not
 * thought about, and everything in it should survive that.
 *
 * The questions travel *with* the text rather than being regenerated on the
 * other side, and that is the whole point: two children answering different
 * questions about the same story have not taken the same test. It also means
 * importing costs no API calls at all — a family with no key can still be
 * handed a full round by one that has one.
 */

/** Bumped when the shape changes in a way an older app cannot read. */
export const PACK_VERSION = 1;

/** Recognises one of ours before anything tries to read it. */
export const PACK_KIND = "chytayko.pack";

export interface PackText {
  title: string;
  body: string;
  lang: TextLang;
}

/**
 * The parts of the setup that belong to the *test*, not to the child.
 *
 * Reading level and question count decide what is being asked; the reader's
 * comfort settings (font size, spacing, sound) belong to whoever is reading
 * and are left alone.
 */
export interface PackSettings {
  level: ChildLevel;
  maxQuestions: number;
  readingMode: ReadingSettings["readingMode"];
  answerMode: ReadingSettings["answerMode"];
}

export interface Pack {
  kind: typeof PACK_KIND;
  v: number;
  text: PackText;
  questions: Question[];
  settings: PackSettings;
  /** Where it came from, for the receiving parent to recognise. */
  producedBy: string;
  createdAt: number;
}

export function buildPack(input: {
  text: StoredText;
  questions: readonly Question[];
  settings: ReadingSettings;
  producedBy: string;
  now?: number;
}): Pack {
  return {
    kind: PACK_KIND,
    v: PACK_VERSION,
    text: { title: input.text.title, body: input.text.body, lang: input.text.lang },
    questions: [...input.questions],
    settings: {
      level: input.settings.level,
      maxQuestions: input.settings.maxQuestions,
      readingMode: input.settings.readingMode,
      answerMode: input.settings.answerMode,
    },
    producedBy: input.producedBy,
    createdAt: input.now ?? Date.now(),
  };
}

export interface PackSummary {
  title: string;
  lang: TextLang;
  wordCount: number;
  sentenceCount: number;
  questionCount: number;
  /** Questions that did not survive the check against this text. */
  droppedCount: number;
  level: ChildLevel;
}

export interface ReadPack {
  pack: Pack;
  summary: PackSummary;
  /** The content hash, so an import can recognise a text already in the library. */
  hash: string;
}

export type PackProblem = "not-a-pack" | "too-new" | "empty-text" | "no-questions" | "bad-language";

export class PackError extends Error {
  readonly problem: PackProblem;

  constructor(problem: PackProblem) {
    super(problem);
    this.name = "PackError";
    this.problem = problem;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLang(value: unknown): value is TextLang {
  return typeof value === "string" && (TEXT_LANGS as readonly string[]).includes(value);
}

function isLevel(value: unknown): value is ChildLevel {
  return typeof value === "string" && (CHILD_LEVELS as readonly string[]).includes(value);
}

/**
 * Turns whatever arrived into a pack, or refuses it.
 *
 * The questions are re-validated against the text in the pack rather than
 * trusted: every question cites the sentence that proves it, and this side
 * splits that text into sentences itself. A pack that has been edited, or
 * truncated in a chat app, or built by an older version of the app, produces
 * questions that no longer line up — and those are dropped here rather than
 * asked of a child.
 */
export function readPack(raw: unknown): ReadPack {
  if (typeof raw !== "object" || raw === null) throw new PackError("not-a-pack");
  const input = raw as Record<string, unknown>;

  if (input["kind"] !== PACK_KIND) throw new PackError("not-a-pack");
  const version = typeof input["v"] === "number" ? input["v"] : 0;
  if (version > PACK_VERSION) throw new PackError("too-new");

  const textInput = (input["text"] ?? {}) as Record<string, unknown>;
  const body = asString(textInput["body"]);
  if (body.length === 0) throw new PackError("empty-text");
  if (!isLang(textInput["lang"])) throw new PackError("bad-language");

  const lang = textInput["lang"];
  const sentences = splitSentences(body, lang);
  const settingsInput = (input["settings"] ?? {}) as Record<string, unknown>;
  const level = isLevel(settingsInput["level"]) ? settingsInput["level"] : "developing";

  // The same validator the model's output goes through, for the same reason:
  // a question whose citation does not survive the crossing is a question
  // about something this text does not say.
  const checked = validateQuestionSet(
    { language: lang, questions: input["questions"] ?? [] },
    sentences,
    lang,
  );
  if (checked.questions.length === 0) throw new PackError("no-questions");

  const pack: Pack = {
    kind: PACK_KIND,
    v: version,
    text: { title: asString(textInput["title"]) || "…", body, lang },
    questions: checked.questions,
    settings: {
      level,
      maxQuestions:
        typeof settingsInput["maxQuestions"] === "number" ? settingsInput["maxQuestions"] : 10,
      readingMode: settingsInput["readingMode"] === "aloud" ? "aloud" : "silent",
      answerMode: settingsInput["answerMode"] === "voice" ? "voice" : "type",
    },
    producedBy: asString(input["producedBy"]) || "shared",
    createdAt: typeof input["createdAt"] === "number" ? input["createdAt"] : Date.now(),
  };

  return {
    pack,
    hash: textHash(body),
    summary: {
      title: pack.text.title,
      lang,
      wordCount: countWords(body),
      sentenceCount: sentences.length,
      questionCount: checked.questions.length,
      droppedCount: checked.dropped.length,
      level,
    },
  };
}
