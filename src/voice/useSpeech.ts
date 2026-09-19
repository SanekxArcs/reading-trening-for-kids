import { useCallback, useEffect, useRef, useState } from "react";
import type { TextLang } from "@/engine";

/**
 * Speaking an answer instead of typing it.
 *
 * **Why the browser's recogniser and not Gemini.** A three-word answer costs
 * almost nothing in tokens — but it costs a *request*, and this app's entire
 * cost model rests on a session being one request. Seven spoken answers would
 * be seven more, turning the cheapest feature into the most expensive one. The
 * Web Speech API is free, instant, needs no key, and works offline in some
 * browsers.
 *
 * The trade is honest and visible: where it is missing, the microphone button
 * simply is not there and the child types. Reading aloud is the opposite case —
 * one long recording, one request — and that one does go to the model.
 */

/** Neither `SpeechRecognition` nor its webkit alias is in the DOM lib types. */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface RecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

function constructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return constructor() !== null;
}

/** The recogniser wants a full BCP-47 tag, not the bare language. */
const LOCALES: Record<TextLang, string> = {
  uk: "uk-UA",
  pl: "pl-PL",
  en: "en-GB",
  ru: "ru-RU",
  cs: "cs-CZ",
};

export type SpeechPhase = "unsupported" | "idle" | "listening" | "denied";

export function useSpeech(lang: TextLang, onResult: (text: string) => void) {
  const [phase, setPhase] = useState<SpeechPhase>(() =>
    isSpeechSupported() ? "idle" : "unsupported",
  );
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  /**
   * The newest callback, without restarting the recogniser when it changes.
   *
   * Synced in an effect rather than during render: the quiz passes a fresh
   * closure every keystroke, and rebuilding the recogniser each time would
   * abort the child mid-sentence.
   */
  const callback = useRef(onResult);
  useEffect(() => {
    callback.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    setPhase((current) => (current === "listening" ? "idle" : current));
  }, []);

  // Never leave the microphone listening because a screen unmounted.
  useEffect(() => () => recognition.current?.abort(), []);

  const listen = useCallback(() => {
    const Recognition = constructor();
    if (!Recognition) {
      setPhase("unsupported");
      return;
    }

    const instance = new Recognition();
    instance.lang = LOCALES[lang];
    // One short answer, not dictation: stop as soon as they stop speaking.
    instance.continuous = false;
    instance.interimResults = false;
    instance.maxAlternatives = 1;

    instance.addEventListener("result", (event) => {
      const results = (
        event as unknown as { results: ArrayLike<ArrayLike<{ transcript: string }>> }
      ).results;
      const transcript = results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) callback.current(transcript.trim());
    });

    instance.addEventListener("error", (event) => {
      const code = (event as unknown as { error?: string }).error;
      setPhase(code === "not-allowed" || code === "service-not-allowed" ? "denied" : "idle");
    });

    instance.addEventListener("end", () => {
      recognition.current = null;
      setPhase((current) => (current === "listening" ? "idle" : current));
    });

    recognition.current = instance;
    setPhase("listening");
    instance.start();
  }, [lang]);

  return { phase, listen, stop, supported: phase !== "unsupported" };
}
