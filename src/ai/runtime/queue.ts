import { defaultRng, type Rng } from "@/engine";
import {
  INITIAL_SOFT_RPM,
  minGapMs,
  nextDelayMs,
  rpmAfterRateLimit,
  rpmAfterSuccess,
} from "../core/backoff.ts";
import { asAiError, AiError } from "../core/errors.ts";

/**
 * One request at a time, and two gates that stop the app making a bad situation
 * worse.
 *
 * **The cooldown gate.** A 429 means the bucket is empty for the whole key, not
 * for the request that happened to hit it. Retrying request B the instant A was
 * rate-limited just burns another slot. So a 429 pauses everything queued.
 *
 * **The daily gate.** A per-day quota does not refill in twenty seconds.
 * Recognising it and stopping means the offline path engages immediately,
 * rather than after four increasingly slow failures.
 */

export interface QueueOptions {
  rng?: Rng;
  /** Injected in tests so waits are instant. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Waiter {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  priority: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RequestQueue {
  private readonly rng: Rng;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private queue: Waiter[] = [];
  private running = false;

  /** Nothing is sent before this instant. Set by a 429. */
  private cooldownUntil = 0;
  /** Set when a per-day quota is hit; nothing is sent until it passes. */
  private blockedUntil = 0;
  private lastSentAt = 0;

  /** The app's running guess at what this key allows. */
  private softRpm = INITIAL_SOFT_RPM;
  private cleanStreak = 0;

  constructor(options: QueueOptions = {}) {
    this.rng = options.rng ?? defaultRng;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
  }

  /**
   * Forgets everything learned and everything waiting.
   *
   * Exists for tests: the app has one queue for one key, and a test that sent a
   * request would otherwise leave the next one waiting out the minimum gap.
   * Also the right thing to call if the parent swaps the key, since the learned
   * allowance belonged to the old one.
   */
  reset(): void {
    this.queue = [];
    this.cooldownUntil = 0;
    this.blockedUntil = 0;
    this.lastSentAt = 0;
    this.softRpm = INITIAL_SOFT_RPM;
    this.cleanStreak = 0;
  }

  /** True while a daily quota is known to be exhausted. */
  isBlocked(): boolean {
    return this.now() < this.blockedUntil;
  }

  blockedUntilMs(): number {
    return this.blockedUntil;
  }

  get currentSoftRpm(): number {
    return this.softRpm;
  }

  /**
   * Runs `task` when the queue gets to it, retrying what is worth retrying.
   *
   * `interactive` jumps ahead of `background`: a child waiting on their answers
   * being checked must not queue behind a question set being prepared for a
   * text nobody has opened yet.
   */
  add<T>(
    task: () => Promise<T>,
    priority: "interactive" | "background" = "interactive",
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority: priority === "interactive" ? 0 : 1,
      });
      this.queue.sort((a, b) => a.priority - b.priority);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const waiter = this.queue.shift() as Waiter;

        if (this.isBlocked()) {
          waiter.reject(new AiError("daily_quota", "the daily quota is exhausted"));
          continue;
        }

        try {
          waiter.resolve(await this.runWithRetries(waiter.run));
        } catch (error) {
          waiter.reject(error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runWithRetries(run: () => Promise<unknown>): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      await this.waitForSlot();

      try {
        const value = await run();
        this.lastSentAt = this.now();
        this.cleanStreak++;
        this.softRpm = rpmAfterSuccess(this.softRpm, this.cleanStreak);
        return value;
      } catch (error) {
        this.lastSentAt = this.now();
        const aiError = asAiError(error);
        this.cleanStreak = 0;

        if (aiError.code === "daily_quota") {
          this.blockedUntil = nextDayRollover(this.now());
          throw aiError;
        }

        if (aiError.code === "rate_limited") {
          this.softRpm = rpmAfterRateLimit(this.softRpm);
          // Everything queued waits, not just this one.
          this.cooldownUntil = this.now() + (aiError.retryAfterMs ?? minGapMs(this.softRpm));
        }

        const delay = nextDelayMs(aiError.code, attempt, aiError.retryAfterMs, this.rng);
        if (delay === null) throw aiError;
        await this.sleep(delay);
      }
    }
  }

  /** Honours the cooldown and the learned minimum gap between sends. */
  private async waitForSlot(): Promise<void> {
    const gapReady = this.lastSentAt + minGapMs(this.softRpm);
    const readyAt = Math.max(this.cooldownUntil, gapReady);
    const wait = readyAt - this.now();
    if (wait > 0) await this.sleep(wait);
  }
}

/**
 * Google's free-tier daily quota resets at Pacific midnight.
 *
 * Computed rather than assumed to be local midnight, because a family in Europe
 * would otherwise be told to wait until their own midnight — several hours
 * after the quota had already come back.
 */
export function nextDayRollover(now: number): number {
  const pacific = new Date(
    new Date(now).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const drift = now - pacific.getTime();
  const midnight = new Date(pacific);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() + drift;
}

/**
 * The app's single queue. One key, one bucket, one place that rations it.
 *
 * Reachable only through `getQueue()` so a test can install one whose sleeps
 * are instant — the real gap between sends is seconds, which is right in a
 * browser and unworkable in a suite.
 */
let current = new RequestQueue();

export function getQueue(): RequestQueue {
  return current;
}

export function setQueue(queue: RequestQueue): void {
  current = queue;
}

/** A queue that never really waits. For tests only. */
export function instantQueue(): RequestQueue {
  return new RequestQueue({ sleep: async () => {} });
}
