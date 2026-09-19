import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Two ways of doing the thing, offered where the thing is done.
 *
 * Reading aloud or silently, typing or speaking: these are decisions a child
 * makes tonight, not settings a parent configures once. Making them walk back
 * to a PIN-locked screen to switch meant that in practice nobody switched, and
 * two of the three modes the app supports went unused.
 *
 * An option that cannot work is not shown — never shown disabled with an
 * explanation. "Read aloud" with no microphone, or with no key to transcribe
 * with, is a button that would fail in a way a seven-year-old cannot act on,
 * and a greyed-out button is still a promise the app is not keeping.
 */

export interface ModeOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Left out entirely when false. */
  available?: boolean;
}

export function ModeChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "sm",
}: {
  label: string;
  value: T;
  options: readonly ModeOption<T>[];
  onChange: (id: T) => void;
  size?: "sm" | "lg";
}) {
  const usable = options.filter((option) => option.available !== false);
  // One way of doing something is not a choice, and a single button that does
  // nothing when pressed is worse than no button.
  if (usable.length < 2) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2"
      role="group"
      aria-label={label}
    >
      {usable.map((option) => (
        <Button
          key={option.id}
          size={size}
          variant={option.id === value ? "default" : "outline"}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
