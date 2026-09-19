import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_MAX_SECONDS, AUDIO_TOKENS_PER_SECOND } from "@/ai/core/mediaLimits";
import type { MediaPart } from "@/ai/core/provider";

export type RecorderPhase = "idle" | "asking" | "recording" | "done" | "denied" | "unsupported";

export interface Recording {
  part: MediaPart;
  /** From this clock, never from the model. */
  durationMs: number;
}

/**
 * Records a child speaking, cheaply.
 *
 * Opus at 24 kbps mono is about 180 KB a minute — small enough to send inline,
 * and far better quality than a child's voice needs. The codec choice matters
 * more than it looks: the default bitrate is several times this, and audio is
 * billed by *duration* rather than size, so the only thing a bigger file buys
 * is a slower upload.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("could not read the recording")), {
      once: true,
    });
    reader.addEventListener(
      "load",
      () => {
        const result = String(reader.result);
        resolve(result.slice(result.indexOf(",") + 1));
      },
      { once: true },
    );
    reader.readAsDataURL(blob);
  });
}

export function useRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>(() =>
    pickMimeType() === null ? "unsupported" : "idle",
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const stream = useRef<MediaStream | null>(null);

  /**
   * Releases the microphone.
   *
   * Not housekeeping: while a track is live the browser shows a recording
   * indicator, and leaving one running on a child's tablet after the reading is
   * over is not something to be casual about.
   */
  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(() => release, [release]);

  useEffect(() => {
    if (phase !== "recording") return;
    const handle = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 500);
    return () => clearInterval(handle);
  }, [phase]);

  const start = useCallback(async () => {
    const mimeType = pickMimeType();
    if (!mimeType) {
      setPhase("unsupported");
      return false;
    }

    setPhase("asking");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setPhase("denied");
      return false;
    }

    chunks.current = [];
    const instance = new MediaRecorder(stream.current, {
      mimeType,
      audioBitsPerSecond: 24_000,
    });
    instance.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    });

    recorder.current = instance;
    startedAt.current = Date.now();
    setElapsedMs(0);
    instance.start(1000);
    setPhase("recording");
    return true;
  }, []);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const instance = recorder.current;
    if (!instance || phase !== "recording") return null;

    const durationMs = Date.now() - startedAt.current;

    const blob = await new Promise<Blob>((resolve) => {
      instance.addEventListener(
        "stop",
        () => resolve(new Blob(chunks.current, { type: instance.mimeType })),
        { once: true },
      );
      instance.stop();
    });

    release();
    recorder.current = null;
    setPhase("done");

    const seconds = durationMs / 1000;
    return {
      part: {
        kind: "audio",
        // The browser appends codec parameters; the wire format wants the bare
        // type.
        mimeType: instance.mimeType.split(";")[0] ?? "audio/webm",
        data: await toBase64(blob),
        approxTokens: Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND),
      },
      durationMs,
    };
  }, [phase, release]);

  const cancel = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    release();
    chunks.current = [];
    setPhase("idle");
  }, [release]);

  return {
    phase,
    elapsedMs,
    /** True once the recorder has been running longer than any real reading. */
    overLimit: elapsedMs > AUDIO_MAX_SECONDS * 1000,
    start,
    stop,
    cancel,
  };
}
