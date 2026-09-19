import { describe, expect, it } from "vitest";
import type { Question } from "@/engine";
import {
  blankQuestion,
  editQuestion,
  formatAnswers,
  isOwnQuestion,
  isUsable,
  parseAnswers,
  readyToApprove,
  removeQuestion,
} from "./reviewEdits.ts";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q0-1",
    type: "literal",
    tier: "easy",
    sentenceIndex: 1,
    prompt: "Кого побачила лисиця?",
    canonicalAnswer: "журавля",
    acceptableAnswers: ["журавля", "журавель"],
    gradingMode: "exact-ish",
    rationale: "Речення 1 називає журавля.",
    ...overrides,
  };
}

describe("parseAnswers", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseAnswers("журавля, журавель\nптаха; лелеку")).toEqual([
      "журавля",
      "журавель",
      "птаха",
      "лелеку",
    ]);
  });

  /** A child never types the full stop, so an answer ending in one never matches. */
  it("drops trailing punctuation and blank entries", () => {
    expect(parseAnswers("журавля., , журавель!")).toEqual(["журавля", "журавель"]);
  });

  it("keeps the first spelling of a repeated answer", () => {
    expect(parseAnswers("Журавля, журавля,  ЖУРАВЛЯ ")).toEqual(["Журавля"]);
  });

  it("survives a field the parent emptied", () => {
    expect(parseAnswers("   ")).toEqual([]);
  });

  it("round-trips through the field", () => {
    const answers = ["журавля", "журавель"];
    expect(parseAnswers(formatAnswers(answers))).toEqual(answers);
  });
});

describe("editQuestion", () => {
  it("touches only the question asked for", () => {
    const set = [question(), question({ id: "q1-2", prompt: "Де це було?" })];
    const edited = editQuestion(set, "q1-2", { prompt: "Де саме?" });

    expect(edited[0]).toBe(set[0]);
    expect(edited[1]?.prompt).toBe("Де саме?");
  });

  /**
   * The first accepted answer is the one the result screen shows the child as
   * "the answer", so the order the parent typed them in is meaningful.
   */
  it("makes the first accepted answer the canonical one", () => {
    const edited = editQuestion([question()], "q0-1", { answers: ["птах", "журавель"] });

    expect(edited[0]?.canonicalAnswer).toBe("птах");
    expect(edited[0]?.acceptableAnswers).toEqual(["птах", "журавель"]);
  });

  it("leaves the old answer standing when the parent clears the field", () => {
    // Clearing every answer must not leave a question with nothing to match
    // against; the screen refuses to approve it instead.
    const edited = editQuestion([question()], "q0-1", { answers: [] });

    expect(edited[0]?.canonicalAnswer).toBe("журавля");
    expect(isUsable(edited[0] as Question)).toBe(false);
  });

  it("can re-point a question at another sentence", () => {
    expect(editQuestion([question()], "q0-1", { sentenceIndex: 4 })[0]?.sentenceIndex).toBe(4);
  });
});

describe("removeQuestion", () => {
  it("removes exactly one", () => {
    const set = [question(), question({ id: "q1-2" })];
    expect(removeQuestion(set, "q0-1").map((item) => item.id)).toEqual(["q1-2"]);
  });
});

describe("blankQuestion", () => {
  it("never collides with an id the model produced", () => {
    const added = blankQuestion([question(), question({ id: "q1-2" })], 0);
    expect(added.id).not.toBe("q0-1");
    expect(isOwnQuestion(added)).toBe(true);
  });

  it("keeps counting past the ones already added", () => {
    const first = blankQuestion([question()], 0);
    const second = blankQuestion([question(), first], 1);
    expect(second.id).not.toBe(first.id);
  });

  it("starts unusable, so an empty question cannot be approved by accident", () => {
    expect(isUsable(blankQuestion([], 0))).toBe(false);
  });
});

describe("readyToApprove", () => {
  it("accepts a set where every question can be answered", () => {
    expect(readyToApprove([question(), question({ id: "q1-2" })])).toBe(true);
  });

  it("refuses a set with a half-written question in it", () => {
    expect(readyToApprove([question(), blankQuestion([], 0)])).toBe(false);
  });

  /** An empty round reads to a child as the app being broken. */
  it("refuses an empty set", () => {
    expect(readyToApprove([])).toBe(false);
  });

  it("refuses a question whose prompt is only spaces", () => {
    expect(readyToApprove([question({ prompt: "   " })])).toBe(false);
  });
});
