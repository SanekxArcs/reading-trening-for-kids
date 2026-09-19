import {
  countWords,
  deriveTitle,
  guessLanguage,
  splitSentences,
  textHash,
  updateStat,
  EMPTY_STAT,
  type ChildLevel,
  type MasteryStat,
  type Question,
  type StoredText,
  type TextLang,
  type TextSource,
} from "@/engine";
import {
  db,
  safeRead,
  safeWrite,
  type StoredAnswer,
  type StoredQuestionSet,
  type StoredSession,
} from "./db.ts";

/**
 * The only module that talks to Dexie.
 *
 * Screens call these; nothing else imports `db`. That keeps every storage
 * failure handled in one place and means the engine never learns that storage
 * exists at all.
 */

function id(): string {
  return crypto.randomUUID();
}

// ─── Texts ────────────────────────────────────────────────────────────────

export interface NewText {
  body: string;
  title?: string;
  lang?: TextLang;
  source?: TextSource;
}

/**
 * Saves a text, or returns the one already stored with the same content.
 *
 * De-duplicating on the content hash is what makes re-reading work: a parent
 * who pastes the same page again gets the existing entry, its history and its
 * cached questions, rather than a second library card that cost another API
 * call to fill.
 */
export async function saveText(input: NewText): Promise<StoredText | null> {
  const body = input.body.trim();
  if (body.length === 0) return null;

  const hash = textHash(body);
  const existing = await safeRead(() => db.texts.where("hash").equals(hash).first(), undefined);
  if (existing) return existing;

  const lang = input.lang ?? guessLanguage(body);
  const text: StoredText = {
    id: id(),
    title: input.title?.trim() || deriveTitle(body),
    body,
    lang,
    source: input.source ?? "paste",
    hash,
    wordCount: countWords(body),
    sentenceCount: splitSentences(body, lang).length,
    createdAt: Date.now(),
  };

  const ok = await safeWrite(() => db.texts.put(text));
  return ok ? text : null;
}

export const listTexts = (): Promise<StoredText[]> =>
  // Dexie's Collection.reverse(), which returns a new collection rather than
  // mutating an array — the lint rule below cannot tell the two apart.
  // oxlint-disable-next-line unicorn/no-array-reverse
  safeRead(() => db.texts.orderBy("createdAt").reverse().toArray(), []);

export const getText = (textId: string): Promise<StoredText | null> =>
  safeRead(async () => (await db.texts.get(textId)) ?? null, null);

export async function updateText(textId: string, patch: Partial<StoredText>): Promise<boolean> {
  return safeWrite(() => db.texts.update(textId, patch));
}

/**
 * Deletes a text and everything that pointed at it.
 *
 * The only delete in the app, and it is always a deliberate parent action.
 * Sessions go too: a history entry whose text no longer exists cannot show a
 * result screen, and leaving orphans would slowly fill the progress charts
 * with rows nothing can open.
 */
export async function deleteText(textId: string): Promise<boolean> {
  return safeWrite(async () => {
    const sessions = await db.sessions.where("textId").equals(textId).toArray();
    await Promise.all(
      sessions.map((session) => db.answers.where("sessionId").equals(session.id).delete()),
    );
    await db.sessions.where("textId").equals(textId).delete();
    await db.questionSets.where("textId").equals(textId).delete();
    await db.texts.delete(textId);
  });
}

// ─── Question sets ────────────────────────────────────────────────────────

export interface NewQuestionSet {
  cacheKey: string;
  textId: string;
  level: ChildLevel;
  questions: Question[];
  producedBy: string;
  approved: boolean;
}

export const saveQuestionSet = (input: NewQuestionSet): Promise<boolean> =>
  safeWrite(() => db.questionSets.put({ ...input, createdAt: Date.now() }));

export const getQuestionSet = (cacheKey: string): Promise<StoredQuestionSet | null> =>
  safeRead(async () => (await db.questionSets.get(cacheKey)) ?? null, null);

/**
 * Any cached set for this text and level, newest first, whatever produced it.
 *
 * The two-stage lookup from the plan: an exact cache key first, then this. A
 * parent whose daily quota is gone gets last week's questions rather than
 * nothing at all.
 */
export const findAnyQuestionSet = (
  textId: string,
  level: ChildLevel,
): Promise<StoredQuestionSet | null> =>
  safeRead(async () => {
    const sets = await db.questionSets.where("[textId+level]").equals([textId, level]).toArray();
    return sets.toSorted((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  }, null);

export const approveQuestionSet = (cacheKey: string): Promise<boolean> =>
  safeWrite(() => db.questionSets.update(cacheKey, { approved: true }));

/**
 * Every stored set, for the library to work out which texts still want a
 * grown-up.
 *
 * A whole-table read, which would be indefensible against a server and costs
 * nothing here: this table holds one row per text per level, and the library
 * already reads every text and every session to draw itself.
 */
export const listQuestionSets = (): Promise<StoredQuestionSet[]> =>
  safeRead(() => db.questionSets.toArray(), []);

/**
 * The parent has been through the questions: this is what they left.
 *
 * Saved and approved in one step on purpose. A set that was edited but not
 * approved would be a third state nobody asked for, and the only way out of
 * the review screen is to finish.
 */
export const saveReviewedQuestions = (cacheKey: string, questions: Question[]): Promise<boolean> =>
  safeWrite(() => db.questionSets.update(cacheKey, { questions, approved: true }));

// ─── Sessions and answers ─────────────────────────────────────────────────

export interface NewSession {
  textId: string;
  cacheKey: string;
  level: ChildLevel;
  readingMs: number;
  wordCount: number;
  charCount: number;
  speedCounts: boolean;
}

export async function startSession(input: NewSession): Promise<StoredSession | null> {
  const session: StoredSession = {
    ...input,
    id: id(),
    startedAt: Date.now(),
    finishedAt: null,
  };
  const ok = await safeWrite(() => db.sessions.put(session));
  return ok ? session : null;
}

export const finishSession = (
  sessionId: string,
  scored: Pick<StoredSession, "points" | "bestStreak" | "goalReached" | "playerLevel"> = {},
): Promise<boolean> =>
  safeWrite(() => db.sessions.update(sessionId, { ...scored, finishedAt: Date.now() }));

/** Folds a read-aloud comparison into the session it belongs to. */
export const recordReadAloud = (
  sessionId: string,
  reading: Pick<StoredSession, "oralWpm" | "oralAccuracy" | "stumbled" | "transcript">,
): Promise<boolean> => safeWrite(() => db.sessions.update(sessionId, reading));

export const getSession = (sessionId: string): Promise<StoredSession | null> =>
  safeRead(async () => (await db.sessions.get(sessionId)) ?? null, null);

export const listSessions = (textId: string): Promise<StoredSession[]> =>
  safeRead(
    async () =>
      (await db.sessions.where("textId").equals(textId).toArray()).toSorted(
        (a, b) => a.startedAt - b.startedAt,
      ),
    [],
  );

export const listAllSessions = (): Promise<StoredSession[]> =>
  // oxlint-disable-next-line unicorn/no-array-reverse
  safeRead(async () => db.sessions.orderBy("startedAt").reverse().toArray(), []);

export const saveAnswers = (answers: readonly Omit<StoredAnswer, "id" | "createdAt">[]) =>
  safeWrite(() =>
    db.answers.bulkPut(answers.map((answer) => ({ ...answer, id: id(), createdAt: Date.now() }))),
  );

export const listAnswers = (sessionId: string): Promise<StoredAnswer[]> =>
  safeRead(async () => db.answers.where("sessionId").equals(sessionId).toArray(), []);

/** Patches a verdict after a grown-up overrode it on the review screen. */
export const overrideVerdict = (answerId: string, verdict: StoredAnswer["verdict"]) =>
  safeWrite(() => db.answers.update(answerId, { verdict, judgedBy: "parent" }));

// ─── Mastery ──────────────────────────────────────────────────────────────

export const loadStats = (): Promise<Map<string, MasteryStat>> =>
  safeRead(async () => {
    const rows = await db.stats.toArray();
    return new Map(rows.map(({ id: statId, ...stat }) => [statId, stat]));
  }, new Map<string, MasteryStat>());

/**
 * Folds one outcome into a skill or word record.
 *
 * Read-modify-write rather than a transaction: the only writer is the quiz on
 * one device, and a lost update here costs a fraction of one strength point.
 */
export async function recordOutcome(
  statId: string,
  outcome: Parameters<typeof updateStat>[1],
  now = Date.now(),
): Promise<boolean> {
  return safeWrite(async () => {
    const existing = await db.stats.get(statId);
    const { id: _ignored, ...current } = existing ?? { id: statId, ...EMPTY_STAT };
    await db.stats.put({ id: statId, ...updateStat(current, outcome, now) });
  });
}
