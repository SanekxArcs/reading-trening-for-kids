// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModeChoice } from "./ModeChoice.tsx";

function options(voiceAvailable: boolean) {
  return [
    { id: "type" as const, label: "Typing" },
    { id: "voice" as const, label: "Voice", available: voiceAvailable },
  ];
}

describe("ModeChoice", () => {
  it("offers both ways and marks the one in use", () => {
    render(
      <ModeChoice label="How to answer" value="type" options={options(true)} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Typing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Voice" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches on a tap", async () => {
    const onChange = vi.fn();
    render(
      <ModeChoice label="How to answer" value="type" options={options(true)} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Voice" }));
    expect(onChange).toHaveBeenCalledWith("voice");
  });

  /**
   * A microphone that is not there, or a model with no key behind it, must not
   * appear as a button at all. A greyed-out option is still a promise, and a
   * child cannot act on the reason it is greyed out.
   */
  it("leaves out what cannot work rather than disabling it", () => {
    render(
      <ModeChoice label="How to answer" value="type" options={options(false)} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
  });

  /** One option is not a choice, and a button that changes nothing is noise. */
  it("shows nothing at all when only one way is left", () => {
    const { container } = render(
      <ModeChoice label="How to answer" value="type" options={options(false)} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
