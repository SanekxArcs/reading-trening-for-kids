import {
  gradeLocally,
  normalize,
  similarity,
  QUESTION_TYPES,
  type Question,
  type QuestionTier,
  type QuestionType,
  type Sentence,
  type TextLang,
} from "@/engine";

/**
 * Checking that a generated question set is fair, before a child sees it.
 *
 * Shape-checking is the easy half and the least valuable. The half that earns
 * its keep is semantic: because every question carries the index of the
 * sentence that proves its answer, the app can go and *look*. A question whose
 * answer is not in the sentence it cites was either mis-cited or invented, and
 * either way a child would be asked something the text never says.
 *
 * Bad questions are dropped, not fatal. Nine good questions out of twelve is a
 * perfectly good round; failing the whole set would mean falling back to the
 * offline generator over one hallucination.
 */

const TIERS: readonly QuestionTier[] = ["easy", "medium", "hard"];

export interface DroppedQuestion {
  index: number;
  reason: string;
  prompt: string;
}

export interface ValidatedSet {
  language: string;
  questions: Question[];
  dropped: DroppedQuestion[];
}

/** Two questions this similar are the same question asked twice. */
const DUPLICATE_THRESHOLD = 0.9;

/** Nothing a child has to type should be longer than this. */
const MAX_ANSWER_WORDS = 6;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isType(value: unknown): value is QuestionType {
  return typeof value === "string" && (QUESTION_TYPES as readonly string[]).includes(value);
}

function isTier(value: unknown): value is QuestionTier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

function cleanAnswers(raw: unknown, canonical: string): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const all = [canonical, ...list.map(asString)]
    .map((answer) => answer.replace(/[.!?…]+$/u, "").trim())
    .filter((answer) => answer.length > 0)
    .filter((answer) => answer.split(/\s+/u).length <= MAX_ANSWER_WORDS);

  // Deduplicate on the normalised form, keeping the first spelling — that is
  // the one the result screen will show the child as "the answer".
  const seen = new Set<string>();
  const out: string[] = [];
  for (const answer of all) {
    const key = normalize(answer);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(answer);
  }
  return out;
}

function cleanKeywords(raw: unknown): string[][] | null {
  if (!Array.isArray(raw)) return null;
  const groups = raw
    .map((group) =>
      (Array.isArray(group) ? group : []).map(asString).filter((word) => word.length > 0),
    )
    .filter((group) => group.length > 0);
  return groups.length > 0 ? groups : null;
}

/**
 * Turns whatever the model returned into questions that can be trusted.
 *
 * `sentences` is the app's own split of the text, not the model's — which is
 * the whole reason the citation can be checked at all.
 */
export function validateQuestionSet(
  raw: unknown,
  sentences: readonly Sentence[],
  lang: TextLang,
): ValidatedSet {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("response is not an object");
  }

  const root = raw as { language?: unknown; questions?: unknown };
  const list = Array.isArray(root.questions) ? root.questions : null;
  if (!list) throw new Error("questions: expected an array");

  const questions: Question[] = [];
  const dropped: DroppedQuestion[] = [];

  list.forEach((item, index) => {
    const drop = (reason: string, prompt = "") => dropped.push({ index, reason, prompt });

    if (typeof item !== "object" || item === null) return drop("not an object");
    const entry = item as Record<string, unknown>;

    const prompt = asString(entry["prompt"]);
    if (prompt.length === 0) return drop("empty prompt");

    const type = entry["type"];
    if (!isType(type)) return drop(`unknown type ${String(type)}`, prompt);

    const tier = entry["tier"];
    if (!isTier(tier)) return drop(`unknown tier ${String(tier)}`, prompt);

    const sentenceIndex = entry["sentenceIndex"];
    if (
      typeof sentenceIndex !== "number" ||
      !Number.isInteger(sentenceIndex) ||
      sentenceIndex < 0 ||
      sentenceIndex >= sentences.length
    ) {
      return drop(`sentenceIndex ${String(sentenceIndex)} out of range`, prompt);
    }

    const canonicalAnswer = asString(entry["canonicalAnswer"]).replace(/[.!?…]+$/u, "");
    if (canonicalAnswer.length === 0) return drop("empty answer", prompt);

    const acceptableAnswers = cleanAnswers(entry["acceptableAnswers"], canonicalAnswer);
    if (acceptableAnswers.length === 0) return drop("no usable acceptable answers", prompt);

    const gradingMode = entry["gradingMode"] === "semantic" ? "semantic" : "exact-ish";
    const requiredKeywords = cleanKeywords(entry["requiredKeywords"]);

    /**
     * The citation check.
     *
     * Only for `literal` questions, and deliberately so: those claim the answer
     * is stated plainly in that one sentence, which is a claim that can be
     * checked. An inference answer is *not* supposed to appear verbatim — that
     * is what makes it an inference — so demanding it there would throw away
     * exactly the questions worth asking.
     */
    if (type === "literal") {
      const sentence = sentences[sentenceIndex] as Sentence;
      const found = gradeLocally(
        { acceptableAnswers: [canonicalAnswer], gradingMode: "exact-ish" },
        sentence.text,
        lang,
      );
      if (found.verdict !== "correct") {
        return drop(`answer "${canonicalAnswer}" is not in sentence ${sentenceIndex}`, prompt);
      }
    }

    // A near-identical prompt is the same question twice; keep the first.
    const normalised = normalize(prompt);
    const duplicate = questions.some(
      (existing) => similarity(normalize(existing.prompt), normalised) > DUPLICATE_THRESHOLD,
    );
    if (duplicate) return drop("duplicate of an earlier question", prompt);

    questions.push({
      id: `q${index}-${sentenceIndex}`,
      type,
      tier,
      sentenceIndex,
      prompt,
      canonicalAnswer,
      acceptableAnswers,
      gradingMode,
      ...(requiredKeywords ? { requiredKeywords } : {}),
      rationale: asString(entry["rationale"]),
    });
  });

  return { language: asString(root.language) || lang, questions, dropped };
}

/**
 * Whether a validated set is worth using, or whether to spend the one repair
 * call.
 *
 * Losing a couple of questions is normal. Losing most of them means the model
 * misunderstood the task rather than slipped once, and a second attempt is
 * likely to be better rather than identical.
 */
export function needsRepair(set: ValidatedSet): boolean {
  const total = set.questions.length + set.dropped.length;
  if (set.questions.length === 0) return true;
  return total > 0 && set.dropped.length > total / 2;
}
