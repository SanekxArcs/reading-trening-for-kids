import type { ObservedLimit, QuotaAllowance } from "../core/modelLimits.ts";

/**
 * What the API has told us each model is allowed.
 *
 * Written the first time a model returns a 429 and kept from then on, because
 * that response is the only authoritative statement of a per-model limit that
 * exists any more — the documentation no longer prints them, and a figure
 * copied from a blog post ages badly.
 *
 * Keyed by model id in localStorage rather than in the ledger: it is a fact
 * about the key and the model, not about a particular day, and it must survive
 * the daily rollover that clears everything else.
 */

const KEY = "read_master_quota";

type Store = Record<string, ObservedLimit>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Store) : {};
  } catch {
    // Private mode, or something that is not JSON. Falling back to the
    // estimates is a worse answer, not a broken one.
    return {};
  }
}

export function readObservedLimit(modelId: string): ObservedLimit | null {
  return readStore()[modelId] ?? null;
}

/**
 * Records what a refusal said, keeping whichever half it did not mention.
 *
 * A per-minute 429 and a per-day one arrive separately and each names only its
 * own quota, so merging is the difference between knowing both numbers and
 * knowing whichever came last.
 */
export function noteObservedLimit(modelId: string, quota: QuotaAllowance, at = Date.now()): void {
  if (quota.rpm === undefined && quota.rpd === undefined) return;

  const store = readStore();
  const current = store[modelId];
  const rpm = quota.rpm ?? current?.rpm;
  const rpd = quota.rpd ?? current?.rpd;
  store[modelId] = {
    ...(rpm === undefined ? {} : { rpm }),
    ...(rpd === undefined ? {} : { rpd }),
    at,
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode: the estimate stands in again next time */
  }
}

/** Used when the key changes: the old key's tier says nothing about the new one. */
export function forgetObservedLimits(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
