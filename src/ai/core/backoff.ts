import type { Rng } from "@/engine";
import type { AiErrorCode } from "./errors.ts";

/**
 * When to try again, and when to stop trying.
 *
 * All of it pure, with the randomness injected, so a test can prove the delay
 * was honoured rather than assume it. Same discipline as `engine/rng.ts`.
 */

/** Four attempts total. Beyond that the offline path is the better answer. */
export const MAX_ATTEMPTS = 4;

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 32_000;

/** Only these are worth another attempt; a 400 or a 403 never improves. */
const RETRYABLE: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  "rate_limited",
  "server_busy",
  "offline",
  "timeout",
]);

export function isRetryable(code: AiErrorCode): boolean {
  return RETRYABLE.has(code);
}

/**
 * Exponential, with jitter.
 *
 * The jitter matters more than it looks: without it, a page that fires two
 * requests and gets two 429s retries both at exactly the same moment, and gets
 * two more. ±25% is enough to break that up.
 */
export function backoffMs(attempt: number, rng: Rng): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return Math.round(base * (0.75 + rng() * 0.5));
}

/**
 * How long to wait before the next attempt, or null to give up.
 *
 * A delay the server asked for always wins over the computed one: it knows when
 * the bucket refills and this code is guessing.
 */
export function nextDelayMs(
  code: AiErrorCode,
  attempt: number,
  retryAfterMs: number | null,
  rng: Rng,
): number | null {
  if (attempt >= MAX_ATTEMPTS - 1) return null;
  if (!isRetryable(code)) return null;
  return retryAfterMs ?? backoffMs(attempt, rng);
}

/**
 * The app's guess at the key's per-minute allowance.
 *
 * Google no longer publishes per-model rate limits, so there is nothing to look
 * up — the app has to learn. It starts conservative, halves on every 429, and
 * recovers slowly after a run of clean requests. Over a few sessions this
 * settles near whatever the key actually allows, without anyone configuring it.
 */
export const INITIAL_SOFT_RPM = 8;
const MIN_SOFT_RPM = 2;
const MAX_SOFT_RPM = 30;
/** Clean requests needed before easing back up. */
export const RECOVERY_STREAK = 20;

export function rpmAfterRateLimit(current: number): number {
  return Math.max(MIN_SOFT_RPM, Math.floor(current / 2));
}

export function rpmAfterSuccess(current: number, cleanStreak: number): number {
  if (cleanStreak < RECOVERY_STREAK) return current;
  return Math.min(MAX_SOFT_RPM, current + 1);
}

/** Minimum gap between sends, from the current guess. */
export function minGapMs(softRpm: number): number {
  return Math.round(60_000 / Math.max(1, softRpm));
}
