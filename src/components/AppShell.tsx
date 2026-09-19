import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/useI18n";
import { TabBar, TAB_BAR_SPACE } from "./TabBar.tsx";

/**
 * The frame the three "places" of the app sit in.
 *
 * One `<main>`, one tab bar, and a skip link that is the first thing focus
 * reaches — because with a bar of four links repeated on every screen, a
 * keyboard or switch user would otherwise tab through all of them to reach
 * what they came for.
 *
 * The flow screens — reading, answering, adding, sharing — do not use this.
 * They are places you are in the middle of, and they keep their own back
 * button instead of offering four ways to abandon what is running.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  /**
   * Focus moves to the new page, the way it does on a page load.
   *
   * Without this, following a tab leaves a screen reader sitting on the link
   * that was clicked and saying nothing about where it now is — the single
   * most common way a single-page app is unusable without sight, and invisible
   * to everyone testing with a mouse.
   *
   * Never on the first render: the browser has just put focus at the top of
   * the document, which is where the skip link is, and taking it away would
   * undo the one thing that link is for.
   */
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <a
        href="#main"
        className="sr-only rounded-2xl bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t("skipToContent")}
      </a>

      <main
        id="main"
        ref={main}
        // Focusable by script only: -1 keeps it out of the tab order while
        // letting focus be moved here on a route change.
        tabIndex={-1}
        className={`flex min-h-dvh flex-col gap-5 p-4 outline-none ${TAB_BAR_SPACE}`}
      >
        {children}
      </main>

      <TabBar />
    </div>
  );
}
