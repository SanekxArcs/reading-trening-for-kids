import type { Rng } from "./rng.ts";
import type { ChildLevel, QuestionType } from "./types.ts";

/**
 * What the app knows about one thing the child is practising.
 *
 * In the math app a "fact" was a cell of a times table. Here there are two
 * kinds of trackable thing and they share this shape exactly:
 *
 *  - a **skill**: a question type at a level, `inference:developing`. This is
 *    what the progress screen reports and what biases the next question set.
 *  - a **word**: a word the child got wrong in a vocabulary question, or misread
 *    when reading aloud. These come back in the warm-up before a later text.
 *
 * The arithmetic below — asymptotic gains, a heavy cost for a mistake, decay
 * over weeks — is carried over unchanged, because none of it was ever about
 * arithmetic.
 */
export interface MasteryStat {
  attempts: number;
  correct: number;
  /** Sum of response times, for the average shown on the progress screen. */
  totalMs: number;
  /** Fastest correct answer, which is the better signal of real recall. */
  bestMs: number;
  /** 0..1 as measured at `lastSeenAt`; decays from there. See `strengthNow`. */
  strength: number;
  lastSeenAt: number;
}

export const EMPTY_STAT: MasteryStat = {
  attempts: 0,
  correct: 0,
  totalMs: 0,
  bestMs: 0,
  strength: 0,
  lastSeenAt: 0,
};

/**
 * Answering inside this is "fluent" for the level; twice it earns nothing for
 * speed.
 *
 * An order of magnitude slower than the math app's thresholds, and it has to
 * be: there the child recalled `7 x 8`, here they have to remember what
 * happened in a story and then type it. A beginner hunting for two letters on
 * a keyboard spends most of these seconds typing, not thinking.
 */
export const FLUENT_MS: Record<ChildLevel, number> = {
  beginner: 25_000,
  developing: 18_000,
  fluent: 14_000,
  advanced: 11_000,
};

/**
 * Knowledge fades. Without this, a skill drilled once in March would count as
 * known in September and never come back round.
 */
export const HALF_LIFE_DAYS = 21;

const DAY_MS = 86_400_000;

/** Stable id for a skill: `inference:developing`. */
export function skillId(type: QuestionType, level: ChildLevel): string {
  return `${type}:${level}`;
}

export function parseSkillId(id: string): { type: QuestionType; level: ChildLevel } | null {
  const [type, level] = id.split(":");
  if (!type || !level) return null;
  return { type: type as QuestionType, level: level as ChildLevel };
}

/**
 * Stable id for a word. Lowercased and stripped of surrounding punctuation so
 * that "Лисиця," and "лисиця" are the same word — but *not* stemmed, because
 * the warm-up should show the child the form that actually appeared in a text.
 */
export function wordId(word: string): string {
  return `w:${word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")}`;
}

export interface MasteryOutcome {
  isCorrect: boolean;
  ms: number;
  level: ChildLevel;
  /** True when the child was shown the source sentence — they did not do it alone. */
  aided: boolean;
}

/**
 * Folds one answer into a record.
 *
 * Gains are asymptotic, so strength approaches 1 without ever quite arriving —
 * there is no point at which the app decides a child is finished with a skill.
 * A mistake costs far more than a single correct answer earns, because one
 * confident wrong answer says more about what they know than one right one.
 */
export function updateStat(stat: MasteryStat, outcome: MasteryOutcome, now: number): MasteryStat {
  const base = strengthNow(stat, now);

  const next: MasteryStat = {
    attempts: stat.attempts + 1,
    correct: stat.correct + (outcome.isCorrect ? 1 : 0),
    totalMs: stat.totalMs + outcome.ms,
    bestMs:
      outcome.isCorrect && (stat.bestMs === 0 || outcome.ms < stat.bestMs)
        ? outcome.ms
        : stat.bestMs,
    strength: base,
    lastSeenAt: now,
  };

  if (!outcome.isCorrect) {
    next.strength = base * 0.4;
    return next;
  }

  const fluent = FLUENT_MS[outcome.level];
  // 1 when instant, 0 at twice the fluent time. Clamped, so a child who wandered
  // off mid-question is not punished beyond "no speed credit".
  const speed = Math.max(0, Math.min(1, 1 - outcome.ms / (2 * fluent)));

  // Deliberately unhurried: three quick correct answers should read as "getting
  // there", not "knows it". Comprehension is built from reading spread over
  // weeks, not from one good afternoon.
  let gain = 0.1 + 0.18 * speed;
  // Getting there with the sentence in front of them is worth something, but
  // not full credit.
  if (outcome.aided) gain *= 0.4;

  next.strength = base + gain * (1 - base);
  return next;
}

/** Strength decayed to `now`. Everything that reads strength goes through this. */
export function strengthNow(stat: MasteryStat, now: number): number {
  if (stat.attempts === 0 || stat.lastSeenAt === 0) return 0;
  const days = Math.max(0, (now - stat.lastSeenAt) / DAY_MS);
  return stat.strength * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export type MasteryBand = "unseen" | "learning" | "practising" | "known";

export function masteryBand(stat: MasteryStat | undefined, now: number): MasteryBand {
  if (!stat || stat.attempts === 0) return "unseen";
  const strength = strengthNow(stat, now);
  if (strength < 0.45) return "learning";
  if (strength < 0.7) return "practising";
  return "known";
}

/**
 * How much something deserves to come round again. Squared, so a half-learned
 * skill is picked roughly four times as often as a nearly-known one.
 *
 * The floor is deliberate and never zero: a skill the child has mastered still
 * comes round occasionally, which is what stops "learned" quietly becoming
 * "forgotten" between one term and the next.
 */
export const WEIGHT_FLOOR = 0.015;

/**
 * Something the child has actually got wrong outranks something they have never
 * been asked. Without this multiplier the two weigh the same, and a known
 * weakness would surface about as often as any untouched skill — the exact
 * opposite of practising what needs practising.
 */
const ATTEMPTED_PRIORITY = 2.2;

/**
 * Standing of something never asked. Sits between "shaky" and "getting there",
 * so new material is introduced steadily without crowding out the mistakes the
 * child has already made.
 */
export const UNSEEN_WEIGHT = 1;

export function selectionWeight(stat: MasteryStat | undefined, now: number): number {
  if (!stat || stat.attempts === 0) return UNSEEN_WEIGHT;
  const gap = 1 - strengthNow(stat, now);
  return gap * gap * ATTEMPTED_PRIORITY + WEIGHT_FLOOR;
}

export interface PickOptions {
  /** Id that must not be returned, so the same thing is not used twice running. */
  avoid?: string | undefined;
}

/**
 * Draws one id from `candidates`, biased towards what the child does not know.
 *
 * Weighted proportional selection rather than "take the weakest": always
 * picking the single worst item would drill one thing into the ground and make
 * the app predictable. Returns null only when every candidate was excluded.
 *
 * Generic over ids on purpose — the same function picks which skill to
 * emphasise in the next question set and which words to put in a warm-up.
 */
export function pickWeighted(
  candidates: readonly string[],
  stats: ReadonlyMap<string, MasteryStat>,
  rng: Rng,
  now: number,
  options: PickOptions = {},
): string | null {
  if (candidates.length === 0) return null;

  let total = 0;
  const weights = candidates.map((id) => {
    const weight = options.avoid === id ? 0 : selectionWeight(stats.get(id), now);
    total += weight;
    return weight;
  });

  if (total <= 0) return null;

  let ticket = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    ticket -= weights[i] as number;
    if (ticket <= 0) return candidates[i] as string;
  }
  return candidates[candidates.length - 1] as string;
}

/**
 * The skills, weakest first, that the next question set should lean on.
 *
 * This is the one place mastery feeds back into what the child is asked: the
 * question generator is told "favour these", rather than the app trying to pick
 * individual questions the way the math app picked individual facts. A text
 * only supports the questions it supports.
 */
export function weakestSkills(
  types: readonly QuestionType[],
  level: ChildLevel,
  stats: ReadonlyMap<string, MasteryStat>,
  now: number,
  count = 2,
): QuestionType[] {
  return types
    .toSorted(
      (a, b) =>
        selectionWeight(stats.get(skillId(b, level)), now) -
        selectionWeight(stats.get(skillId(a, level)), now),
    )
    .slice(0, Math.max(0, count));
}
