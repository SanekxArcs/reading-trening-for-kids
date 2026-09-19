/**
 * How much a given model is allowed to do in a day, and how sure we are.
 *
 * Google stopped publishing per-model rate limits: the documentation page now
 * says they "can be viewed in Google AI Studio" and prints no numbers at all.
 * So this file does two things, and the difference between them is the whole
 * design:
 *
 *   - an ESTIMATE, from what the limits were last reported to be. Good enough
 *     to warn a parent that a model gives twenty requests a day rather than
 *     five hundred, and always shown as an approximation;
 *   - the OBSERVED figure, which the API itself states in the `QuotaFailure`
 *     detail attached to a 429. That is authoritative, current, and specific to
 *     this key's tier — and it replaces the estimate permanently.
 *
 * Nothing in the app's behaviour depends on the estimates. The queue still
 * learns the real pace by halving on every 429, and the daily gate still runs
 * off the parent's own cap. These numbers exist so that "12 requests today"
 * means something, and so that a model with a twenty-a-day allowance can be
 * labelled as one before a family wastes an evening on it.
 */

export interface ModelLimits {
  /** Requests per minute. */
  rpm: number;
  /** Requests per day — the number that decides if a model is usable at all. */
  rpd: number;
  /** An estimate until the API contradicts it. */
  source: "estimated" | "observed";
}

/** Re-exported so nothing outside has to know the error module to read a quota. */
export type { QuotaAllowance } from "./errors.ts";

export interface ObservedLimit {
  rpm?: number;
  rpd?: number;
  /** When the API told us, so a stale figure can be recognised as stale. */
  at: number;
}

/**
 * Family and generation, from the id alone.
 *
 * Major times a hundred plus minor: `gemini-3.8-flash` → 308, `gemini-3-flash`
 * → 300, `gemini-2.5-flash` → 205.
 * Patterns rather than names, because the catalogue moves faster than this
 * file does and an unknown model must degrade to "no idea" rather than to a
 * wrong number.
 */
export function modelGeneration(id: string): number {
  const match = /gemini-(\d+)(?:\.(\d+))?/i.exec(id);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2] ?? 0);
}

interface Band {
  match: RegExp;
  /** Inclusive floor on `modelGeneration`. */
  from: number;
  rpm: number;
  rpd: number;
}

/**
 * Free-tier allowances, most specific first.
 *
 * The 2.5 row is the one that was published for a long time and is well
 * attested. The 3.x rows are what the limits have since been reported to be,
 * and the spread is the point: the newest Flash models are throttled hard on
 * the free tier, while Flash-Lite stays generous. That is exactly why this app
 * prefers Flash-Lite by default.
 */
const BANDS: readonly Band[] = [
  { match: /flash-lite/i, from: 300, rpm: 15, rpd: 500 },
  { match: /flash-lite/i, from: 0, rpm: 15, rpd: 1000 },
  // 3.5 and up: a handful of requests a day, not a working budget.
  { match: /flash/i, from: 305, rpm: 10, rpd: 20 },
  { match: /flash/i, from: 300, rpm: 10, rpd: 1500 },
  { match: /flash/i, from: 0, rpm: 10, rpd: 250 },
  { match: /pro/i, from: 0, rpm: 5, rpd: 100 },
];

export function estimatedLimits(modelId: string): ModelLimits | null {
  const generation = modelGeneration(modelId);
  const band = BANDS.find((entry) => entry.match.test(modelId) && generation >= entry.from);
  return band ? { rpm: band.rpm, rpd: band.rpd, source: "estimated" } : null;
}

/**
 * What this model is allowed, preferring what the API actually said.
 *
 * A partially observed limit is merged rather than discarded: a 429 that names
 * only the daily quota still tells us the true daily number, and the estimate
 * can keep standing in for the per-minute one.
 */
export function limitsFor(modelId: string, observed?: ObservedLimit | null): ModelLimits | null {
  const estimate = estimatedLimits(modelId);
  if (!observed || (observed.rpm === undefined && observed.rpd === undefined)) return estimate;

  return {
    rpm: observed.rpm ?? estimate?.rpm ?? 0,
    rpd: observed.rpd ?? estimate?.rpd ?? 0,
    source: "observed",
  };
}

/**
 * Worth putting in front of a parent.
 *
 * The Gemini 3 families and nothing older: the earlier ones are slower at the
 * same job for the same money, and a list of eleven models where two are worth
 * choosing is a list nobody reads.
 */
export function isRecommended(modelId: string): boolean {
  return modelGeneration(modelId) >= 300 && /flash/i.test(modelId);
}

export interface DailyBudget {
  used: number;
  /** The smaller of the parent's cap and the model's allowance. */
  limit: number;
  /** Which of the two is actually stopping them. */
  binding: "parent" | "model";
  remaining: number;
  /** True while the model figure is still a guess. */
  approximate: boolean;
}

/**
 * What is left today, and who says so.
 *
 * Both numbers are real limits and either can bind first, so saying which one
 * does is the difference between "raise your own cap" and "switch model" —
 * two different actions a parent would otherwise have to guess between.
 */
export function dailyBudget(
  used: number,
  parentCap: number,
  limits: ModelLimits | null,
): DailyBudget {
  const modelBinds = limits !== null && limits.rpd < parentCap;
  const limit = modelBinds ? (limits as ModelLimits).rpd : parentCap;

  return {
    used,
    limit,
    binding: modelBinds ? "model" : "parent",
    remaining: Math.max(0, limit - used),
    approximate: modelBinds && limits.source === "estimated",
  };
}
