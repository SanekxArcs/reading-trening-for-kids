import { useRef } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import { MAX_PAGES_PER_CALL } from "@/ai/core/mediaLimits";
import { usePageScan } from "./usePageScan.ts";

/**
 * Photograph pages, transcribe them, hand the text back for editing.
 *
 * The transcription is never used directly — it lands in the textarea above,
 * where a grown-up reads it before saving. Print OCR is good but not perfect,
 * and a garbled sentence here becomes a question about something the child
 * never read.
 */
export function ScanCard({ onText }: { onText: (text: string) => void }) {
  const { t } = useI18n();
  const { state, addFiles, removePage, scan, reset } = usePageScan();
  const input = useRef<HTMLInputElement>(null);

  const busy = state.phase === "preparing" || state.phase === "reading";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("photographPages")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          accept="image/*"
          // `environment` opens the rear camera straight away on a phone, which
          // is what a parent standing over a book actually wants.
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />

        {state.pages.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {state.pages.map((page, index) => (
              <li key={`${index}-${page.data.slice(0, 16)}`} className="relative">
                <img
                  src={`data:${page.mimeType};base64,${page.data}`}
                  alt={`${index + 1}`}
                  className="size-20 rounded-lg object-cover"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -right-2 -top-2 size-6 rounded-full"
                  aria-label={t("delete")}
                  onClick={() => removePage(index)}
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Camera />
            {t("photographPages")}
          </Button>

          {state.pages.length > 0 && (
            <Button disabled={busy} onClick={() => void scan()}>
              {state.phase === "reading" ? <Loader2 className="animate-spin" /> : t("checkAnswer")}
            </Button>
          )}
        </div>

        {state.pages.length > MAX_PAGES_PER_CALL && (
          <p className="text-xs text-muted-foreground">
            {t("sentencesCount", { count: state.pages.length })}
          </p>
        )}

        {state.phase === "done" && (
          <div className="flex flex-col gap-2">
            {state.notes && <p className="text-sm text-muted-foreground">{state.notes}</p>}
            {state.unreadableCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("wordsCount", { count: state.unreadableCount })} […]
              </p>
            )}
            <Button
              onClick={() => {
                onText(state.text);
                reset();
              }}
            >
              {t("save")}
            </Button>
          </div>
        )}

        {state.phase === "failed" && state.errorKey && (
          <p className="text-sm text-wrong" role="alert">
            {t(state.errorKey, { seconds: 0, when: "", count: 0 })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
