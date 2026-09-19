/**
 * How long an answer took — and what to do when that number is nonsense.
 *
 * A response time is only meaningful while the child is actually looking at the
 * question. They are seven: they wander off, the tablet is taken away
 * mid-question, the screen locks. Whatever comes back is not thinking time.
 *
 * Two separate defences, and both are needed:
 *
 *  - the game stops the clock when the tab goes away, so the common case never
 *    produces a bad number in the first place;
 *  - this cap catches everything else — a screen left on across a lunch break,
 *    a wrong clock, an old build — so a single abandoned question cannot drag
 *    a fact's average response time from four seconds to four minutes and leave
 *    the parent's dashboard wrong for good.
 */

/**
 * Anything past two minutes is recorded as two minutes.
 *
 * Long enough that no real attempt is ever truncated — the slowest honest
 * answer to "7 × 8", counted out loud on fingers, is well under a minute — and
 * short enough that an abandoned question is a single slow answer in the
 * averages rather than an outlier that swamps them.
 */
export const MAX_ATTEMPT_MS = 120_000;

/**
 * The only way a response time is allowed into a record.
 *
 * A time that makes no sense — not a number, or negative because the device
 * clock moved backwards mid-question — is recorded as the cap rather than as
 * zero. Both are wrong, but they are not equally wrong: zero reads as an
 * instant, confident answer, which earns speed credit and can quietly retire a
 * fact the child has never actually shown they know. The cap only makes the
 * app keep practising something, which costs nothing but a few questions.
 */
export function clampAttemptMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return MAX_ATTEMPT_MS;
  return Math.min(Math.round(ms), MAX_ATTEMPT_MS);
}
