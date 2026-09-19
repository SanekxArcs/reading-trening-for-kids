import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  PackageOpen,
  Plus,
  Settings as SettingsIcon,
  Share2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import { listAllSessions, listQuestionSets, listTexts } from "@/data/repositories";
import type { StoredQuestionSet, StoredSession } from "@/data/db";
import { isAiConfigured } from "@/ai/service";
import { useSettings } from "@/settings/useSettings";
import type { StoredText } from "@/engine";

/** The library. The first thing anyone sees, and the child's way into a text. */
export function HomeScreen() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [texts, setTexts] = useState<StoredText[] | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [sets, setSets] = useState<StoredQuestionSet[]>([]);

  useEffect(() => {
    void (async () => {
      const [loadedTexts, loadedSessions, loadedSets] = await Promise.all([
        listTexts(),
        listAllSessions(),
        listQuestionSets(),
      ]);
      setTexts(loadedTexts);
      setSessions(loadedSessions);
      setSets(loadedSets);
    })();
  }, []);

  const readCount = (textId: string) =>
    sessions.filter((session) => session.textId === textId && session.finishedAt !== null).length;

  /**
   * Which texts are still waiting on a grown-up.
   *
   * Shown here rather than only on the reading screen because this is the one
   * place a parent passes through anyway — and because a text whose questions
   * nobody cleared plays as practice questions, which is easy to miss from the
   * outside and impossible to explain to a child.
   */
  const aiReady = isAiConfigured();
  const wantsReview = (textId: string) =>
    aiReady &&
    settings.reviewQuestions &&
    !sets.some(
      (set) =>
        set.textId === textId &&
        set.level === settings.level &&
        set.approved &&
        set.producedBy !== "local",
    );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold text-primary">{t("appName")}</h1>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={t("progress")}>
            <Link to="/progress">
              <TrendingUp />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label={t("settings")}>
            <Link to="/settings">
              <SettingsIcon />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <Button asChild size="lg" className="h-16 text-xl">
          <Link to="/add">
            <Plus />
            {t("addText")}
          </Link>
        </Button>
        {/* The other way a text arrives: somebody sent one. Quiet next to the
            main button, because most evenings it is not the way in. */}
        <Button asChild variant="ghost" className="self-center text-muted-foreground">
          <Link to="/import">
            <PackageOpen />
            {t("importTitle")}
          </Link>
        </Button>
      </div>

      {texts === null ? null : texts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-secondary">
              <BookOpen className="size-9 text-secondary-foreground" aria-hidden />
            </span>
            <p className="text-lg text-muted-foreground">{t("noTextsYet")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {texts.map((text) => {
            const reads = readCount(text.id);
            return (
              <li key={text.id}>
                <Card className="transition-all hover:border-primary hover:shadow-md">
                  <CardContent className="flex flex-col gap-2 py-4">
                    {/* The whole row is the target, not the title: a finger
                        aiming at three words misses, and this is the one thing
                        a child does on this screen. */}
                    <Link to={`/read/${text.id}`} className="flex items-center gap-3">
                      {/* A soft bubble per text, hue chosen from the title so
                          the same book looks the same every evening. */}
                      <span
                        className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `var(--qtype-${text.title.length % 6})` }}
                        aria-hidden
                      >
                        <BookOpen className="size-6 text-foreground/70" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-display text-lg font-semibold">
                          {text.title}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t("wordsCount", { count: text.wordCount })} ·{" "}
                          {reads === 0 ? t("neverRead") : t("readTimes", { count: reads })}
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Sharing is a grown-up action and the screen behind it
                          asks for the PIN; the chip stays small so it is not
                          the thing a child aims at. */}
                      <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                        <Link to={`/share/${text.id}`}>
                          <Share2 />
                          {t("shareTitle")}
                        </Link>
                      </Button>
                    </div>
                    {wantsReview(text.id) && (
                      <Link
                        to={`/review/${text.id}`}
                        className="flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        <ClipboardCheck className="size-3" aria-hidden />
                        {t("reviewNeeded")}
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
