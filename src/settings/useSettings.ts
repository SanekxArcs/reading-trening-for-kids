import { useCallback, useEffect, useState } from "react";
import { CHILD_LEVELS, DEFAULT_SETTINGS, type ChildLevel, type ReadingSettings } from "@/engine";

const KEY = "read_master_settings";

/**
 * Settings live in localStorage, the API key does not.
 *
 * They are separate keys on purpose: settings get exported, logged and shown in
 * diagnostics, and a key that rides along in that object would eventually end
 * up somewhere it should not. See `settings/apiKey.ts`.
 */

function isLevel(value: unknown): value is ChildLevel {
  return typeof value === "string" && (CHILD_LEVELS as readonly string[]).includes(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Rebuilds a settings object from whatever was in storage.
 *
 * Field by field rather than a spread over the parsed object, because the thing
 * actually found there is often from an older version of the app, and one
 * `undefined` reaching the reading screen is a blank page a child cannot get
 * past. Anything unrecognised silently becomes the default.
 */
export function parseSettings(raw: unknown): ReadingSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const input = raw as Partial<Record<keyof ReadingSettings, unknown>>;

  return {
    level: isLevel(input.level) ? input.level : DEFAULT_SETTINGS.level,
    readingMode: input.readingMode === "aloud" ? "aloud" : "silent",
    answerMode: input.answerMode === "voice" ? "voice" : "type",
    adaptive: bool(input.adaptive, DEFAULT_SETTINGS.adaptive),
    warmupEnabled: bool(input.warmupEnabled, DEFAULT_SETTINGS.warmupEnabled),
    reviewQuestions: bool(input.reviewQuestions, DEFAULT_SETTINGS.reviewQuestions),
    maxQuestions: Math.round(num(input.maxQuestions, DEFAULT_SETTINGS.maxQuestions, 1, 30)),
    goalEnabled: bool(input.goalEnabled, DEFAULT_SETTINGS.goalEnabled),
    goalTarget: Math.round(num(input.goalTarget, DEFAULT_SETTINGS.goalTarget, 10, 10_000)),
    soundEnabled: bool(input.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    fontScale: num(input.fontScale, DEFAULT_SETTINGS.fontScale, 0.8, 3),
    lineHeight: num(input.lineHeight, DEFAULT_SETTINGS.lineHeight, 1.2, 3),
    dyslexicFont: bool(input.dyslexicFont, DEFAULT_SETTINGS.dyslexicFont),
  };
}

export function readSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? DEFAULT_SETTINGS : parseSettings(JSON.parse(raw));
  } catch {
    // Private mode, or something that is not JSON at all.
    return DEFAULT_SETTINGS;
  }
}

/**
 * Shared across every screen through a storage event, so the reading screen
 * picks up a font-size change made in settings on another tab without a reload.
 */
export function useSettings(): {
  settings: ReadingSettings;
  update: (patch: Partial<ReadingSettings>) => void;
} {
  const [settings, setSettings] = useState<ReadingSettings>(readSettings);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setSettings(readSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<ReadingSettings>) => {
    setSettings((current) => {
      const next = parseSettings({ ...current, ...patch });
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode — the choice just will not survive a reload */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
