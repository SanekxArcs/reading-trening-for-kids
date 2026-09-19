import { useCallback, useState } from "react";
import { chunkPages, MAX_PAGES_PER_CALL } from "@/ai/core/mediaLimits";
import { asAiError, errorInfo, type AiErrorCode } from "@/ai/core/errors";
import { prepareImages } from "@/ai/runtime/media";
import { aiContext, requestOcr, type MediaPart } from "@/ai/service";
import type { TranslationKey } from "@/i18n/translations";

export interface ScanState {
  phase: "idle" | "preparing" | "reading" | "done" | "failed";
  /** Pages picked, already downscaled. */
  pages: MediaPart[];
  text: string;
  notes: string;
  unreadableCount: number;
  /** i18n key for the parent, when something went wrong. */
  errorKey: TranslationKey | null;
  code: AiErrorCode | null;
}

const IDLE: ScanState = {
  phase: "idle",
  pages: [],
  text: "",
  notes: "",
  unreadableCount: 0,
  errorKey: null,
  code: null,
};

/**
 * Photographs of pages, in and text out.
 *
 * Two things this deliberately does *not* do. It does not save anything —
 * transcription is a draft a grown-up edits, and a page photographed at an
 * angle produces text nobody should keep unread. And it does not retry a
 * failure by itself: OCR is the most expensive call in the app, so a second
 * attempt is the parent's decision, made after they have looked at the photo.
 */
export function usePageScan() {
  const [state, setState] = useState<ScanState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const addFiles = useCallback(async (files: readonly File[]) => {
    if (files.length === 0) return;
    setState((current) => ({ ...current, phase: "preparing", errorKey: null, code: null }));
    try {
      const prepared = await prepareImages(files);
      setState((current) => ({
        ...current,
        phase: "idle",
        pages: [...current.pages, ...prepared],
      }));
    } catch {
      setState((current) => ({ ...current, phase: "failed", errorKey: "errUnknown" }));
    }
  }, []);

  const removePage = useCallback((index: number) => {
    setState((current) => ({
      ...current,
      pages: current.pages.filter((_, i) => i !== index),
    }));
  }, []);

  const scan = useCallback(async () => {
    const context = aiContext();
    if (!context) {
      setState((current) => ({
        ...current,
        phase: "failed",
        errorKey: "errNoKey",
        code: "no_key",
      }));
      return;
    }

    setState((current) => ({ ...current, phase: "reading", errorKey: null, code: null }));

    try {
      /**
       * Batches of six, run in order.
       *
       * Sequential and not parallel, because the queue serialises them anyway
       * and firing three at once just means three 429s instead of one.
       */
      const batches = chunkPages(state.pages, MAX_PAGES_PER_CALL);
      const parts: string[] = [];
      const notes: string[] = [];
      let unreadable = 0;

      for (const batch of batches) {
        const result = await requestOcr(context, batch);
        parts.push(result.mergedText);
        if (result.notes) notes.push(result.notes);
        unreadable += result.unreadableCount;
      }

      setState((current) => ({
        ...current,
        phase: "done",
        text: parts.join("\n\n"),
        notes: notes.join(" "),
        unreadableCount: unreadable,
      }));
    } catch (error) {
      const aiError = asAiError(error);
      setState((current) => ({
        ...current,
        phase: "failed",
        errorKey: errorInfo(aiError.code).parentKey,
        code: aiError.code,
      }));
    }
  }, [state.pages]);

  const editText = useCallback((text: string) => {
    setState((current) => ({ ...current, text }));
  }, []);

  return { state, addFiles, removePage, scan, editText, reset };
}
