import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isLang, translate, type Lang, type TranslationKey } from "./translations";

const KEY = "read_master_lang";

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

function detect(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* private mode */
  }
  // The app was built for a Ukrainian-speaking family, so Ukrainian is the
  // fallback when the browser asks for something we do not have. This is the
  // *interface* language only — the questions always follow the text.
  const browser = typeof navigator === "undefined" ? "" : navigator.language.slice(0, 2);
  return isLang(browser) ? browser : "uk";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the choice just will not survive a reload */
    }
  }, []);

  // Keep the document language in step, so screen readers and the browser's
  // own hyphenation use the right one.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside an I18nProvider");
  return value;
}
