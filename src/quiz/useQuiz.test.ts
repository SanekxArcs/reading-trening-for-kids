// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { REVEAL_MS, useQuiz } from "./useQuiz.ts";
import type { Question } from "@/engine";

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    type: "literal",
    tier: "easy",
    sentenceIndex: 0,
    prompt: "Хто побіг до лісу?",
    canonicalAnswer: "лисиця",
    acceptableAnswers: ["лисиця"],
    gradingMode: "exact-ish",
    rationale: "",
    ...overrides,
  };
}

function setup(questions: Question[], onFinish = vi.fn()) {
  const view = renderHook(() => useQuiz({ questions, lang: "uk", level: "developing", onFinish }));
  return { ...view, onFinish };
}

/** Types an answer and submits it, then lets the reveal elapse. */
function answer(result: { current: ReturnType<typeof useQuiz> }, value: string) {
  act(() => result.current.setTyped(value));
  act(() => result.current.submit());
  act(() => void vi.advanceTimersByTime(REVEAL_MS + 10));
}

describe("useQuiz", () => {
  it("asks one question at a time, in order", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    expect(result.current.question?.id).toBe("a");
    expect(result.current.state.index).toBe(0);

    answer(result, "лисиця");
    expect(result.current.question?.id).toBe("b");
    vi.useRealTimers();
  });

  it("accepts a typo and a wrong case as correct", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    answer(result, "Лисицю");
    expect(result.current.state.answers[0]?.verdict).toBe("correct");
    vi.useRealTimers();
  });

  it("records a wrong answer as wrong", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    answer(result, "будинок");
    expect(result.current.state.answers[0]?.verdict).toBe("incorrect");
    vi.useRealTimers();
  });

  /**
   * The rule that keeps the score honest. An answer nobody has judged is not a
   * mistake, so it must not cost points a later verdict would have to refund.
   */
  it("neither scores nor penalises an answer it could not judge", () => {
    vi.useFakeTimers();
    const { result } = setup([
      question("a", { gradingMode: "semantic", acceptableAnswers: ["про дружбу"] }),
      question("b"),
    ]);

    answer(result, "щось зовсім інше");
    expect(result.current.state.answers[0]?.verdict).toBe("unsure");
    expect(result.current.state.score.rawPoints).toBe(0);
    expect(result.current.state.score.wrong).toBe(0);
    expect(result.current.state.score.correct).toBe(0);
    vi.useRealTimers();
  });

  it("gives a hinted answer no points but still counts it", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    act(() => result.current.toggleHint());
    answer(result, "лисиця");

    expect(result.current.state.answers[0]?.verdict).toBe("correct");
    expect(result.current.state.answers[0]?.usedHint).toBe(true);
    expect(result.current.state.score.rawPoints).toBe(0);
    expect(result.current.state.score.correct).toBe(1);
    vi.useRealTimers();
  });

  /**
   * The bug this replaces: the open sentence was component state and nothing
   * ever closed it, so one hint handed the child the proving sentence for every
   * question after it — and a quiz showing the answer measures nothing.
   */
  it("closes the hint again on the next question", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    act(() => result.current.toggleHint());
    expect(result.current.state.hintOpen).toBe(true);

    answer(result, "лисиця");

    expect(result.current.state.index).toBe(1);
    expect(result.current.state.hintOpen).toBe(false);
    expect(result.current.state.usedHint).toBe(false);
    vi.useRealTimers();
  });

  it("hides the sentence again without refunding the points", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    act(() => result.current.toggleHint());
    act(() => result.current.toggleHint());

    expect(result.current.state.hintOpen).toBe(false);
    // They cannot unsee it, so the answer is still a hinted one.
    expect(result.current.state.usedHint).toBe(true);

    answer(result, "лисиця");
    expect(result.current.state.answers[0]?.usedHint).toBe(true);
    expect(result.current.state.score.rawPoints).toBe(0);
    vi.useRealTimers();
  });

  it("measures each answer separately", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    act(() => void vi.advanceTimersByTime(5_000));
    answer(result, "лисиця");
    act(() => void vi.advanceTimersByTime(11_000));
    answer(result, "лисиця");

    const [first, second] = result.current.state.answers;
    expect(first!.ms).toBeGreaterThanOrEqual(5_000);
    expect(second!.ms).toBeGreaterThanOrEqual(11_000);
    expect(second!.ms).toBeGreaterThan(first!.ms);
    vi.useRealTimers();
  });

  it("ignores input while the answer is being revealed", () => {
    vi.useFakeTimers();
    const { result } = setup([question("a"), question("b")]);

    act(() => result.current.setTyped("лисиця"));
    act(() => result.current.submit());
    // Mid-reveal: a second submit must not record a second answer.
    act(() => result.current.submit());
    act(() => result.current.setTyped("щось інше"));

    expect(result.current.state.answers).toHaveLength(1);
    vi.useRealTimers();
  });

  it("finishes once, with every answer", () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const { result } = setup([question("a"), question("b")], onFinish);

    answer(result, "лисиця");
    answer(result, "лисиця");

    expect(result.current.state.phase).toBe("finished");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[0]).toHaveLength(2);
    vi.useRealTimers();
  });

  it("finishes immediately when there are no questions at all", () => {
    const onFinish = vi.fn();
    setup([], onFinish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
