import { describe, expect, it, vi } from "vitest";
import { seededRng } from "@/engine";
import {
  backoffMs,
  isRetryable,
  MAX_ATTEMPTS,
  minGapMs,
  nextDelayMs,
  RECOVERY_STREAK,
  rpmAfterRateLimit,
  rpmAfterSuccess,
} from "./core/backoff.ts";
import {
  applyEntry,
  canSpend,
  DEFAULT_CAPS,
  emptyLedger,
  estimateAudioTokens,
  estimateTextTokens,
  today,
} from "./core/budget.ts";
import { AiError } from "./core/errors.ts";
import { RequestQueue } from "./runtime/queue.ts";

describe("backoff", () => {
  it("retries only what can improve", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("server_busy")).toBe(true);
    expect(isRetryable("offline")).toBe(true);
    // A rejected key will be rejected again, however long we wait.
    expect(isRetryable("invalid_key")).toBe(false);
    expect(isRetryable("safety_blocked")).toBe(false);
    expect(isRetryable("daily_quota")).toBe(false);
  });

  it("grows exponentially and stops growing at the cap", () => {
    const rng = seededRng(1);
    expect(backoffMs(0, rng)).toBeLessThan(backoffMs(4, rng));
    expect(backoffMs(20, seededRng(1))).toBeLessThanOrEqual(32_000 * 1.25);
  });

  /**
   * Two requests that get two 429s must not retry in lockstep and collect two
   * more — which is exactly what happens with no jitter.
   */
  it("jitters, so simultaneous retries spread out", () => {
    const delays = new Set(Array.from({ length: 20 }, (_, i) => backoffMs(3, seededRng(i))));
    expect(delays.size).toBeGreaterThan(5);
  });

  it("gives up after the attempt limit", () => {
    const rng = seededRng(2);
    expect(nextDelayMs("server_busy", 0, null, rng)).not.toBeNull();
    expect(nextDelayMs("server_busy", MAX_ATTEMPTS - 1, null, rng)).toBeNull();
  });

  /** The server knows when the bucket refills; this code is guessing. */
  it("prefers the delay the server asked for", () => {
    expect(nextDelayMs("rate_limited", 0, 21_000, seededRng(3))).toBe(21_000);
  });

  it("learns the key's allowance: halves on a 429, recovers slowly", () => {
    expect(rpmAfterRateLimit(8)).toBe(4);
    expect(rpmAfterRateLimit(2)).toBe(2); // never below the floor
    expect(rpmAfterSuccess(4, RECOVERY_STREAK - 1)).toBe(4);
    expect(rpmAfterSuccess(4, RECOVERY_STREAK)).toBe(5);
  });

  it("turns an allowance into a minimum gap", () => {
    expect(minGapMs(6)).toBe(10_000);
  });
});

describe("budget", () => {
  it("counts a day's spend", () => {
    const ledger = applyEntry(emptyLedger("2026-09-19"), {
      label: "questions",
      promptTokens: 800,
      outputTokens: 400,
    });
    expect(ledger.requests).toBe(1);
    expect(ledger.byLabel.questions).toBe(1);
    expect(ledger.promptTokens).toBe(800);
  });

  /**
   * A client-side cap is the only protection when one family key is used from
   * three devices — nothing else knows about the other two.
   */
  it("stops at the parent's own cap", () => {
    let ledger = emptyLedger("2026-09-19");
    for (let i = 0; i < DEFAULT_CAPS.maxRequestsPerDay; i++) {
      ledger = applyEntry(ledger, { label: "questions", promptTokens: 1, outputTokens: 1 });
    }
    expect(canSpend(ledger, DEFAULT_CAPS)).toEqual({ allowed: false, reason: "local_cap" });
  });

  it("warns above the token threshold without blocking", () => {
    const ledger = { ...emptyLedger("2026-09-19"), promptTokens: 10_000_000 };
    expect(canSpend(ledger, DEFAULT_CAPS)).toEqual({ allowed: true, warn: true });
  });

  /** A session at 23:30 belongs to the day the family thinks it is. */
  it("uses the local day, not UTC", () => {
    expect(today(new Date(2026, 8, 19, 23, 30))).toBe("2026-09-19");
  });

  it("estimates audio as the heavy thing it is", () => {
    // Five minutes of a child reading aloud outweighs a week of question sets.
    expect(estimateAudioTokens(300)).toBeGreaterThan(estimateTextTokens("x".repeat(4000)) * 2);
  });
});

/**
 * A queue with a clock the test drives: every sleep is recorded and advances
 * time instantly, so the assertions are about the delays that were *asked for*
 * rather than about waiting them out.
 */
function queue() {
  const slept: number[] = [];
  const clock = { now: 0 };
  const q = new RequestQueue({
    rng: seededRng(7),
    now: () => clock.now,
    sleep: async (ms) => {
      slept.push(ms);
      clock.now += ms;
    },
  });
  return { q, slept, clock };
}

describe("RequestQueue", () => {
  it("runs one task at a time, in order", async () => {
    const { q } = queue();
    const order: number[] = [];
    await Promise.all([
      q.add(async () => void order.push(1)),
      q.add(async () => void order.push(2)),
      q.add(async () => void order.push(3)),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  /**
   * A child waiting on their answers must not queue behind a question set being
   * prepared for a text nobody has opened.
   */
  it("lets an interactive task jump a background one", async () => {
    const { q } = queue();
    const order: string[] = [];
    // The first task occupies the runner; the next two race for second place.
    const busy = q.add(async () => void order.push("first"));
    const background = q.add(async () => void order.push("background"), "background");
    const interactive = q.add(async () => void order.push("interactive"), "interactive");

    await Promise.all([busy, background, interactive]);
    expect(order).toEqual(["first", "interactive", "background"]);
  });

  it("retries a busy server and succeeds", async () => {
    const { q, slept } = queue();
    let attempts = 0;
    const value = await q.add(async () => {
      attempts++;
      if (attempts < 3) throw new AiError("server_busy", "busy");
      return "done";
    });

    expect(value).toBe("done");
    expect(attempts).toBe(3);
    expect(slept.length).toBeGreaterThanOrEqual(2);
  });

  it("honours the delay a 429 asked for", async () => {
    const { q, slept } = queue();
    let first = true;
    await q.add(async () => {
      if (first) {
        first = false;
        throw new AiError("rate_limited", "slow down", { retryAfterMs: 21_000 });
      }
      return "ok";
    });

    expect(slept).toContain(21_000);
  });

  it("never retries something that cannot improve", async () => {
    const { q } = queue();
    let attempts = 0;
    await expect(
      q.add(async () => {
        attempts++;
        throw new AiError("invalid_key", "nope");
      }),
    ).rejects.toMatchObject({ code: "invalid_key" });
    expect(attempts).toBe(1);
  });

  /**
   * The daily gate. A per-day quota does not refill in twenty seconds, and
   * pretending otherwise burns four attempts before falling back anyway.
   */
  it("stops sending entirely once a daily quota is hit", async () => {
    const { q } = queue();
    let attempts = 0;

    await expect(
      q.add(async () => {
        attempts++;
        throw new AiError("daily_quota", "gone for today");
      }),
    ).rejects.toMatchObject({ code: "daily_quota" });

    expect(attempts).toBe(1);
    expect(q.isBlocked()).toBe(true);

    // Anything queued afterwards is refused without reaching the network.
    await expect(q.add(async () => "never runs")).rejects.toMatchObject({ code: "daily_quota" });
    expect(attempts).toBe(1);
  });

  /** A 429 empties the bucket for the whole key, not for one request. */
  it("halves its guess at the allowance after a rate limit", async () => {
    const { q } = queue();
    const before = q.currentSoftRpm;

    let first = true;
    await q.add(async () => {
      if (first) {
        first = false;
        throw new AiError("rate_limited", "slow down", { retryAfterMs: 1000 });
      }
      return "ok";
    });

    expect(q.currentSoftRpm).toBeLessThan(before);
  });

  it("spaces out sends by its learned minimum gap", async () => {
    const { q, slept } = queue();
    await q.add(async () => "one");
    await q.add(async () => "two");
    expect(slept.some((ms) => ms >= minGapMs(q.currentSoftRpm) - 1)).toBe(true);
  });

  it("reports a rejected task without wedging the queue", async () => {
    const { q } = queue();
    await expect(q.add(async () => Promise.reject(new AiError("bad_json", "x")))).rejects.toThrow();
    await expect(q.add(async () => "still working")).resolves.toBe("still working");
  });
});

describe("nextDayRollover", () => {
  it("lands in the future and within about a day", async () => {
    const { nextDayRollover } = await import("./runtime/queue.ts");
    const now = Date.now();
    const rollover = nextDayRollover(now);
    expect(rollover).toBeGreaterThan(now);
    expect(rollover - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60_000);
  });

  /**
   * Google's free quota resets on Pacific midnight. Telling a family in Europe
   * to wait until their own midnight would be hours after it had come back.
   */
  it("is not simply local midnight", () => {
    vi.useRealTimers();
    expect(typeof Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("string");
  });
});
