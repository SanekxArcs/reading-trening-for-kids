// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { quotaLimits, toAiError } from "./gemini/map.ts";
import { DAILY_QUOTA_BODY } from "./__fixtures__/questionSets.ts";
import { limitsFor } from "./core/modelLimits.ts";
import { noteObservedLimit, readObservedLimit, forgetObservedLimits } from "./runtime/quota.ts";

const RPM_BODY = {
  error: {
    code: 429,
    message: "You exceeded your current quota.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel", quotaValue: "15" }],
      },
    ],
  },
};

beforeEach(() => localStorage.clear());

describe("quotaLimits", () => {
  /**
   * The point of the whole exercise: a refusal is the only place the API ever
   * states what this key is allowed, now that the docs publish nothing.
   */
  it("reads the daily allowance out of a refusal", () => {
    expect(quotaLimits(DAILY_QUOTA_BODY)).toEqual({ rpd: 500 });
  });

  it("tells a per-minute quota from a per-day one", () => {
    expect(quotaLimits(RPM_BODY)).toEqual({ rpm: 15 });
  });

  it("says nothing when the refusal carried no number", () => {
    expect(
      quotaLimits({
        error: { code: 429, message: "slow down", status: "RESOURCE_EXHAUSTED", details: [] },
      }),
    ).toEqual({});
  });

  it("ignores a value that is not a usable number", () => {
    expect(
      quotaLimits({
        error: {
          code: 429,
          message: "",
          status: "RESOURCE_EXHAUSTED",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "RequestsPerDay", quotaValue: "unlimited" }],
            },
          ],
        },
      }),
    ).toEqual({});
  });
});

describe("toAiError", () => {
  it("carries the stated allowance on the error itself", () => {
    expect(toAiError(429, DAILY_QUOTA_BODY, null).quota).toEqual({ rpd: 500 });
  });

  it("leaves it null when nothing was stated", () => {
    expect(toAiError(500, null, null).quota).toBeNull();
  });
});

describe("the observed-limit store", () => {
  it("remembers what a model was told, per model", () => {
    noteObservedLimit("gemini-3.8-flash", { rpd: 40 });
    expect(readObservedLimit("gemini-3.8-flash")?.rpd).toBe(40);
    expect(readObservedLimit("gemini-3.5-flash-lite")).toBeNull();
  });

  /**
   * A per-minute refusal and a per-day one arrive separately and each names
   * only its own quota, so the second must not erase the first.
   */
  it("merges a later refusal with what was already known", () => {
    noteObservedLimit("m", { rpd: 40 });
    noteObservedLimit("m", { rpm: 9 });

    expect(readObservedLimit("m")).toMatchObject({ rpd: 40, rpm: 9 });
  });

  it("ignores a refusal that carried no numbers", () => {
    noteObservedLimit("m", {});
    expect(readObservedLimit("m")).toBeNull();
  });

  /** What the API said beats the built-in estimate, from then on. */
  it("overrides the estimate once the API has spoken", () => {
    expect(limitsFor("gemini-3.8-flash", readObservedLimit("gemini-3.8-flash"))).toMatchObject({
      rpd: 20,
      source: "estimated",
    });

    noteObservedLimit("gemini-3.8-flash", { rpd: 250 });

    expect(limitsFor("gemini-3.8-flash", readObservedLimit("gemini-3.8-flash"))).toMatchObject({
      rpd: 250,
      source: "observed",
    });
  });

  /** A new key can be on a different tier, so its predecessor's numbers go. */
  it("forgets everything when asked", () => {
    noteObservedLimit("m", { rpd: 40 });
    forgetObservedLimits();
    expect(readObservedLimit("m")).toBeNull();
  });

  it("survives rubbish in storage", () => {
    localStorage.setItem("read_master_quota", "not json");
    expect(readObservedLimit("m")).toBeNull();
    noteObservedLimit("m", { rpd: 5 });
    expect(readObservedLimit("m")?.rpd).toBe(5);
  });
});
