import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import { getText, listQuestionSets } from "@/data/repositories";
import { useSettings } from "@/settings/useSettings";
import { PinGate } from "@/settings/PinGate";
import type { StoredText } from "@/engine";
import { buildPack, type Pack } from "./pack.ts";
import { encodePack, MAX_LINK_CHARS, packFilename, packLink } from "./codec.ts";

/**
 * Handing a lesson to another family.
 *
 * Two children in two houses can only be compared if they answered the same
 * questions about the same text, so the questions travel with the text rather
 * than being regenerated on the other side. A pack also costs the receiver
 * nothing: no key, no quota, no waiting.
 *
 * Behind the PIN because it is a parent's decision what leaves this device —
 * even though a pack carries nothing but the lesson.
 */
export function ShareScreen() {
  return (
    <PinGate>
      <ShareBody />
    </PinGate>
  );
}

function ShareBody() {
  const { t } = useI18n();
  const { textId } = useParams<{ textId: string }>();
  const { settings } = useSettings();

  const [text, setText] = useState<StoredText | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (!textId) return;
    void (async () => {
      const loaded = await getText(textId);
      if (!loaded) return;
      setText(loaded);

      /**
       * The best set this text has, for the level being shared.
       *
       * A pack with the offline practice questions in it would be worth very
       * little to the receiver — they can generate those themselves — so the
       * model's questions are preferred, and a text that has none says so
       * rather than sending an empty lesson.
       */
      const sets = (await listQuestionSets()).filter(
        (set) => set.textId === loaded.id && set.approved && set.questions.length > 0,
      );
      const best =
        sets.find((set) => set.level === settings.level && set.producedBy !== "local") ??
        sets.find((set) => set.producedBy !== "local") ??
        sets.find((set) => set.level === settings.level) ??
        sets[0];

      if (!best) {
        setEmpty(true);
        return;
      }

      const built = buildPack({
        text: loaded,
        questions: best.questions,
        settings: { ...settings, level: best.level },
        producedBy: best.producedBy,
      });
      setPack(built);
      setEncoded(await encodePack(built));
    })();
  }, [textId, settings]);

  if (!text) return null;

  const link = encoded ? packLink(window.location.origin, encoded) : null;
  const tooLongForLink = encoded !== null && encoded.length > MAX_LINK_CHARS;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard permission refused: the field below is selectable by hand.
    }
  };

  const send = async () => {
    if (!link || !navigator.share) return;
    try {
      await navigator.share({ title: text.title, text: t("shareMessage"), url: link });
    } catch {
      // Dismissed, which is not a failure.
    }
  };

  const download = () => {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = packFilename(text.title);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">{t("shareTitle")}</h1>
          <p className="truncate text-sm text-muted-foreground">{text.title}</p>
        </div>
      </header>

      {empty ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("shareNothingYet")}
          </CardContent>
        </Card>
      ) : !pack || !encoded ? (
        <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t("sharePreparing")}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("shareWhatIsInside")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                {t("wordsCount", { count: text.wordCount })} ·{" "}
                {t("shareQuestionCount", { count: pack.questions.length })}
              </p>
              {/* Said plainly, because a pack gets forwarded to people the
                  sender never thought about. */}
              <p>{t("sharePrivacy")}</p>
            </CardContent>
          </Card>

          {!tooLongForLink && link && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
                <p className="max-h-24 overflow-y-auto rounded-2xl bg-muted p-3 font-mono text-[11px] break-all">
                  {link}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void copy()}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? t("shareCopied") : t("shareCopyLink")}
                  </Button>
                  {typeof navigator.share === "function" && (
                    <Button variant="outline" onClick={() => void send()}>
                      <Share2 />
                      {t("shareSend")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              {tooLongForLink && <p className="text-sm">{t("shareTooLongForLink")}</p>}
              <Button variant={tooLongForLink ? "default" : "outline"} onClick={download}>
                <Download />
                {t("shareDownload")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("shareFileHint")}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
