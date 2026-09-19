import { describe, expect, it } from "vitest";
import { LANGS } from "@/i18n/translations";
import { TEXT_LANGS } from "@/engine";
import { defaultTextLang, TEXT_LANG_NAMES } from "./textLanguage.ts";

describe("defaultTextLang", () => {
  /**
   * The bug this exists to stop: before anything is typed there is nothing to
   * detect, and a made-up story is written in exactly that state. A hardcoded
   * default meant a family reading in Polish asked for a story and got a
   * Ukrainian one, with nothing on screen explaining why.
   */
  it("follows the interface language while there is nothing to detect", () => {
    expect(defaultTextLang("pl")).toBe("pl");
    expect(defaultTextLang("en")).toBe("en");
    expect(defaultTextLang("uk")).toBe("uk");
  });

  it("answers with a language the app can actually read", () => {
    for (const lang of LANGS) {
      expect(TEXT_LANGS).toContain(defaultTextLang(lang));
    }
  });
});

describe("TEXT_LANG_NAMES", () => {
  it("names every text language, each in its own tongue", () => {
    for (const lang of TEXT_LANGS) {
      expect(TEXT_LANG_NAMES[lang]).toBeTruthy();
    }
    expect(TEXT_LANG_NAMES.pl).toBe("Polski");
  });
});
