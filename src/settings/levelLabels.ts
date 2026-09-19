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

export { CHILD_LEVELS, type ChildLevel };
