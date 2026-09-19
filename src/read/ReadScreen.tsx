import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Mic, Minus, Pause, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import { useSettings } from "@/settings/useSettings";
import { formatDuration, useReadingTimer } from "./useReadingTimer.ts";
import { getQuestionsFor } from "@/quiz/questionSource.ts";
import {
  getText,
  listAllSessions,
  loadStats,
  recordReadAloud,
  startSession,
} from "@/data/repositories";
import { useRecorder } from "@/voice/useRecorder";
import { aiContext, isAiConfigured, requestReadAloud } from "@/ai/service";
import { ModeChoice } from "@/components/ModeChoice";
import { QuickToggles } from "@/components/QuickToggles";
import { splitSentences } from "@/engine";
import { countChars, speedFlag, warmupWords, type StoredText } from "@/engine";

/**
 * The reading screen.
 *
 * Three jobs, in order of how much they matter: measure the time honestly, be
 * comfortable to read from, and get out of the way. The controls are
 * deliberately few — font size and a pause — because every extra button is one
 * more thing a seven-year-old can press instead of reading.
 */
export function ReadScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { textId } = useParams<{ textId: string }>();
  const { settings, update } = useSettings();
  const timer = useReadingTimer();
  const recorder = useRecorder();
  /**
   * Reading aloud needs both a microphone and a model to transcribe with.
   *
   * With either missing this silently becomes ordinary silent reading rather
   * than a broken screen — and the choice below is not offered at all, so a
   * child is never handed a button that cannot work.
   */
  const canReadAloud = recorder.phase !== "unsupported" && isAiConfigured();
  const aloud = settings.readingMode === "aloud" && canReadAloud;

  const [text, setText] = useState<StoredText | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!textId) return;
    void getText(textId).then(setText);
  }, [textId]);

  /**
   * Questions are fetched while the child reads, not after.
   *
   * With no key this is instant, but the moment Gemini is wired in this is the
   * window that hides the whole round-trip: by the time they press "I've read
   * it", the set is already waiting.
   */
  const [prepared, setPrepared] = useState(false);
  useEffect(() => {
    if (!text || timer.phase !== "running" || prepared) return;
    void getQuestionsFor(text, settings).then(() => setPrepared(true));
  }, [text, timer.phase, prepared, settings]);

  /**
   * The words this child has tripped over before, from anywhere.
   *
   * Two sources, both already being collected: the vocabulary questions they
   * got wrong, and the words they stumbled over reading aloud. Neither costs a
   * request, and this is what they were being kept for.
   */
  const [struggled, setStruggled] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!settings.warmupEnabled) return;
    void (async () => {
      const [stats, sessions] = await Promise.all([loadStats(), listAllSessions()]);
      const missed = [...stats.entries()]
        .filter(([statId, stat]) => statId.startsWith("w:") && stat.correct < stat.attempts)
        .map(([statId]) => statId.slice(2));
      const stumbled = sessions.slice(0, 10).flatMap((session) => session.stumbled ?? []);
      setStruggled([...missed, ...stumbled]);
    })();
  }, [settings.warmupEnabled]);

  /**
   * A look at the hardest words before the clock starts.
   *
   * Pre-exposure is the cheapest thing in the app that actually improves a
   * reading: the child decodes the two hard words once, in their own time, and
   * the timing that follows measures reading rather than one unlucky word.
   */
  const warmup = useMemo(
    () =>
      text && settings.warmupEnabled
        ? warmupWords(text.body, { lang: text.lang, level: settings.level, struggled })
        : [],
    [text, settings.warmupEnabled, settings.level, struggled],
  );

  const readingStyle = useMemo(
    () => ({
      fontSize: `${settings.fontScale}rem`,
      lineHeight: settings.lineHeight,
    }),
    [settings.fontScale, settings.lineHeight],
  );

  if (!text) return null;

  const finish = async () => {
    setStarting(true);
    const readingMs = timer.stop();
    const recording = aloud ? await recorder.stop() : null;

    const set = await getQuestionsFor(text, settings);
    const session = await startSession({
      textId: text.id,
      cacheKey: set.cacheKey,
      level: settings.level,
      readingMs,
      wordCount: text.wordCount,
      charCount: countChars(text.body),
      speedCounts: speedFlag(text.wordCount, readingMs) === "ok",
    });

    if (!session) {
      setStarting(false);
      return;
    }

    /**
     * The child moves on to the questions while this runs.
     *
     * A five-minute recording is the heaviest request the app makes, and making
     * a seven-year-old watch a spinner for it would be the worst possible place
     * to spend their patience. The result lands on the session by the time the
     * quiz is over, and if it never lands, the silent-reading figures stand on
     * their own.
     */
    if (recording) {
      const context = aiContext();
      if (context) {
        void requestReadAloud(context, {
          sentences: splitSentences(text.body, text.lang),
          original: text.body,
          audio: recording.part,
          durationMs: recording.durationMs,
        })
          .then((outcome) =>
            recordReadAloud(session.id, {
              oralWpm: outcome.stats.wordsPerMinute,
              oralAccuracy: outcome.stats.accuracy,
              stumbled: outcome.stumbled,
              transcript: outcome.transcript,
            }),
          )
          .catch(() => {
            // Silent on purpose: the child is answering questions, and there is
            // nothing here they could act on.
          });
      }
    }

    navigate(`/quiz/${session.id}`, { replace: true });
  };

  // ─── Before the clock starts ────────────────────────────────────────────
  if (timer.phase === "idle") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
        <header className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold">{text.title}</h1>
          <QuickToggles settings={settings} update={update} />
        </header>

        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
            <p className="font-display text-3xl font-bold">{t("ready")}</p>
            <p className="text-muted-foreground">
              {t("wordsCount", { count: text.wordCount })} ·{" "}
              {t("sentencesCount", { count: text.sentenceCount })}
            </p>
            {/* Changed here, where the child is about to read, rather than
                behind the parent PIN. It still writes through to the same
                setting, so tonight's choice is tomorrow's default. */}
            <ModeChoice
              label={t("readingMode")}
              value={aloud ? "aloud" : "silent"}
              onChange={(readingMode) => update({ readingMode })}
              options={[
                { id: "silent", label: t("readingModeSilent"), icon: <BookOpen /> },
                {
                  id: "aloud",
                  label: t("readingModeAloud"),
                  icon: <Mic />,
                  available: canReadAloud,
                },
              ]}
            />

            {aloud && <p className="text-muted-foreground">{t("readAloudHint")}</p>}

            {warmup.length > 0 && (
              <div className="flex w-full flex-col items-center gap-2">
                <p className="text-sm text-muted-foreground">{t("warmupTitle")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {warmup.map((word) => (
                    <span
                      key={word}
                      className="rounded-lg bg-muted px-3 py-2 font-display text-xl"
                      lang={text.lang}
                      data-dyslexic={settings.dyslexicFont || undefined}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              size="lg"
              className="h-16 px-10 text-xl"
              onClick={() => {
                if (aloud) void recorder.start();
                timer.start();
              }}
            >
              {aloud && <Mic />}
              {t("startReading")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Reading ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-lg tabular-nums text-muted-foreground"
          role="timer"
          aria-label={t("speed")}
        >
          {formatDuration(timer.elapsedMs)}
        </span>

        <div className="flex items-center gap-1">
          <QuickToggles settings={settings} update={update} />
          {aloud && recorder.phase === "recording" && (
            <Mic className="size-4 animate-pulse text-wrong" aria-label={t("listening")} />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="−"
            onClick={() => update({ fontScale: settings.fontScale - 0.125 })}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="+"
            onClick={() => update({ fontScale: settings.fontScale + 0.125 })}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={timer.phase === "paused" ? t("resume") : t("readingPaused")}
            onClick={timer.phase === "paused" ? timer.resume : timer.pause}
          >
            {timer.phase === "paused" ? <Play /> : <Pause />}
          </Button>
        </div>
      </header>

      {timer.phase === "paused" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
            {/* The text is hidden while paused. Otherwise "pause" would be a
                button that stops the clock and leaves the page readable. */}
            <p className="font-display text-2xl font-bold">{t("readingPaused")}</p>
            <Button size="lg" onClick={timer.resume}>
              <Play />
              {t("resume")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <article
          className="whitespace-pre-wrap font-sans"
          style={readingStyle}
          lang={text.lang}
          data-dyslexic={settings.dyslexicFont || undefined}
        >
          {text.body}
        </article>
      )}

      <div className="sticky bottom-4 mt-auto pt-4">
        <Button
          size="lg"
          className="h-16 w-full text-xl"
          disabled={starting}
          onClick={() => void finish()}
        >
          {t("iHaveRead")}
        </Button>
      </div>
    </div>
  );
}
