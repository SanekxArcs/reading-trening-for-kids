import { afterEach } from "vitest";

/**
 * Shared setup for both environments.
 *
 * The engine suite runs in `node` and the component suite in `jsdom`, so
 * everything DOM-shaped — including the Testing Library import itself — has to
 * be behind this guard.
 */
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  // canvas-confetti and Web Audio have no jsdom implementation. The game must
  // not depend on either working, so stubbing only what jsdom is missing also
  // asserts that.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  window.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16)) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame ??= ((id: number) =>
    window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

  // Vitest is not running with `globals: true`, so Testing Library's automatic
  // cleanup never registers itself. Without this, every render accumulates in
  // the document and queries start matching elements from earlier tests.
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
