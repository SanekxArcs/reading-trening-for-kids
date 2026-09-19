import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import { saveText } from "@/data/repositories";
import { isAiConfigured } from "@/ai/service";
import { useSettings } from "@/settings/useSettings";
import { ScanCard } from "./ScanCard.tsx";
import { StoryCard } from "./StoryCard.tsx";
import { defaultTextLang, TEXT_LANG_NAMES } from "./textLanguage.ts";
import {
  countWords,
  guessLanguage,
  splitSentences,
  TEXT_LANGS,
  type TextLang,
  type TextSource,
} from "@/engine";

/**
 * Paste a text in, see what the app made of it, save it.
 *
 * The preview is not decoration. The sentence count is what every question will
 * be indexed against, and the detected language decides how answers get
 * stemmed — so both are shown before saving, and the language is editable,
 * because guessing it wrong means grading a child unfairly in a way nobody
 * would think to look for.
 */
export function AddTextScreen() {
  const { t, lang: uiLang } = useI18n();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState<TextLang | null>(null);
  const [saving, setSaving] = useState(false);
  // Kept so the library can show where a text came from, and so a bad
  // transcription can be traced back to the photos rather than blamed on a
  // parent's typing.
  const [source, setSource] = useState<TextSource>("paste");

  // With nothing typed yet there is nothing to detect, so the interface
  // language is the best guess going — and it is the guess that decides what
  // language a made-up story is written in.
  const detected = useMemo(
    () => (body.trim() ? guessLanguage(body) : defaultTextLang(uiLang)),
    [body, uiLang],
  );
  const effectiveLang = lang ?? detected;

  const stats = useMemo(() => {
    const trimmed = body.trim();
    if (!trimmed) return null;
    return {
      words: countWords(trimmed),
      sentences: splitSentences(trimmed, effectiveLang).length,
    };
  }, [body, effectiveLang]);

  const save = async () => {
    setSaving(true);
    const text = await saveText({ body, title, lang: effectiveLang, source });
    setSaving(false);
    if (!text) return;

    /**
     * Straight on to the questions, while the grown-up is still here.
     *
     * This is the only moment they are guaranteed to be holding the device, and
     * with review on it is where the questions get made at all — so sending
     * them to the reading screen instead would mean the first round is always
     * practice questions, for no reason anybody could see.
     */
    const review = settings.reviewQuestions && isAiConfigured();
    navigate(review ? `/review/${text.id}` : `/read/${text.id}`, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">{t("addText")}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("pasteText")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={12}
            className="w-full rounded-lg border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="…"
            aria-label={t("pasteText")}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t("addText")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={stats ? undefined : ""}
            />
          </div>

          {/* Always visible, never only once there is text: a scan and a
              made-up story are both produced *before* anything is in the box,
              and both follow this choice. Hiding it until the box had content
              meant a story could only ever come out in the default language. */}
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
            <Label>{t("textLanguage")}</Label>
            <div className="flex flex-wrap gap-2">
              {TEXT_LANGS.map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant={code === effectiveLang ? "default" : "outline"}
                  aria-pressed={code === effectiveLang}
                  onClick={() => setLang(code)}
                >
                  {TEXT_LANG_NAMES[code]}
                </Button>
              ))}
            </div>
            {stats && (
              <p className="text-sm text-muted-foreground">
                {t("wordsCount", { count: stats.words })} ·{" "}
                {t("sentencesCount", { count: stats.sentences })}
              </p>
            )}
          </div>

          <Button size="lg" disabled={!stats || saving} onClick={() => void save()}>
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      {/* A story to read when there is no book to hand. It lands in the
          textarea like a scan does, so it is read before it is kept. */}
      <StoryCard
        lang={effectiveLang}
        onText={(story, storyTitle) => {
          setBody(story);
          if (!title) setTitle(storyTitle);
          setSource("generated");
        }}
      />

      {/* Transcription lands in the textarea above rather than being saved
          straight off: OCR is good, not perfect, and a garbled sentence becomes
          a question about something the child never read. */}
      <ScanCard
        onText={(scanned) => {
          setBody((current) =>
            current
              ? `${current}

${scanned}`
              : scanned,
          );
          setSource("ocr");
        }}
      />
    </div>
  );
}
