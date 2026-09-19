import { useCallback, useEffect, useState } from "react";

const KEY = "read_master_theme";

/**
 * `system` follows the OS; the other two override it.
 *
 * The math app shipped a complete set of dark tokens that nothing ever
 * switched on, so the dark theme existed only for people whose OS was already
 * dark. Reading happens in the evening more often than arithmetic does, so this
 * one is wired up from the start.
 */
export type Theme = "light" | "dark" | "system";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function read(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (isTheme(stored)) return stored;
  } catch {
    /* private mode — fall through to the system default */
  }
  return "system";
}

/**
 * Applies the theme to <html>.
 *
 * The stylesheet is class-driven (`@custom-variant dark (&:is(.dark *))`), so
 * the class is what actually switches the tokens. `data-theme` carries the
 * *choice* rather than the result, which is what lets a screen show "system"
 * as selected while the page is currently dark.
 */
function apply(theme: Theme): void {
  const root = document.documentElement;
  root.dataset["theme"] = theme;

  const dark =
    theme === "dark" ||
    (theme === "system" &&
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches);

  root.classList.toggle("dark", dark);
}

export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(read);

  useEffect(() => {
    apply(theme);
    if (theme !== "system" || typeof matchMedia !== "function") return;

    // Only while following the system: re-apply when the OS flips, which it
    // does on a schedule on both phones and laptops.
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the choice just will not survive a reload */
    }
  }, []);

  return { theme, setTheme };
}
