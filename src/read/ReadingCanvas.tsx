import { useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from "react";

/**
 * A highlighter laid over the text.
 *
 * Children who are still decoding lose their place constantly, and the fix
 * every teacher uses is a finger under the line. On a tablet the finger is on
 * the glass already, so this lets them draw where they are — and on a laptop
 * the same thing works by holding the mouse button down.
 *
 * Off by default and transparent to pointer events while off, because a page
 * that cannot be scrolled is worse than one that cannot be drawn on. The ink
 * never leaves the screen: it is not saved, not measured, and not shown to a
 * grown-up. It is a finger, not an annotation.
 */

export interface ReadingCanvasHandle {
  clear: () => void;
}

/** Pointer position inside the canvas, whatever the page has scrolled to. */
function at(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

const INK = "rgba(250, 204, 21, 0.38)";
const WIDTH = 20;

export function ReadingCanvas({
  active,
  onInk,
  handle,
}: {
  active: boolean;
  onInk: (hasInk: boolean) => void;
  handle: RefObject<ReadingCanvasHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Held in a ref so that telling the parent about ink is never a reason to
  // tear down the observer or wipe the canvas.
  const notify = useRef(onInk);
  useEffect(() => {
    notify.current = onInk;
  }, [onInk]);

  const style = useCallback((canvas: HTMLCanvasElement) => {
    const ratio = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    if (!parent) return;

    // Setting width/height also clears the bitmap, which is the intent: after a
    // resize the text has reflowed underneath and a mark in the old place is
    // pointing at the wrong word.
    canvas.width = Math.max(1, parent.clientWidth * ratio);
    canvas.height = Math.max(1, parent.clientHeight * ratio);
    canvas.style.width = `${parent.clientWidth}px`;
    canvas.style.height = `${parent.clientHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = WIDTH;
    ctx.strokeStyle = INK;
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    notify.current(false);
  }, []);

  useImperativeHandle(handle, () => ({ clear }), [clear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    style(canvas);
    // Not in every browser this app runs in, and a missing observer must cost
    // the redraw rather than the reading screen.
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      style(canvas);
      notify.current(false);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [style]);

  /**
   * A fresh canvas starts with nothing on it, and says so.
   *
   * Wiping after a reflow is the caller's job, done by remounting this with a
   * different `key`: the text underneath has moved, and a mark left in the old
   * place would be pointing at the wrong word.
   */
  useEffect(() => notify.current(false), []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      // Transparent to touch while off: scrolling a page of text matters more
      // than drawing on it.
      style={{ pointerEvents: active ? "auto" : "none", touchAction: active ? "none" : "auto" }}
      aria-hidden
      onPointerDown={(event) => {
        if (!active) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        last.current = at(event);
        notify.current(true);
      }}
      onPointerMove={(event) => {
        if (!drawing.current || !last.current) return;
        const ctx = event.currentTarget.getContext("2d");
        if (!ctx) return;

        const point = at(event);
        // Only the newest segment is stroked. Re-stroking the whole path on
        // every move would darken the ink wherever the finger has been.
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        last.current = point;
      }}
      onPointerUp={() => {
        drawing.current = false;
        last.current = null;
      }}
      onPointerCancel={() => {
        drawing.current = false;
        last.current = null;
      }}
    />
  );
}
