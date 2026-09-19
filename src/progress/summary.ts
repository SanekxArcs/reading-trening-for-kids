import {
  comprehension,
  masteryBand,
  skillId,
  strengthNow,
  wordsPerMinute,
  QUESTION_TYPES,
  type AnswerVerdict,
  type ChildLevel,
  type MasteryBand,
  type MasteryStat,
  type QuestionType,
} from "@/engine";

/**
 * Turning a pile of sessions into the few numbers a parent can act on.
 *
 * Pure, so the shape of the dashboard is testable without a database or a
 * browser — and so the decisions inside it (which sessions count, what a streak
 * is, when there is not enough data to say anything) are decisions rather than
 * accidents of how the query happened to be written.
 */

export interface SessionSummary {
  id: string;
  startedAt: number;
  wordCount: number;
  readingMs: number;
  speedCounts: boolean;
  verdicts: AnswerVerdict[];
}

export interface DayPoint {
  /** Local date, "2026-09-19". */
  day: string;
  sessions: number;
  /** Null when nothing that day produced a usable figure. */
  effectiveWpm: number | null;
}

function localDay(at: number): string {
  const date = new Date(at);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * A dense window, ending today.
 *
 * Dense because a gap in a chart reads as missing data rather than as a day
 * nobody read anything — and "we skipped Tuesday" is exactly what a parent is
 * looking at this for.
 */
export function dailySeries(
  sessions: readonly SessionSummary[],
  days = 14,
  now = new Date(),
): DayPoint[] {
  const wanted: string[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(now);
    date.setDate(date.getDate() - back);
    wanted.push(localDay(date.getTime()));
  }

  const byDay = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const day = localDay(session.startedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), session]);
  }

  return wanted.map((day): DayPoint => {
    const inDay = byDay.get(day) ?? [];
    const usable = inDay
      .filter((session) => session.speedCounts)
      .map((session) => {
        const understood = comprehension(session.verdicts);
        if (understood.score === null) return null;
        return wordsPerMinute(session.wordCount, session.readingMs) * understood.score;
      })
      .filter((value): value is number => value !== null);

    return {
      day,
      sessions: inDay.length,
      effectiveWpm:
        usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0) / usable.length,
    };
  });
}

/**
 * Consecutive days ending today or yesterday.
 *
 * Yesterday counts so that a streak is not destroyed at midnight by a family
 * that reads in the evening — the point of showing it is encouragement, and a
 * counter that resets while everyone is asleep discourages instead.
 */
export function readingStreak(sessions: readonly SessionSummary[], now = new Date()): number {
  const days = new Set(sessions.map((session) => localDay(session.startedAt)));
  if (days.size === 0) return 0;

  const cursor = new Date(now);
  if (!days.has(localDay(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDay(cursor.getTime()))) return 0;
  }

  let streak = 0;
  while (days.has(localDay(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface SkillSummary {
  type: QuestionType;
  band: MasteryBand;
  /** 0..1, decayed to now. */
  strength: number;
  attempts: number;
}

/**
 * Every skill, strongest first.
 *
 * All five always appear, including untouched ones: "we have never asked them
 * to draw a conclusion" is as useful to a parent as "they are weak at it", and
 * a list that silently omits the untried looks like a clean bill of health.
 */
export function skillSummary(
  stats: ReadonlyMap<string, MasteryStat>,
  level: ChildLevel,
  now = Date.now(),
): SkillSummary[] {
  return QUESTION_TYPES.map((type): SkillSummary => {
    const stat = stats.get(skillId(type, level));
    return {
      type,
      band: masteryBand(stat, now),
      strength: stat ? strengthNow(stat, now) : 0,
      attempts: stat?.attempts ?? 0,
    };
  }).toSorted((a, b) => b.strength - a.strength);
}

/** Null rather than zero for an empty set: "no data" is not "a score of none". */
function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface Totals {
  sessions: number;
  /** Null until at least one session has been judged. */
  comprehension: number | null;
  effectiveWpm: number | null;
  streak: number;
  /** Answers still waiting on a grown-up. */
  pending: number;
}

/**
 * The headline figures.
 *
 * Averaged over sessions rather than over answers, so one long text does not
 * outvote a week of short ones.
 */
export function totals(sessions: readonly SessionSummary[], now = new Date()): Totals {
  const scores: number[] = [];
  const speeds: number[] = [];
  let pending = 0;

  for (const session of sessions) {
    const understood = comprehension(session.verdicts);
    pending += understood.pending;
    if (understood.score === null) continue;
    scores.push(understood.score);
    if (session.speedCounts) {
      speeds.push(wordsPerMinute(session.wordCount, session.readingMs) * understood.score);
    }
  }

  return {
    sessions: sessions.length,
    comprehension: mean(scores),
    effectiveWpm: mean(speeds),
    streak: readingStreak(sessions, now),
    pending,
  };
}
