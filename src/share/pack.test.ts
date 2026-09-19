// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, splitSentences, type Question, type StoredText } from "@/engine";
import { buildPack, PackError, readPack, PACK_KIND } from "./pack.ts";
import { decodePack, encodedFromLink, encodePack, packFilename, packLink } from "./codec.ts";

const BODY = [
  "Одного ранку лисиця вийшла з нори.",
  "Вона побачила журавля біля струмка.",
  "Журавель ловив рибу довгим дзьобом.",
].join(" ");

const SENTENCES = splitSentences(BODY, "uk");

function text(): StoredText {
  return {
    id: "t1",
    title: "Лисиця і журавель",
    body: BODY,
    lang: "uk",
    source: "paste",
    hash: "h",
    wordCount: 18,
    sentenceCount: SENTENCES.length,
    createdAt: 1,
  };
}

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
    rationale: "Речення 1.",
    ...overrides,
  };
}

function pack(questions: Question[] = [question()]) {
  return buildPack({
    text: text(),
    questions,
    settings: DEFAULT_SETTINGS,
    producedBy: "gemini:test",
    now: 1000,
  });
}

describe("buildPack", () => {
  /**
   * A pack gets forwarded to people the sender never thought about. Everything
   * in it has to survive that, so it carries a lesson and nothing about a
   * child or the key that made it.
   */
  it("carries the lesson and nothing about the family", () => {
    const built = pack();

    // Named rather than sniffed for: a substring search finds "pin" inside
    // "developing" and passes for the wrong reason.
    expect(Object.keys(built).toSorted()).toEqual(
      ["createdAt", "kind", "producedBy", "questions", "settings", "text", "v"].toSorted(),
    );
    expect(Object.keys(built.text).toSorted()).toEqual(["body", "lang", "title"]);
    expect(built.questions[0]?.canonicalAnswer).toBe("журавля");
    expect(JSON.stringify(built)).not.toContain("AIza");
  });

  it("takes the settings that belong to the test, not to the reader", () => {
    const built = buildPack({
      text: text(),
      questions: [question()],
      settings: { ...DEFAULT_SETTINGS, level: "fluent", fontScale: 2.5, dyslexicFont: true },
      producedBy: "local",
    });

    expect(built.settings.level).toBe("fluent");
    expect(JSON.stringify(built.settings)).not.toContain("fontScale");
    expect(JSON.stringify(built.settings)).not.toContain("dyslexicFont");
  });
});

describe("readPack", () => {
  it("round-trips a pack it made itself", () => {
    const read = readPack(pack());
    expect(read.summary.questionCount).toBe(1);
    expect(read.summary.title).toBe("Лисиця і журавель");
    expect(read.pack.text.body).toBe(BODY);
  });

  /**
   * The questions are re-checked against the text that travelled with them,
   * with this side's own sentence split. A pack edited by hand, or truncated
   * on the way, produces questions that no longer line up — and a child must
   * not be asked those.
   */
  it("drops a question whose citation does not survive the crossing", () => {
    const read = readPack(pack([question(), question({ id: "q9", sentenceIndex: 99 })]));

    expect(read.summary.questionCount).toBe(1);
    expect(read.summary.droppedCount).toBe(1);
  });

  it("refuses a pack with nothing left to ask", () => {
    expect(() => readPack(pack([question({ id: "q9", sentenceIndex: 99 })]))).toThrow(PackError);
  });

  it("refuses something that is not a pack at all", () => {
    for (const rubbish of [null, 42, "text", {}, { kind: "other" }]) {
      expect(() => readPack(rubbish)).toThrow(PackError);
    }
  });

  /** A newer app's pack is not something to half-read. */
  it("refuses a pack from a future version rather than guessing", () => {
    expect(() => readPack({ ...pack(), v: 99 })).toThrow(PackError);
  });

  it("refuses a language this app cannot grade in", () => {
    const wrong = { ...pack(), text: { ...pack().text, lang: "de" } };
    expect(() => readPack(wrong)).toThrow(PackError);
  });

  it("survives a pack with fields missing rather than crashing", () => {
    const bare = {
      kind: PACK_KIND,
      v: 1,
      text: { body: BODY, lang: "uk" },
      questions: [question()],
    };
    const read = readPack(bare);
    expect(read.pack.settings.level).toBe("developing");
    expect(read.pack.settings.readingMode).toBe("silent");
  });
});

describe("the link and file codec", () => {
  it("survives the round trip", async () => {
    const encoded = await encodePack(pack());
    const read = await decodePack(encoded);

    expect(read.pack.text.body).toBe(BODY);
    expect(read.summary.questionCount).toBe(1);
  });

  /** A link has to fit in a message, and gzip is what makes that true. */
  it("compresses enough for a real text to fit in a link", async () => {
    const long = buildPack({
      text: { ...text(), body: Array.from({ length: 40 }, () => BODY).join(" ") },
      questions: Array.from({ length: 10 }, (_, index) =>
        question({ id: `q${index}`, sentenceIndex: 1 }),
      ),
      settings: DEFAULT_SETTINGS,
      producedBy: "gemini:test",
    });

    const encoded = await encodePack(long);
    expect(encoded.length).toBeLessThan(JSON.stringify(long).length / 2);
  });

  it("refuses a link that was mangled on the way", async () => {
    const encoded = await encodePack(pack());
    await expect(decodePack(encoded.slice(0, 20))).rejects.toThrow(PackError);
    await expect(decodePack("nonsense")).rejects.toThrow(PackError);
  });

  /**
   * The payload rides in the fragment, which browsers never send to a server:
   * the page host learns nothing about what families share with each other.
   */
  it("puts the pack after the hash, never in the query", async () => {
    const link = packLink("https://example.app/", await encodePack(pack()));
    expect(link).toContain("/import#p=");
    expect(link.split("#")[0]).not.toContain("p=");
  });

  it("finds the pack in a pasted link, a fragment, or the bare code", async () => {
    const encoded = await encodePack(pack());
    const link = packLink("https://example.app", encoded);

    expect(encodedFromLink(link)).toBe(encoded);
    expect(encodedFromLink(`#p=${encoded}`)).toBe(encoded);
    expect(encodedFromLink(`  "${encoded}"  `)).toBe(encoded);
    expect(encodedFromLink("https://example.app/")).toBeNull();
    expect(encodedFromLink("")).toBeNull();
  });

  it("names the file after the text", () => {
    expect(packFilename("Лисиця і журавель")).toBe("лисиця-і-журавель.chytayko.json");
    expect(packFilename("!!!")).toBe("text.chytayko.json");
  });
});
