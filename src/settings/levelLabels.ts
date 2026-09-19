import { CHILD_LEVELS, type ChildLevel } from "@/engine";
import type { TranslationKey } from "@/i18n/translations";

/**
 * The four level labels, tied to their translation keys by the type system.
 *
 * `TranslationKeyOfLevel` is narrowed to the four `level*` keys so that
 * renaming one in the catalogue breaks the build here rather than showing a
 * parent a raw key name.
 */
export type TranslationKeyOfLevel = Extract<TranslationKey, `level${string}`>;

/**
 * Shared by both places a level is chosen: the settings screen, and the moment
 * a text is added — which is where the choice actually belongs, because the
 * level decides what questions get written about *this* text.
 */
export const LEVEL_KEYS: Record<ChildLevel, TranslationKeyOfLevel> = {
  beginner: "levelBeginner",
  developing: "levelDeveloping",
  fluent: "levelFluent",
  advanced: "levelAdvanced",
};

export { CHILD_LEVELS, type ChildLevel };
