import Dexie, { type Table } from "dexie";
import type { ChildLevel, MasteryStat, Question, StoredText } from "@/engine";
import type { AnswerVerdict } from "@/engine";
import type { DayLedger } from "@/ai/core/budget";

/**
 * Everything this app knows, and the only copy of it.
 *
 * The math app's IndexedDB was a cache: Convex held the truth and a wipe cost
 * nothing. Here there is no server. A text a parent photographed, and the
 * question set that cost API calls to generate, exist here and nowhere else —
 * which is why nothing in the app deletes this database, and why every read is
 * wrapped so that a blocked or corrupt store degrades instead of crashing.
 */

export interface StoredQuestionSet {
  /** The cache key doubles as the primary key; see textHash + level + model. */
  cacheKey: string;
  textId: string;
  level: ChildLevel;
  questions: Question[];
  /** "local" or "gemini:<model>", so the UI can label practice questions. */
  producedBy: string;
  /** Parent has seen these and let them through. */
  approved: boolean;
  createdAt: number;
}

export interface StoredSession {
  id: string;
  textId: string;
  cacheKey: string;
  level: ChildLevel;
  startedAt: number;
  /** Milliseconds actually spent reading, pauses already deducted. */
  readingMs: number;
  wordCount: number;
  charCount: number;
  /** Null until the quiz is finished. */
  finishedAt: number | null;
  /** Speed figures are not kept as progress when the read was implausible. */
  speedCounts: boolean;
  /**
   * Set only when the child read aloud.
   *
   * Optional rather than a separate table: Dexie indexes only what the store
   * string names, so adding fields to a stored object needs no migration, and a
   * session recorded before this existed simply has none.
   */
  oralWpm?: number;
  oralAccuracy?: number;
  /** Words misread or skipped, for a later warm-up. */
  stumbled?: string[];
  transcript?: string;
  /**
   * What the round was worth to the child.
   *
   * Written when the quiz finishes, so the result screen shows the same number
   * they watched climbing rather than recomputing it from answers and
   * disagreeing with itself by a point.
   */
  points?: number;
  bestStreak?: number;
  goalReached?: boolean;
  /** The level this round was played at, so an old result still reads right. */
  playerLevel?: number;
}

export interface StoredAnswer {
  id: string;
  sessionId: string;
  questionId: string;
  /** Snapshot of the question, so a result screen survives a re-generated set. */
  question: Question;
  given: string;
  verdict: AnswerVerdict;
  /** "local:<reason>" or "ai:<model>" — shown to the parent, never the child. */
  judgedBy: string;
  ms: number;
  usedHint: boolean;
  createdAt: number;
}

export interface StoredStat extends MasteryStat {
  /** skillId() or wordId(). */
  id: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class ReadMasterDb extends Dexie {
  texts!: Table<StoredText, string>;
  questionSets!: Table<StoredQuestionSet, string>;
  sessions!: Table<StoredSession, string>;
  answers!: Table<StoredAnswer, string>;
  stats!: Table<StoredStat, string>;
  ledger!: Table<DayLedger, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("read-master");
    this.version(1).stores({
      texts: "id, hash, createdAt",
      // Compound index so "any cached set for this text and level, whatever
      // model made it" is a cheap query — that is the fallback a parent with no
      // quota left depends on.
      questionSets: "cacheKey, textId, [textId+level], createdAt",
      sessions: "id, textId, startedAt",
      answers: "id, sessionId",
      stats: "id, lastSeenAt",
      meta: "key",
    });

    // Per-day API usage, added in v2. Dexie migrates in place, so an installed
    // app keeps its texts, its history and its cached question sets.
    this.version(2).stores({
      texts: "id, hash, createdAt",
      questionSets: "cacheKey, textId, [textId+level], createdAt",
      sessions: "id, textId, startedAt",
      answers: "id, sessionId",
      stats: "id, lastSeenAt",
      ledger: "day",
      meta: "key",
    });
  }
}

export const db = new ReadMasterDb();

/**
 * Every access goes through one of these.
 *
 * A blocked or corrupt IndexedDB — private mode, a full disk, a browser that
 * evicted the origin — must never stop a child reading. Failures return the
 * safe default and are logged once for the parent's diagnostics, not surfaced.
 */
export async function safeRead<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error("[read-master] storage read failed", error);
    return fallback;
  }
}

export async function safeWrite(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    console.error("[read-master] storage write failed", error);
    return false;
  }
}

export const getMeta = <T>(key: string): Promise<T | null> =>
  safeRead(async () => {
    const row = await db.meta.get(key);
    return row ? (row.value as T) : null;
  }, null);

export const setMeta = (key: string, value: unknown): Promise<boolean> =>
  safeWrite(() => db.meta.put({ key, value }));
