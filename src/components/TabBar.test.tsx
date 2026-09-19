// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/useI18n";
import { translations } from "@/i18n/translations";
import { TabBar } from "./TabBar.tsx";

const t = translations.en;

function show(at = "/") {
  render(
    <MemoryRouter initialEntries={[at]}>
      <I18nProvider>
        <TabBar />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("TabBar", () => {
  it("is a navigation landmark with a name of its own", () => {
    show();
    expect(screen.getByRole("navigation", { name: t.navMain })).toBeInTheDocument();
  });

  /**
   * Labels stay under the icons. An icon-only bar is a memory test, and the
   * people using this one are learning to read.
   */
  it("names every destination in words", () => {
    show();
    for (const label of [t.library, t.addText, t.progress, t.settings]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  /** Colour alone does not say where you are; `aria-current` does. */
  it("marks the page you are on", () => {
    show("/progress");

    expect(screen.getByRole("link", { name: t.progress })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: t.library })).not.toHaveAttribute("aria-current");
  });

  /** The library tab is only current on the library, not on every path. */
  it("does not claim the library while you are somewhere else", () => {
    show("/settings");
    expect(screen.getByRole("link", { name: t.library })).not.toHaveAttribute("aria-current");
  });
});
