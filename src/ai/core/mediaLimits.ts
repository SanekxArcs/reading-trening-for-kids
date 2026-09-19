/**
 * How much media one request may carry.
 *
 * The published inline-vs-Files-API thresholds are inconsistent between doc
 * pages and are not the binding constraint anyway — **tokens per minute is**.
 * So the app sets its own ceiling well under any of them, which keeps inline
 * data always legal and means the Files API (a two-step resumable upload with
 * its own failure modes) buys nothing and is not implemented.
 */

/** Long edge after downscaling. Enough for print, small enough to be cheap. */
export const IMAGE_LONG_EDGE = 1536;

/** JPEG quality. Below this, thin serif type starts to smear. */
export const IMAGE_QUALITY = 0.8;

/**
 * Pages per call.
 *
 * Six is about one chapter spread of a picture book. More than that and both
 * the token cost and the chance of one blurred page ruining the batch climb
 * faster than the convenience is worth; the caller chunks instead.
 */
export const MAX_PAGES_PER_CALL = 6;

/** Self-imposed ceiling on one request's base64 payload. */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/** base64 is four characters for every three bytes. */
export function base64Bytes(data: string): number {
  return Math.ceil((data.length * 3) / 4);
}

export type MediaRejection = { ok: true } | { ok: false; reason: "too_many_pages" | "too_large" };

export function checkImageBatch(parts: readonly { data: string }[]): MediaRejection {
  if (parts.length > MAX_PAGES_PER_CALL) return { ok: false, reason: "too_many_pages" };
  const total = parts.reduce((sum, part) => sum + base64Bytes(part.data), 0);
  if (total > MAX_REQUEST_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true };
}

/** Splits a run of pages into calls that each stay inside the limits. */
export function chunkPages<T>(pages: readonly T[], perCall = MAX_PAGES_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < pages.length; i += perCall) {
    out.push(pages.slice(i, i + perCall));
  }
  return out;
}

/**
 * Audio bills at roughly 32 tokens a second.
 *
 * One minute is about 1,920 input tokens, so a five-minute read-aloud is the
 * heaviest request this app makes by an order of magnitude — heavier than a
 * week of question sets. Hence a soft warning where a session stops being
 * reasonable and a hard stop where it stops being affordable.
 */
export const AUDIO_TOKENS_PER_SECOND = 32;

/** Past this, warn the parent. A child does not read one passage this long. */
export const AUDIO_WARN_SECONDS = 5 * 60;

/** Past this, refuse: the recorder was left running. */
export const AUDIO_MAX_SECONDS = 10 * 60;

export type AudioCheck =
  { ok: true; warn: boolean; approxTokens: number } | { ok: false; reason: "too_long" | "silent" };

export function checkAudio(durationMs: number): AudioCheck {
  const seconds = durationMs / 1000;
  // Under a second is a misfire — a tapped button, not a reading.
  if (seconds < 1) return { ok: false, reason: "silent" };
  if (seconds > AUDIO_MAX_SECONDS) return { ok: false, reason: "too_long" };
  return {
    ok: true,
    warn: seconds > AUDIO_WARN_SECONDS,
    approxTokens: Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND),
  };
}
