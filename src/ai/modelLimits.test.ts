import { describe, expect, it } from "vitest";
import {
  dailyBudget,
  estimatedLimits,
  isRecommended,
  limitsFor,
  modelGeneration,
} from "./core/modelLimits.ts";

describe("modelGeneration", () => {
  it("reads the family out of the id", () => {
    expect(modelGeneration("gemini-3.8-flash")).toBe(308);
    expect(modelGeneration("gemini-3-flash")).toBe(300);
    // Major times a hundred plus minor: 2.5 is 205, which is below 3.0 at 300.
    expect(modelGeneration("gemini-2.5-flash-lite")).toBe(205);
  });

  it("gives up on something it has never seen rather than guessing", () => {
    expect(modelGeneration("some-other-model")).toBe(0);
  });
});

describe("estimatedLimits", () => {
  /**
   * The spread that matters: the newest Flash models are throttled hard on the
   * free tier while Flash-Lite stays generous, which is why this app prefers
   * Flash-Lite and why a parent needs to be told before they pick.
   */
  it("knows Flash-Lite is the one a family can actually read with", () => {
    expect(estimatedLimits("gemini-3.5-flash-lite")?.rpd).toBe(500);
    expect(estimatedLimits("gemini-3.8-flash")?.rpd).toBe(20);
  });

  it("matches the most specific band, not the first that looks close", () => {
    // "flash-lite" also contains "flash"; the lite band has to win.
    expect(estimatedLimits("gemini-3.1-flash-lite")?.rpd).toBe(500);
  });

  it("says nothing about a model it does not recognise", () => {
    expect(estimatedLimits("llama-4-quick")).toBeNull();
  });

  it("marks its own numbers as estimates", () => {
    expect(estimatedLimits("gemini-3.8-flash")?.source).toBe("estimated");
  });
});

describe("limitsFor", () => {
  /** What the API says beats what this file thinks, permanently. */
  it("prefers the figure the API stated over the estimate", () => {
    const limits = limitsFor("gemini-3.8-flash", { rpd: 50, at: 1 });
    expect(limits).toMatchObject({ rpd: 50, source: "observed" });
  });

  it("keeps the estimate for the half the API did not mention", () => {
    const limits = limitsFor("gemini-3.8-flash", { rpd: 50, at: 1 });
    expect(limits?.rpm).toBe(10);
  });

  it("ignores an empty observation rather than zeroing the limits", () => {
    expect(limitsFor("gemini-3.8-flash", { at: 1 })?.source).toBe("estimated");
  });

  it("can report an observed limit for a model it has no estimate for", () => {
    expect(limitsFor("llama-4-quick", { rpd: 7, at: 1 })).toMatchObject({ rpd: 7, rpm: 0 });
  });
});

describe("isRecommended", () => {
  it("keeps the Gemini 3 Flash families and nothing older", () => {
    expect(isRecommended("gemini-3.8-flash")).toBe(true);
    expect(isRecommended("gemini-3.5-flash-lite")).toBe(true);
    expect(isRecommended("gemini-2.5-flash")).toBe(false);
    expect(isRecommended("gemini-3-pro")).toBe(false);
  });
});

describe("dailyBudget", () => {
  /**
   * Which limit binds decides what a parent should do about it: raise your own
   * cap, or switch model. Without that, they have to guess.
   */
  it("names the model when the model is the tighter of the two", () => {
    const budget = dailyBudget(5, 50, { rpm: 10, rpd: 20, source: "estimated" });
    expect(budget).toMatchObject({ limit: 20, binding: "model", remaining: 15 });
  });

  it("names the parent when their own cap is tighter", () => {
    const budget = dailyBudget(5, 50, { rpm: 15, rpd: 500, source: "estimated" });
    expect(budget).toMatchObject({ limit: 50, binding: "parent", remaining: 45 });
  });

  it("falls back to the parent's cap when the model is unknown", () => {
    expect(dailyBudget(5, 50, null)).toMatchObject({ limit: 50, binding: "parent" });
  });

  /** An approximate figure must be shown as one, but only when it is the one biting. */
  it("flags an estimate only while it is the binding limit", () => {
    expect(dailyBudget(0, 50, { rpm: 10, rpd: 20, source: "estimated" }).approximate).toBe(true);
    expect(dailyBudget(0, 50, { rpm: 10, rpd: 20, source: "observed" }).approximate).toBe(false);
    expect(dailyBudget(0, 10, { rpm: 10, rpd: 20, source: "estimated" }).approximate).toBe(false);
  });

  it("never reports a negative remainder", () => {
    expect(dailyBudget(90, 50, null).remaining).toBe(0);
  });
});
