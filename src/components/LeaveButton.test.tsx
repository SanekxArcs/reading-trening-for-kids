// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/useI18n";
import { translations } from "@/i18n/translations";
import { LeaveButton } from "./LeaveButton.tsx";

// The provider follows the browser, and jsdom reports English.
const t = translations.en;

function show(onLeave = vi.fn()) {
  render(
    <I18nProvider>
      <LeaveButton onLeave={onLeave} />
    </I18nProvider>,
  );
  return onLeave;
}

describe("LeaveButton", () => {
  it("does not leave on the first tap", async () => {
    const onLeave = show();
    await userEvent.click(screen.getByRole("button", { name: t.leave }));

    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  /**
   * The reason it asks at all: a child taps everything at the top of a screen
   * at least once, and this one throws away four minutes of reading.
   */
  it("goes back to the round when they say to keep going", async () => {
    const onLeave = show();
    await userEvent.click(screen.getByRole("button", { name: t.leave }));
    await userEvent.click(screen.getByRole("button", { name: t.leaveStay }));

    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves once, on the second tap", async () => {
    const onLeave = show();
    await userEvent.click(screen.getByRole("button", { name: t.leave }));
    await userEvent.click(screen.getByRole("button", { name: t.leaveYes }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
