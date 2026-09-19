import { describe, expect, it } from "vitest";
import { GRADING_CASES, type Want } from "./grading.cases.ts";
import {
  editDistance,
  fold,
  gradeLocally,
  isNear,
  MAX_ESCALATIONS,
  normalize,
  planEscalation,
  skeleton,
  similarity,
  stem,
  tokens,
  tolerance,
  type GradeItem,
  type Question,
} from "./index.ts";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q",
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

describe("normalize", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalize("  Лисиця,   побігла!  ")).toBe("лисиця побігла");
  });

  it("leaves an internal apostrophe for tokens() to handle", () => {
    expect(normalize("м'яч")).toBe("м'яч");
    expect(tokens("м'яч")).toEqual(["мяч"]);
  });
});

describe("fold", () => {
  it("removes combining diacritics", () => {
    expect(fold("żółw")).toBe("zolw");
    expect(fold("řeka")).toBe("reka");
  });

  /** ł is a single code point, so NFD alone never touches it. */
  it("handles the letters decomposition cannot reach", () => {
    expect(fold("ł")).toBe("l");
    expect(fold("Łódź")).toBe("Lodz");
  });

  it("folds Ukrainian ї to і, which is what a child types", () => {
    expect(fold("їжак")).toBe("іжак");
  });
});

describe("editDistance", () => {
  it("counts a transposition as one mistake, not two", () => {
    expect(editDistance("лисиця", "лиисця")).toBe(1);
  });

  it("counts the ordinary operations", () => {
    expect(editDistance("cat", "cut")).toBe(1);
    expect(editDistance("cat", "cats")).toBe(1);
    expect(editDistance("cats", "cat")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });

  it("stops early once the bound is exceeded", () => {
    expect(editDistance("completely", "different", 2)).toBeGreaterThan(2);
  });

  it("gives a similarity of 1 for two empty strings", () => {
    expect(similarity("", "")).toBe(1);
  });
});

describe("tolerance", () => {
  it("gives a three-letter word nothing", () => {
    expect(tolerance(3)).toBe(0);
    expect(isNear("дім", "дим")).toBe(false);
  });

  it("grows with length", () => {
    expect(tolerance(6)).toBe(1);
    expect(tolerance(10)).toBe(2);
    expect(tolerance(20)).toBeGreaterThan(2);
  });

  it("uses the longer word's tolerance, so a long guess cannot match a short answer", () => {
    expect(isNear("lis", "lisiczka")).toBe(false);
  });
});

describe("stem", () => {
  it("strips a case ending", () => {
    expect(stem("лисицю", "uk")).toBe(stem("лисиця", "uk"));
    expect(stem("lesie", "pl")).not.toBe("");
  });

  it("leaves a short word alone", () => {
    expect(stem("ліс", "uk")).toBe("ліс");
  });

  it("never strips down to fewer than three letters", () => {
    expect(stem("дома", "uk").length).toBeGreaterThanOrEqual(3);
  });

  it("maps English -ies back to -y", () => {
    expect(stem("stories", "en")).toBe("story");
  });
});

/**
 * The table-driven test the whole matcher exists to pass.
 *
 * Two aggregate assertions follow it, and they are the real contract: no false
 * "wrong" ever, and an escalation rate low enough to stay inside a free-tier
 * quota. Both are properties of the whole table rather than of any one row, so
 * a change that fixes one case by loosening everything will still fail.
 */
describe("gradeLocally against real children's answers", () => {
  it.each(
    GRADING_CASES.map(
      (c) => [`${c.lang}: "${c.typed}" for "${c.accepted[0]}" — ${c.note}`, c] as const,
    ),
  )("%s", (_label, testCase) => {
    const verdict = gradeLocally(
      question({
        acceptableAnswers: testCase.accepted,
        gradingMode: testCase.mode ?? "exact-ish",
        ...(testCase.keywords ? { requiredKeywords: testCase.keywords } : {}),
      }),
      testCase.typed,
      testCase.lang,
    );

    const got: Want = verdict.verdict === "unsure" ? "escalate" : verdict.verdict;
    expect(got).toBe(testCase.want);
  });

  /**
   * The one thing that must never regress. A child who was right and is told
   * they were wrong learns the app is unfair; a child wrongly told they were
   * right loses nothing.
   */
  it("never marks a correct answer wrong", () => {
    const falseNegatives = GRADING_CASES.filter((testCase) => {
      if (testCase.want !== "correct") return false;
      const verdict = gradeLocally(
        question({
          acceptableAnswers: testCase.accepted,
          gradingMode: testCase.mode ?? "exact-ish",
          ...(testCase.keywords ? { requiredKeywords: testCase.keywords } : {}),
        }),
        testCase.typed,
        testCase.lang,
      );
      return verdict.verdict === "incorrect";
    });

    expect(falseNegatives.map((c) => `${c.typed} (${c.note})`)).toEqual([]);
  });

  /** The quota budget, expressed as a test. */
  it("keeps the escalation rate low enough for a free-tier key", () => {
    const escalated = GRADING_CASES.filter((testCase) => {
      const verdict = gradeLocally(
        question({
          acceptableAnswers: testCase.accepted,
          gradingMode: testCase.mode ?? "exact-ish",
          ...(testCase.keywords ? { requiredKeywords: testCase.keywords } : {}),
        }),
        testCase.typed,
        testCase.lang,
      );
      return verdict.verdict === "unsure";
    });

    expect(escalated.length / GRADING_CASES.length).toBeLessThan(0.25);
  });
});

describe("gradeLocally policy", () => {
  it("never says no to a semantic question, however wrong the answer looks", () => {
    const verdict = gradeLocally(
      question({ gradingMode: "semantic", acceptableAnswers: ["про дружбу"] }),
      "нісенітниця про щось інше",
      "uk",
    );
    expect(verdict.verdict).toBe("unsure");
  });

  it("does say no to a closed question with no overlap at all", () => {
    expect(gradeLocally(question(), "будинок", "uk").verdict).toBe("incorrect");
  });

  it("accepts any listed alternative", () => {
    const q = question({ acceptableAnswers: ["лисиця", "лис", "руда лисиця"] });
    expect(gradeLocally(q, "лис", "uk").verdict).toBe("correct");
  });
});

describe("planEscalation", () => {
  function items(count: number, mode: Question["gradingMode"] = "semantic"): GradeItem[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      question: question({ id: `q${i}`, gradingMode: mode, acceptableAnswers: ["про дружбу"] }),
      answer: "щось зовсім інше без спільних слів",
    }));
  }

  it("resolves what it can and escalates the rest", () => {
    const plan = planEscalation(
      [
        { id: "a", question: question(), answer: "лисиця" },
        { id: "b", question: question({ gradingMode: "semantic" }), answer: "геть інше" },
      ],
      "uk",
      true,
    );
    expect(plan.resolved.get("a")?.verdict).toBe("correct");
    expect(plan.escalate).toEqual(["b"]);
  });

  it("caps how many answers one session can send", () => {
    const plan = planEscalation(items(20), "uk", true);
    expect(plan.escalate).toHaveLength(MAX_ESCALATIONS);
    // Nothing is lost: the overflow is still resolved, as "unsure".
    expect(plan.resolved.size + plan.escalate.length).toBe(20);
  });

  it("sends semantic questions first, since they are the disputable ones", () => {
    const mixed: GradeItem[] = [
      ...items(MAX_ESCALATIONS, "exact-ish").map((item) => ({
        ...item,
        id: `e${item.id}`,
        question: { ...item.question, acceptableAnswers: ["лисиця руда"] },
        answer: "лисиця синя",
      })),
      ...items(2, "semantic").map((item) => ({ ...item, id: `s${item.id}` })),
    ];
    const plan = planEscalation(mixed, "uk", true);
    expect(plan.escalate.filter((id) => id.startsWith("s"))).toHaveLength(2);
  });

  /**
   * With no key, no quota or no signal, nothing is silently marked wrong.
   * "unsure" survives to the UI as "a grown-up will check this".
   */
  it("marks nothing wrong when there is nobody to ask", () => {
    const plan = planEscalation(items(3), "uk", false);
    expect(plan.escalate).toEqual([]);
    for (const verdict of plan.resolved.values()) {
      expect(verdict.verdict).not.toBe("incorrect");
    }
  });
});

/**
 * The skeleton is what stands between a child who was right and a confident
 * "wrong": the local matcher may only refuse an answer whose consonants also
 * fail to line up. That makes the vowel list load-bearing — a vowel missing
 * from it becomes a consonant, and two words that differ only in that letter
 * start looking like different words.
 */
describe("skeleton", () => {
  it("drops the vowels of every alphabet the app reads", () => {
    expect(skeleton("лисиця")).toBe("лсц");
    expect(skeleton("бачила")).toBe("бчл");
    // Folded to bare Latin first, so the diacritics never reach the vowel list.
    expect(skeleton("żółw")).toBe("zlw");
    expect(skeleton("reading")).toBe("rdng");
  });

  /** Cases differ in their vowels; that is the whole reason for this measure. */
  it("leaves a case ending and its dictionary form looking alike", () => {
    expect(skeleton("лисицю")).toBe(skeleton("лисиця"));
    expect(skeleton("lesie")).toBe(skeleton("las"));
  });
});
