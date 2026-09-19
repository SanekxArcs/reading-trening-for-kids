// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { raisePlayerLevel, readPlayerLevel } from "./playerLevel.ts";

const KEY = "read_master_level";

beforeEach(() => localStorage.clear());

describe("player level", () => {
  it("starts at one", () => {
    expect(readPlayerLevel()).toBe(1);
  });

  it("goes up one at a time and stays up", () => {
    expect(raisePlayerLevel()).toBe(2);
    expect(raisePlayerLevel()).toBe(3);
    expect(readPlayerLevel()).toBe(3);
  });

  /** Nothing in the app lowers it: a bad round is a bad round, not a demotion. */
  it("has no way down", () => {
    raisePlayerLevel();
    expect(readPlayerLevel()).toBeGreaterThan(1);
  });

  it("ignores rubbish left in storage rather than starting at NaN", () => {
    for (const rubbish of ["", "nope", "-4", "2.5", "{}"]) {
      localStorage.setItem(KEY, rubbish);
      expect(readPlayerLevel()).toBeGreaterThanOrEqual(1);
    }
  });
});
