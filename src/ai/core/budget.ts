import type { RequestLabel } from "./provider.ts";

/**
 * What a day of using this app costs, and when to stop.
 *
 * A client-side cap is the only real protection when one family key is used
 * from three devices — nothing else knows about the other two. It costs
 * nothing, it cannot be evaded by accident, and it turns "why is my quota
 * gone?" into a number a parent set themselves.
 */

export interface DayLedger {
  /** "2026-09-19", in local time: a parent's day, not UTC's. */
  day: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  failures: number;
  rateLimited: number;
  repairs: number;
  /** Per-label breakdown, which immediately shows where the tokens went. */
  byLabel: Partial<Record<RequestLabel, number>>;
}

export function emptyLedger(day: string): DayLedger {
  return {
    day,
    requests: 0,
    promptTokens: 0,
    outputTokens: 0,
    failures: 0,
    rateLimited: 0,
    repairs: 0,
    byLabel: {},
  };
}

/**
 * Local date, not UTC.
 *
 * A session at 23:30 belongs to the day the family thinks it is. Google's own
 * quota resets on Pacific midnight, which is a separate thing and is tracked
 * separately — this is the parent's cap, in the parent's day.
 */
export function today(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface BudgetCaps {
  /** Hard stop after this many requests in a local day. */
  maxRequestsPerDay: number;
  /** Warn the parent above this many tokens; never blocks. */
  warnAboveTokens: number;
}

export const DEFAULT_CAPS: BudgetCaps = {
  // A session is one request, so fifty is a lot of reading. Low enough that a
  // bug in a loop cannot quietly drain a paid key overnight.
  maxRequestsPerDay: 50,
  warnAboveTokens: 500_000,
};

export type GateDecision =
  { allowed: true; warn: boolean } | { allowed: false; reason: "local_cap" };

/**
 * Consulted *before* sending, never after.
 *
 * Checking afterwards would mean the request that broke the cap is the one that
 * already went out.
 */
export function canSpend(ledger: DayLedger, caps: BudgetCaps): GateDecision {
  if (ledger.requests >= caps.maxRequestsPerDay) {
    return { allowed: false, reason: "local_cap" };
  }
  return { allowed: true, warn: ledger.promptTokens + ledger.outputTokens > caps.warnAboveTokens };
}

export interface LedgerEntry {
  label: RequestLabel;
  promptTokens: number;
  outputTokens: number;
  failed?: boolean;
  rateLimited?: boolean;
  repaired?: boolean;
}

/** Pure fold, so the storage layer is a put and nothing else. */
export function applyEntry(ledger: DayLedger, entry: LedgerEntry): DayLedger {
  return {
    ...ledger,
    requests: ledger.requests + 1,
    promptTokens: ledger.promptTokens + entry.promptTokens,
    outputTokens: ledger.outputTokens + entry.outputTokens,
    failures: ledger.failures + (entry.failed ? 1 : 0),
    rateLimited: ledger.rateLimited + (entry.rateLimited ? 1 : 0),
    repairs: ledger.repairs + (entry.repaired ? 1 : 0),
    byLabel: { ...ledger.byLabel, [entry.label]: (ledger.byLabel[entry.label] ?? 0) + 1 },
  };
}

/**
 * Pre-flight token estimate.
 *
 * Four characters to a token is crude and good enough for a warning; the real
 * numbers come back in `usageMetadata` and are what the ledger actually
 * records. Audio is the one worth knowing: 32 tokens a second means a
 * five-minute read-aloud is heavier than every question set of the week.
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateImageTokens(count: number): number {
  return count * 1300;
}

export function estimateAudioTokens(seconds: number): number {
  return Math.ceil(seconds * 32);
}
