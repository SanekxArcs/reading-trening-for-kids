import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileUp, Loader2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/useI18n";
import type { TranslationKey } from "@/i18n/translations";
import { saveImportedPack } from "@/data/repositories";
import { importedSetKey } from "@/ai/core/cacheKey";
import { useSettings } from "@/settings/useSettings";
import { TEXT_LANG_NAMES } from "@/library/textLanguage";
import { decodePack, encodedFromLink, LINK_PARAM } from "./codec.ts";
import { PackError, readPack, type PackProblem, type ReadPack } from "./pack.ts";

const PROBLEM_COPY: Record<PackProblem, TranslationKey> = {
  "not-a-pack": "importNotAPack",
  "too-new": "importTooNew",
  "empty-text": "importNotAPack",
  "no-questions": "importNoQuestions",
  "bad-language": "importBadLanguage",
};

/**
 * Taking in a lesson somebody else made.
 *
 * Opened by a shared link, or by pasting one, or by picking the file. Nothing
 * here runs anything: a pack is data, it is re-checked against this app's own
 * rules before it is offered, and the grown-up sees what is in it before
 * anything is saved.
 *
 * Not behind the PIN, unlike sharing. A parent following a link from a message
 * lands here directly, and a gate at that moment would read as the app being
 * broken rather than as the app being careful — and there is nothing to
 * protect on the way *in*.
 */
export function ImportScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { settings, update } = useSettings();

  const [pending, setPending] = useState(false);
  const [found, setFound] = useState<ReadPack | null>(null);
  const [problem, setProblem] = useState<TranslationKey | null>(null);
  const [pasted, setPasted] = useState("");
  const filePicker = useRef<HTMLInputElement>(null);

  const accept = async (load: () => Promise<ReadPack>) => {
    setPending(true);
    setProblem(null);
    try {
      setFound(await load());
    } catch (error) {
      setFound(null);
      setProblem(error instanceof PackError ? PROBLEM_COPY[error.problem] : "importNotAPack");
    } finally {
      setPending(false);
    }
  };

  /** A link opened from a message: the pack is in the fragment. */
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    const encoded = fragment.get(LINK_PARAM);
    if (encoded) void accept(() => decodePack(encoded));
    // Once, on arrival: re-reading the fragment later would re-import on every
    // keystroke in the paste field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keep = async () => {
    if (!found) return;
    setPending(true);

    const text = await saveImportedPack({
      cacheKey: importedSetKey({ text: found.pack.text.body, level: found.pack.settings.level }),
      title: found.pack.text.title,
      body: found.pack.text.body,
      lang: found.pack.text.lang,
      level: found.pack.settings.level,
      questions: found.pack.questions,
      producedBy: found.pack.producedBy,
    });

    if (!text) {
      setPending(false);
      setProblem("importNotAPack");
      return;
    }

    /**
     * The level comes with the pack.
     *
     * The questions were written for a particular reader, and playing them at
     * another level would look up a set that does not exist — so the setting
     * follows the lesson rather than the other way round.
     */
    if (settings.level !== found.pack.settings.level) {
      update({ level: found.pack.settings.level });
    }
    navigate(`/read/${text.id}`, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">{t("importTitle")}</h1>
      </header>

      {found ? (
        <Card>
          <CardHeader>
            <CardTitle className="truncate">{found.summary.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t("wordsCount", { count: found.summary.wordCount })} ·{" "}
              {t("shareQuestionCount", { count: found.summary.questionCount })} ·{" "}
              {TEXT_LANG_NAMES[found.summary.lang]}
            </p>

            {/* The receiving app re-checks every question against the text that
                came with it. Questions that no longer line up are dropped, and
                saying how many is more honest than quietly showing fewer. */}
            {found.summary.droppedCount > 0 && (
              <p className="rounded-2xl bg-muted p-3 text-sm">
                {t("importDropped", { count: found.summary.droppedCount })}
              </p>
            )}

            <p className="max-h-48 overflow-y-auto rounded-2xl bg-muted p-3 text-sm whitespace-pre-wrap">
              {found.pack.text.body}
            </p>

            <Button
              size="lg"
              className="h-14 text-lg"
              disabled={pending}
              onClick={() => void keep()}
            >
              <PackageOpen />
              {t("importKeep")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("importHow")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={t("importPastePlaceholder")}
              aria-label={t("importPaste")}
            />
            <Button
              disabled={pending || pasted.trim().length === 0}
              onClick={() => {
                const encoded = encodedFromLink(pasted);
                void accept(() =>
                  encoded === null
                    ? Promise.reject(new PackError("not-a-pack"))
                    : decodePack(encoded),
                );
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : <PackageOpen />}
              {t("importOpen")}
            </Button>

            <Button variant="outline" onClick={() => filePicker.current?.click()}>
              <FileUp />
              {t("importFromFile")}
            </Button>
            <input
              ref={filePicker}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void accept(async () => readPack(JSON.parse(await file.text())));
              }}
            />

            {problem && (
              <p className="text-sm text-wrong" role="alert">
                {t(problem)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
