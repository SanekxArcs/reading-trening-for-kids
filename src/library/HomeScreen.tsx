import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardCheck, PackageOpen, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/i18n/useI18n";
import { listAllSessions, listQuestionSets, listTexts } from "@/data/repositories";
import type { StoredQuestionSet, StoredSession } from "@/data/db";
import { isAiConfigured } from "@/ai/service";
import { useSettings } from "@/settings/useSettings";
import { displayRate, type StoredText } from "@/engine";

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

  const finishedFor = (textId: string) =>
    sessions.filter((session) => session.textId === textId && session.finishedAt !== null);

  /**
   * The speed from the last real read of this text.
   *
   * Shown on the card because re-reading the same text is where a child can
   * actually see themselves getting better — the numbers only mean something
   * next to the ones before them, and a library of titles alone hides that.
   */
  const lastSpeed = (textId: string): number | null => {
    const last = finishedFor(textId).find((session) => session.speedCounts);
    return last ? displayRate((last.wordCount * 60_000) / last.readingMs) : null;
  };

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
    <AppShell>
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-bold text-primary">{t("appName")}</h1>
        {/* The other way a text arrives: somebody sent one. Quiet, because most
            evenings it is not the way in — but reachable without the menu. */}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/import">
            <PackageOpen />
            {t("importTitle")}
          </Link>
        </Button>
      </header>

      {texts === null ? null : texts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-secondary">
              <BookOpen className="size-9 text-secondary-foreground" aria-hidden />
            </span>
            <p className="text-lg text-muted-foreground">{t("noTextsYet")}</p>
            <Button asChild size="lg">
              <Link to="/add">
                <Plus />
                {t("addText")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {texts.map((text) => (
            <li key={text.id}>
              <TextCard
                text={text}
                reads={finishedFor(text.id).length}
                speed={lastSpeed(text.id)}
                needsReview={wantsReview(text.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/**
 * One text, as a card worth tapping.
 *
 * The cover is the point of it: a library of identical rows is a list a child
 * scans by reading, which is the slowest thing they can do and the thing they
 * came here to practise instead. A coloured spine with the first letter on it
 * is recognisable from across the room and lands on the same text every
 * evening, because the hue comes from the title rather than from the order
 * things were added.
 */
function TextCard({
  text,
  reads,
  speed,
  needsReview,
}: {
  text: StoredText;
  reads: number;
  speed: number | null;
  needsReview: boolean;
}) {
  const { t } = useI18n();
  const hue =
    [...text.title].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0) % 6;

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      {/* The whole block is the target, not the title: a finger aiming at three
          words misses, and opening a text is the one thing a child does here. */}
      <Link
        to={`/read/${text.id}`}
        className="flex items-center gap-4 p-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className="flex size-16 shrink-0 items-center justify-center rounded-2xl font-display text-3xl font-bold text-foreground/70"
          style={{
            background: `linear-gradient(135deg, var(--qtype-${hue}), var(--qtype-${(hue + 2) % 6}))`,
          }}
          aria-hidden
        >
          {[...text.title][0]?.toLocaleUpperCase() ?? "?"}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-display text-lg leading-tight font-semibold">
            {text.title}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("wordsCount", { count: text.wordCount })}
          </span>

          <span className="flex flex-wrap gap-1.5 pt-1">
            <Chip>{reads === 0 ? t("neverRead") : t("readTimes", { count: reads })}</Chip>
            {speed !== null && <Chip tone="primary">{t("wordsPerMinute", { count: speed })}</Chip>}
          </span>
        </span>
      </Link>

      {needsReview && (
        <Link
          to={`/review/${text.id}`}
          className="flex items-center gap-2 border-t border-border/60 bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ClipboardCheck className="size-4 shrink-0" aria-hidden />
          {t("reviewNeeded")}
        </Link>
      )}

      {/* Sharing is a grown-up action and the screen behind it asks for the
          PIN, so it sits at the edge rather than under the thumb. */}
      <div className="flex justify-end border-t border-border/60 px-2 py-1">
        <Button
          asChild
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          aria-label={`${t("shareTitle")}: ${text.title}`}
        >
          <Link to={`/share/${text.id}`}>
            <Share2 />
            {t("shareTitle")}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "primary" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}
