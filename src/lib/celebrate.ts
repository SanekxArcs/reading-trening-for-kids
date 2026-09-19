import confetti from "canvas-confetti";

/**
 * Confetti, with two guards that both exist because of real failures.
 *
 * Ported from the math trainer unchanged in substance.
 */

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * canvas-confetti draws onto a canvas without ever checking it got a context.
 * Where there is none — a locked-down browser, a headless test — its animation
 * loop throws on every frame for as long as the burst lasts. Asked once and
 * remembered, because the answer cannot change within a page.
 */
let drawable: boolean | null = null;
function canDraw(): boolean {
  if (drawable !== null) return drawable;
  try {
    drawable =
      typeof document !== "undefined" && document.createElement("canvas").getContext("2d") !== null;
  } catch {
    drawable = false;
  }
  return drawable;
}

const COLORS = ["#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa"];

/** Small burst — a run of right answers just got longer. */
export function celebrateCombo(): void {
  if (reducedMotion() || !canDraw()) return;
  void confetti({
    particleCount: 40,
    spread: 60,
    startVelocity: 28,
    origin: { y: 0.4 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

/** The goal was reached. */
export function celebrateWin(): void {
  if (reducedMotion() || !canDraw()) return;

  const end = Date.now() + 1400;
  const frame = () => {
    void confetti({
      particleCount: 6,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.65 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    void confetti({
      particleCount: 6,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.65 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
