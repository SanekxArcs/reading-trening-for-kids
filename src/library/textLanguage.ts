import { TEXT_LANGS, type TextLang } from "@/engine";
import type { Lang } from "@/i18n/translations";

/**
 * The language of the *text*, which is not the language of the interface.
 *
 * Each in its own tongue, never translated: a parent choosing between these is
 * choosing what their child will read, and "Ukrainian" written in Polish helps
 * nobody make that choice.
 */
export const TEXT_LANG_NAMES: Record<TextLang, string> = {
  uk: "Українська",
  pl: "Polski",
  en: "English",
  ru: "Русский",
  cs: "Čeština",
};

/**
 * What to assume before there is any text to look at.
 *
 * The interface language is the best guess available: a family running the app
 * in Polish is far more likely to want a Polish story than a Ukrainian one.
 * It is only a starting point — the picker sits next to it, and as soon as
 * there are words in the box the detector takes over.
 *
 * Hardcoding Ukrainian here was a real bug: a made-up story is written before
 * any text exists, so that default was the *only* thing deciding its language,
 * and it silently overrode whatever the family had chosen.
 */
export function defaultTextLang(uiLang: Lang): TextLang {
  return (TEXT_LANGS as readonly string[]).includes(uiLang) ? (uiLang as TextLang) : "uk";
}
