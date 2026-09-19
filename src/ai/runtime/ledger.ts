import { db, safeRead, safeWrite } from "@/data/db";
import {
  applyEntry,
  canSpend,
  DEFAULT_CAPS,
  emptyLedger,
  today,
  type BudgetCaps,
  type DayLedger,
  type GateDecision,
  type LedgerEntry,
} from "../core/budget.ts";

/**
 * What the key was spent on, per day.
 *
 * Every response carries `usageMetadata` for free, so this costs nothing to
 * keep and turns "why is my quota gone" into a number with a breakdown beside
 * it. The per-label split is the part a parent actually acts on: it shows
 * immediately that photographing pages is where the tokens go.
 */

const CAPS_KEY = "read_master_caps";

export async function loadDay(day = today()): Promise<DayLedger> {
  return safeRead(async () => (await db.ledger.get(day)) ?? emptyLedger(day), emptyLedger(day));
}

export async function record(entry: LedgerEntry, day = today()): Promise<void> {
  await safeWrite(async () => {
    const current = (await db.ledger.get(day)) ?? emptyLedger(day);
    await db.ledger.put(applyEntry(current, entry));
  });
}

/** The last `days` days, oldest first, with the empty ones filled in. */
export async function recentDays(days = 7, now = new Date()): Promise<DayLedger[]> {
  const wanted: string[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(now);
    date.setDate(date.getDate() - back);
    wanted.push(today(date));
  }

  return safeRead(async () => {
    const rows = await db.ledger.bulkGet(wanted);
    // A dense window: a gap in a sparkline reads as missing data rather than as
    // a day nobody read anything.
    return wanted.map((day, index) => rows[index] ?? emptyLedger(day));
  }, wanted.map(emptyLedger));
}

export function readCaps(): BudgetCaps {
  try {
    const raw = localStorage.getItem(CAPS_KEY);
    if (!raw) return DEFAULT_CAPS;
    const parsed = JSON.parse(raw) as Partial<BudgetCaps>;
    return {
      maxRequestsPerDay:
        typeof parsed.maxRequestsPerDay === "number" && parsed.maxRequestsPerDay > 0
          ? Math.round(parsed.maxRequestsPerDay)
          : DEFAULT_CAPS.maxRequestsPerDay,
      warnAboveTokens:
        typeof parsed.warnAboveTokens === "number" && parsed.warnAboveTokens > 0
          ? Math.round(parsed.warnAboveTokens)
          : DEFAULT_CAPS.warnAboveTokens,
    };
  } catch {
    return DEFAULT_CAPS;
  }
}

export function writeCaps(caps: BudgetCaps): void {
  try {
    localStorage.setItem(CAPS_KEY, JSON.stringify(caps));
  } catch {
    /* private mode */
  }
}

/** Asked before every send, never after. */
export async function checkBudget(day = today()): Promise<GateDecision> {
  return canSpend(await loadDay(day), readCaps());
}
