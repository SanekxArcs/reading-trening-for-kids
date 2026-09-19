import { useCallback, useEffect, useReducer } from "react";
import {
  applyAttempt,
  clampAttemptMs,
  FLUENT_MS,
  gradeLocally,
  INITIAL_SCORE,
  type AnswerVerdict,
  type ChildLevel,
  type LocalVerdict,
  type Question,
  type ScoreState,
  type TextLang,
} from "@/engine";

/**
 * One question at a time, the text hidden, every answer's time measured
 * separately.
 *
 * Built on the math app's `useGame` pattern: a reducer owning all state, a
 * monotonically increasing question index that owns the timers, and a `pending`
 * list that a persistence effect drains without the UI ever reading it.
 */

export interface RecordedAnswer {
  question: Question;
  given: string;
  /** What the local matcher decided. `unsure` still travels as `unsure`. */
  verdict: AnswerVerdict;
  local: LocalVerdict;
  ms: number;
  usedHint: boolean;
}

export type QuizPhase =
  /** Waiting for an answer. */
  | "asking"
  /** Showing whether it was right, briefly. */
  | "revealed"
  /** Every question answered; results are being assembled. */
  | "finished";

export interface QuizState {
  questions: Question[];
  index: number;
  phase: QuizPhase;
  /** Bumped per question; owns the answer clock. */
  askedAt: number;
  typed: string;
  /** The proving sentence is on screen for *this* question. */
  hintOpen: boolean;
  /** They looked at it for this question, whether or not it is still on screen. */
  usedHint: boolean;
  score: ScoreState;
  answers: RecordedAnswer[];
  /** What the last answer turned out to be, for the brief reveal. */
  lastVerdict: AnswerVerdict | null;
}

type Action =
  | { type: "type"; value: string }
  | { type: "hint" }
  | { type: "submit"; now: number; lang: TextLang; level: ChildLevel }
  | { type: "next"; now: number };

/** How long the right/wrong flash stays before the next question. */
export const REVEAL_MS = 900;

/**
 * Everything that belongs to one question, cleared for the next one.
 *
 * The hint lives here rather than in the screen, and that is the fix for a real
 * bug: held as component state it was never reset, so opening the sentence once
 * left it open for every question afterwards — and a quiz that shows the
 * proving sentence has stopped measuring anything.
 */
function freshQuestion(state: QuizState, now: number): QuizState {
  return {
    ...state,
    phase: "asking",
    askedAt: now,
    typed: "",
    hintOpen: false,
    usedHint: false,
    lastVerdict: null,
  };
}

function reducer(state: QuizState, action: Action): QuizState {
  switch (action.type) {
    case "type":
      return state.phase === "asking" ? { ...state, typed: action.value } : state;

    case "hint":
      // Costs the points and the combo, never the answer. See scoring.ts.
      // Closing it again does not refund anything: they cannot unsee it.
      return state.phase === "asking"
        ? { ...state, hintOpen: !state.hintOpen, usedHint: state.usedHint || !state.hintOpen }
        : state;

    case "submit": {
      if (state.phase !== "asking") return state;
      const question = state.questions[state.index];
      if (!question) return state;

      const ms = clampAttemptMs(action.now - state.askedAt);
      const local = gradeLocally(question, state.typed, action.lang);

      /**
       * `unsure` reaches the UI intact rather than being coerced.
       *
       * Whether it stays unsure depends on what happens after the quiz: with a
       * key it goes to the model in one batch, without one it becomes "a
       * grown-up will check this". Either way, guessing here would be the app
       * deciding something it does not know.
       */
      const verdict: AnswerVerdict = local.verdict === "unsure" ? "unsure" : local.verdict;

      // An unjudged answer must not move the score either. It is not a
      // mistake, and treating it as one would show a child a penalty for an
      // answer that later turns out to be right.
      const scored =
        verdict === "unsure"
          ? { state: state.score }
          : applyAttempt(state.score, {
              isCorrect: verdict === "correct",
              tier: question.tier,
              usedHint: state.usedHint,
              fast: ms < FLUENT_MS[action.level],
            });

      return {
        ...state,
        phase: "revealed",
        lastVerdict: verdict,
        score: scored.state,
        answers: [
          ...state.answers,
          { question, given: state.typed, verdict, local, ms, usedHint: state.usedHint },
        ],
      };
    }

    case "next": {
      const next = state.index + 1;
      if (next >= state.questions.length) return { ...state, phase: "finished" };
      return freshQuestion({ ...state, index: next }, action.now);
    }

    default:
      return state;
  }
}

export interface UseQuizOptions {
  questions: readonly Question[];
  lang: TextLang;
  level: ChildLevel;
  onFinish: (answers: readonly RecordedAnswer[], score: ScoreState) => void;
}

export interface Quiz {
  state: QuizState;
  question: Question | null;
  setTyped: (value: string) => void;
  /** Opens the proving sentence, or hides it again once it has been paid for. */
  toggleHint: () => void;
  submit: () => void;
}

export function useQuiz({ questions, lang, level, onFinish }: UseQuizOptions): Quiz {
  const [state, dispatch] = useReducer(reducer, questions, (initial): QuizState => ({
    questions: [...initial],
    index: 0,
    phase: initial.length === 0 ? "finished" : "asking",
    askedAt: Date.now(),
    typed: "",
    hintOpen: false,
    usedHint: false,
    score: INITIAL_SCORE,
    answers: [],
    lastVerdict: null,
  }));

  // Advance after the reveal. Keyed on the question index so a re-render
  // mid-reveal cannot schedule a second advance.
  useEffect(() => {
    if (state.phase !== "revealed") return;
    const handle = setTimeout(() => dispatch({ type: "next", now: Date.now() }), REVEAL_MS);
    return () => clearTimeout(handle);
  }, [state.phase, state.index]);

  useEffect(() => {
    if (state.phase === "finished") onFinish(state.answers, state.score);
    // Deliberately keyed on the phase alone: this must fire exactly once, and
    // `answers` is frozen by the time it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const setTyped = useCallback((value: string) => dispatch({ type: "type", value }), []);
  const toggleHint = useCallback(() => dispatch({ type: "hint" }), []);
  const submit = useCallback(
    () => dispatch({ type: "submit", now: Date.now(), lang, level }),
    [lang, level],
  );

  return { state, question: state.questions[state.index] ?? null, setTyped, toggleHint, submit };
}
