import type { TranslationKey } from "@/i18n/translations";

/**
 * Everything that can go wrong between this app and a model, named.
 *
 * The taxonomy exists so that two different audiences can be told two
 * different things about the same failure. A parent needs to know that their
 * key has a referrer restriction; a child needs to know that today they are
 * reading without questions. Collapsing those into one "error" string is how
 * an app ends up showing a seven-year-old the words "quota exceeded".
 */
export type AiErrorCode =
  | "no_key"
  | "invalid_key"
  | "key_restricted"
  | "rate_limited"
  | "daily_quota"
  | "local_cap"
  | "server_busy"
  | "offline"
  | "timeout"
  | "aborted"
  | "bad_json"
  | "safety_blocked"
  | "recitation_blocked"
  | "empty_response"
  | "model_unavailable"
  | "payload_too_large"
  | "unknown";

export const AI_ERROR_CODES: readonly AiErrorCode[] = [
  "no_key",
  "invalid_key",
  "key_restricted",
  "rate_limited",
  "daily_quota",
  "local_cap",
  "server_busy",
  "offline",
  "timeout",
  "aborted",
  "bad_json",
  "safety_blocked",
  "recitation_blocked",
  "empty_response",
  "model_unavailable",
  "payload_too_large",
  "unknown",
];

/** What the app does instead, when this happens. */
export type Degradation =
  /** Fall back to the offline generator. */
  | "local_questions"
  /** Grade with the local cascade alone; the rest become "a grown-up will check". */
  | "local_grading"
  /** Play whatever is already cached, and do not call again. */
  | "cached_only"
  /** Worth another attempt shortly. */
  | "retry"
  /** Nothing to do; the caller cancelled. */
  | "none";

export interface AiErrorInfo {
  retryable: boolean;
  /** Actionable, specific, and shown only where a grown-up can see it. */
  parentKey: Extract<TranslationKey, `err${string}`>;
  /**
   * One of exactly three things a child is ever told. None of them mentions an
   * API, a key, a quota or a model, because none of those is something a child
   * can act on — and "you did something wrong" is what they would hear.
   */
  childKey: "childQuestionsUnavailable" | "childCheckLater" | "childTryAgain";
  degradeTo: Degradation;
}

const INFO: Record<AiErrorCode, AiErrorInfo> = {
  no_key: {
    retryable: false,
    parentKey: "errNoKey",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  invalid_key: {
    retryable: false,
    parentKey: "errInvalidKey",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  key_restricted: {
    retryable: false,
    parentKey: "errKeyRestricted",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  rate_limited: {
    retryable: true,
    parentKey: "errRateLimited",
    childKey: "childTryAgain",
    degradeTo: "retry",
  },
  daily_quota: {
    retryable: false,
    parentKey: "errDailyQuota",
    childKey: "childQuestionsUnavailable",
    degradeTo: "cached_only",
  },
  local_cap: {
    retryable: false,
    parentKey: "errLocalCap",
    childKey: "childQuestionsUnavailable",
    degradeTo: "cached_only",
  },
  server_busy: {
    retryable: true,
    parentKey: "errServerBusy",
    childKey: "childTryAgain",
    degradeTo: "retry",
  },
  offline: {
    retryable: true,
    parentKey: "errOffline",
    childKey: "childQuestionsUnavailable",
    degradeTo: "cached_only",
  },
  timeout: {
    retryable: true,
    parentKey: "errTimeout",
    childKey: "childTryAgain",
    degradeTo: "retry",
  },
  aborted: {
    retryable: false,
    parentKey: "errUnknown",
    childKey: "childTryAgain",
    degradeTo: "none",
  },
  bad_json: {
    retryable: false,
    parentKey: "errBadJson",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  safety_blocked: {
    retryable: false,
    parentKey: "errSafetyBlocked",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  /**
   * The failure a parent would otherwise waste an evening on.
   *
   * A photographed page of an in-copyright children's book is exactly the input
   * that trips this, and "unknown error" would send them looking for a bug that
   * is not there. The message has to name what happened.
   */
  recitation_blocked: {
    retryable: false,
    parentKey: "errRecitationBlocked",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  empty_response: {
    retryable: true,
    parentKey: "errEmptyResponse",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  model_unavailable: {
    retryable: false,
    parentKey: "errModelUnavailable",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  payload_too_large: {
    retryable: false,
    parentKey: "errPayloadTooLarge",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
  unknown: {
    retryable: false,
    parentKey: "errUnknown",
    childKey: "childQuestionsUnavailable",
    degradeTo: "local_questions",
  },
};

export function errorInfo(code: AiErrorCode): AiErrorInfo {
  return INFO[code];
}

/** What a quota failure said this key is allowed. Both halves are optional. */
export interface QuotaAllowance {
  rpm?: number;
  rpd?: number;
}

export interface AiErrorOptions {
  status?: number | undefined;
  retryAfterMs?: number | undefined;
  quota?: QuotaAllowance | undefined;
}

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;
  /** Raw provider text. Parent diagnostics only; never rendered by default. */
  readonly detail: string;
  /**
   * The allowance the provider stated while refusing.
   *
   * A 429 is the one moment the API says what the limit actually is, and it is
   * the only authoritative source left — so it is recorded rather than thrown
   * away with the rest of the failure.
   */
  readonly quota: QuotaAllowance | null;

  constructor(code: AiErrorCode, detail: string, options: AiErrorOptions = {}) {
    super(`${code}: ${detail}`);
    this.name = "AiError";
    this.code = code;
    this.detail = detail;
    this.httpStatus = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.quota = options.quota ?? null;
  }

  get info(): AiErrorInfo {
    return errorInfo(this.code);
  }
}

export function asAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Error) return new AiError("unknown", error.message);
  return new AiError("unknown", String(error));
}
