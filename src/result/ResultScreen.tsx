import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, HelpCircle, Home, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import {
  getSession,
  getText,
  listAnswers,
  listSessions,
  overrideVerdict,
} from "@/data/repositories";
import type { StoredAnswer, StoredSession } from "@/data/db";
import { celebrateWin } from "@/lib/celebrate";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/settings/useSettings";
import {
  displayPercent,
  displayRate,
  sessionMetrics,
  splitSentences,
  type StoredText,
} from "@/engine";

interface Loaded {
  session: StoredSession;
  text: StoredText;
  answers: StoredAnswer[];
  previous: StoredSession | null;
}

/**
 * What the reading was worth.
 *
 * Three numbers across the top, then every question with what the child wrote,
 * what the answer was, and the sentence it came from. That last part is the
 * teaching moment and it costs nothing — the sentence index was already needed
 * to verify the question was fair in the first place.
 */
export function ResultScreen() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  /**
   * The celebration, once per opening of this result.
   *
   * Fired from the session rather than recomputed, so re-opening an old good
   * evening from the progress list celebrates it again — and so a result can
   * never congratulate a child for a goal they did not actually reach.
   */
  const reached = loaded?.session.goalReached === true;
  useEffect(() => {
    if (!reached) return;
    celebrateWin();
    playSound("win", settings.soundEnabled);
  }, [reached, settings.soundEnabled]);

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const session = await getSession(sessionId);
      if (!session) return;
      const [text, answers, all] = await Promise.all([
        getText(session.textId),
        listAnswers(session.id),
        listSessions(session.textId),
      ]);
      if (!text) return;

      // The most recent finished session before this one, for the comparison.
      const previous =
        all
          .filter(
            (other) => other.id !== session.id && other.finishedAt !== null && other.speedCounts,
          )
          .toSorted((a, b) => b.startedAt - a.startedAt)[0] ?? null;

      setLoaded({ session, text, answers, previous });
    })();
  }, [sessionId]);

  const settle = async (answerId: string, verdict: "correct" | "incorrect") => {
    await overrideVerdict(answerId, verdict);
    setLoaded((current) =>
      current
        ? {
            ...current,
            answers: current.answers.map((answer) =>
              answer.id === answerId ? { ...answer, verdict, judgedBy: "parent" } : answer,
            ),
          }
        : current,
    );
  };

  if (!loaded) return null;

  const { session, text, answers, previous } = loaded;
  const sentences = splitSentences(text.body, text.lang);

  const metrics = sessionMetrics({
    wordCount: session.wordCount,
    charCount: session.charCount,
    readingMs: session.readingMs,
    verdicts: answers.map((answer) => answer.verdict),
    answerMs: answers.map((answer) => answer.ms),
  });

  const percent = displayPercent(metrics.comprehension.score);
  const wpm = displayRate(metrics.wordsPerMinute);

  const previousWpm = previous
    ? displayRate((previous.wordCount * 60_000) / previous.readingMs)
    : null;
  const delta = previousWpm === null || !metrics.speedCounts ? null : wpm - previousWpm;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{text.title}</h1>
        <Button asChild variant="ghost" size="icon" aria-label={t("library")}>
          <Link to="/">
            <Home />
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("comprehension")} value={percent === null ? "—" : `${percent}%`} />
        <Stat
          label={t("speed")}
          value={metrics.speedCounts ? t("wordsPerMinute", { count: wpm }) : "—"}
        />
        <Stat
          label={t("effectiveSpeed")}
          value={
            metrics.speedCounts && percent !== null
              ? t("wordsPerMinute", { count: displayRate(metrics.effectiveWpm) })
              : "—"
          }
          highlight
        />
      </div>

      {/* Only when the child actually read aloud. Reading speed out loud and
          silently are different numbers and are never mixed. */}
      {session.oralWpm !== undefined && (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label={`${t("speed")} · ${t("readingModeAloud")}`}
            value={t("wordsPerMinute", { count: displayRate(session.oralWpm) })}
          />
          <Stat
            label={`${t("comprehension")} · ${t("readingModeAloud")}`}
            value={`${displayPercent(session.oralAccuracy ?? 0)}%`}
          />
        </div>
      )}

      {/* The game layer, finally visible to the child: what the round was
          worth, the best run in it, and — when they got there — the level they
          just earned. Written down when the quiz ended rather than recomputed,
          so it agrees with the number they watched climbing. */}
      {session.points !== undefined && (
        <Card className={session.goalReached ? "border-combo" : undefined}>
          <CardContent className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-4 text-center">
            <span className="font-display text-xl font-bold text-combo tabular-nums">
              {t("pointsEarned", { points: session.points })}
            </span>
            {session.bestStreak !== undefined && session.bestStreak > 1 && (
              <span className="text-sm text-muted-foreground">
                {t("bestStreak", { count: session.bestStreak })}
              </span>
            )}
            {session.goalReached && (
              <span className="flex items-center gap-1 font-display font-bold">
                <Sparkles className="size-4" aria-hidden />
                {t("goalReached")}
                {session.playerLevel !== undefined &&
                  ` · ${t("levelUp", { count: session.playerLevel + 1 })}`}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {!metrics.speedCounts && (
        <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
          {t("readTooFast")}
        </p>
      )}

      {delta !== null && delta !== 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {delta > 0
            ? t("fasterThanLast", { count: delta })
            : t("slowerThanLast", { count: -delta })}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {answers.map((answer) => {
          const sentence = sentences[answer.question.sentenceIndex]?.text ?? "";
          return (
            <li key={answer.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-start gap-2">
                    <Verdict verdict={answer.verdict} />
                    <p className="font-medium" lang={text.lang}>
                      {answer.question.prompt}
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {t("yourAnswerWas", { answer: answer.given || "—" })}
                  </p>

                  {answer.verdict === "unsure" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">{t("grownUpWillCheck")}</p>
                      {/* The override, and the only place a verdict is ever
                          changed by hand. Every press here is also a case worth
                          adding to the matcher's fixture table. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void settle(answer.id, "correct")}
                      >
                        <ThumbsUp />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void settle(answer.id, "incorrect")}
                      >
                        <ThumbsDown />
                      </Button>
                    </div>
                  ) : (
                    answer.verdict !== "correct" && (
                      <p className="text-sm">
                        {t("correctAnswerIs", { answer: answer.question.canonicalAnswer })}
                      </p>
                    )
                  )}

                  {sentence && (
                    <p className="rounded-md bg-muted p-2 text-sm" lang={text.lang}>
                      {t("fromSentence", { sentence })}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Button asChild size="lg" className="mt-auto h-14">
        <Link to={`/read/${text.id}`}>{t("startReading")}</Link>
      </Button>
    </div>
  );
}

/**
 * One of the three numbers across the top.
 *
 * The highlighted one is effective speed, and it is the only one tinted: it is
 * the number the whole app is built around, and three equally loud tiles say
 * nothing about which to look at.
 */
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/8" : undefined}>
      <CardContent className="flex flex-col items-center gap-1 py-5 text-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`font-display text-2xl font-bold tabular-nums ${highlight ? "text-primary" : ""}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function Verdict({ verdict }: { verdict: StoredAnswer["verdict"] }) {
  if (verdict === "correct")
    return <Check className="size-5 shrink-0 text-correct" aria-label="✓" />;
  if (verdict === "unsure")
    return <HelpCircle className="size-5 shrink-0 text-muted-foreground" aria-label="?" />;
  return <X className="size-5 shrink-0 text-wrong" aria-label="✗" />;
}
