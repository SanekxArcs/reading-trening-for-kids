import { useCallback, useEffect, useRef, useState } from "react";

export type TimerPhase = "idle" | "running" | "paused" | "done";

export interface ReadingTimer {
  phase: TimerPhase;
  /** Milliseconds actually spent reading, pauses already deducted. */
  elapsedMs: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => number;
}

/**
 * Times a child reading, and refuses to count the time they were not.
 *
 * Reading speed is the one number here that a bug can silently falsify: nothing
 * looks wrong about 12 wpm, it just quietly tells a parent their child is
 * struggling. So the clock stops the moment the tab goes away — the tablet
 * taken back, a notification opened, the screen locking — exactly as the math
 * app's question timer does, and for the same reason.
 *
 * Elapsed time is derived from timestamps rather than accumulated by an
 * interval: a throttled background tab fires timers late and irregularly, and
 * summing those drifts. The interval here exists only to repaint.
 */
export function useReadingTimer(): ReadingTimer {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  // Accumulated across pauses, plus when the current run began.
  const bankedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  const readElapsed = useCallback(() => {
    const running = startedAtRef.current === null ? 0 : Date.now() - startedAtRef.current;
    return bankedRef.current + running;
  }, []);

  const start = useCallback(() => {
    bankedRef.current = 0;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase("running");
  }, []);

  const pause = useCallback(() => {
    setPhase((current) => {
      if (current !== "running") return current;
      bankedRef.current = readElapsed();
      startedAtRef.current = null;
      setElapsedMs(bankedRef.current);
      return "paused";
    });
  }, [readElapsed]);

  const resume = useCallback(() => {
    setPhase((current) => {
      if (current !== "paused") return current;
      startedAtRef.current = Date.now();
      return "running";
    });
  }, []);

  const stop = useCallback(() => {
    const total = readElapsed();
    bankedRef.current = total;
    startedAtRef.current = null;
    setElapsedMs(total);
    setPhase("done");
    return total;
  }, [readElapsed]);

  // Repaint the visible clock. Once a second is enough — a reading timer that
  // ticks in tenths would invite a child to race it.
  useEffect(() => {
    if (phase !== "running") return;
    const handle = setInterval(() => setElapsedMs(readElapsed()), 1000);
    return () => clearInterval(handle);
  }, [phase, readElapsed]);

  // The automatic half of the promise above.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  return { phase, elapsedMs, start, pause, resume, stop };
}

/** `m:ss`, the only format a child reads at a glance. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
