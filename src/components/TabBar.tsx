import { NavLink } from "react-router-dom";
import { BookOpen, Plus, Settings as SettingsIcon, TrendingUp } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import type { TranslationKey } from "@/i18n/translations";

/**
 * The bar along the bottom, where a thumb already is.
 *
 * An installed PWA is judged against the apps beside it on the home screen,
 * and those all put their destinations within reach of one hand. Controls at
 * the top of a phone held by a seven-year-old are controls reached by
 * shuffling the device down the palm, which is how tablets get dropped.
 *
 * It appears on the three places you *go* and on none of the screens you are
 * *in the middle of* — reading, answering, adding a text. A tab bar under a
 * running timer is an invitation to lose the round.
 */

interface Tab {
  to: string;
  label: TranslationKey;
  icon: typeof BookOpen;
  /** The one action rather than a destination; drawn as such. */
  primary?: boolean;
}

const TABS: readonly Tab[] = [
  { to: "/", label: "library", icon: BookOpen },
  { to: "/add", label: "addText", icon: Plus, primary: true },
  { to: "/progress", label: "progress", icon: TrendingUp },
  { to: "/settings", label: "settings", icon: SettingsIcon },
];

/** Clears the bar, so nothing at the end of a page hides under it. */
export const TAB_BAR_SPACE = "pb-28";

export function TabBar() {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("navMain")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur"
      // The home indicator on an iPhone sits exactly where the middle tab is.
      style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex w-full max-w-2xl items-stretch justify-around px-2 pt-1.5">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) =>
                [
                  // 56px tall and at least as wide: a target a child hits
                  // without looking.
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-semibold transition-colors",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  tab.primary
                    ? "text-primary"
                    : isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      tab.primary
                        ? "flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                        : "flex size-9 items-center justify-center"
                    }
                  >
                    <tab.icon className={tab.primary ? "size-5" : "size-6"} aria-hidden />
                  </span>
                  {/* Labels stay, always. Icon-only bars are a memory test, and
                      the people using this one are learning to read. */}
                  <span className={isActive && !tab.primary ? "underline underline-offset-4" : ""}>
                    {t(tab.label)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
