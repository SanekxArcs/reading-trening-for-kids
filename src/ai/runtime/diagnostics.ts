import type { AiErrorCode } from "../core/errors.ts";

/**
 * The last thing that went wrong, kept for the grown-up who has to explain it.
 *
 * The parent-facing error copy is deliberately short and actionable, which
 * makes it useless for diagnosis: "Gemini's answer couldn't be read" is the
 * same sentence whether the model returned prose, ran out of output budget
 * mid-object, or refused the text. This keeps the detail that sentence throws
 * away, in one place, so the next report starts from what actually happened.
 *
 * One entry, not a log: a list would need pruning, a UI and a decision about
 * privacy, and the one that matters is always the most recent.
 */

const KEY = "read_master_last_error";

/** Long enough to see where a JSON object stopped, short enough not to bloat. */
const MAX_DETAIL = 400;

export interface LastFailure {
  code: AiErrorCode;
  detail: string;
  /** Which kind of call it was: questions, grading, ocr… */
  label: string;
  at: number;
}

export function noteFailure(failure: Omit<LastFailure, "at">, at = Date.now()): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...failure, detail: failure.detail.slice(0, MAX_DETAIL), at }),
    );
  } catch {
    /* private mode: diagnosis is the first thing to give up, not the app */
  }
}

export function readLastFailure(): LastFailure | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Partial<LastFailure>;
    return typeof value.code === "string" && typeof value.at === "number"
      ? { code: value.code, detail: value.detail ?? "", label: value.label ?? "", at: value.at }
      : null;
  } catch {
    return null;
  }
}

export function clearLastFailure(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
