import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";
import type { TranslationKey } from "@/i18n/translations";
import { listAllSessions, listAnswers, listTexts, loadStats } from "@/data/repositories";
import { displayPercent, displayRate, type MasteryBand, type QuestionType } from "@/engine";
import { useSettings } from "@/settings/useSettings";
import {
  dailySeries,
  skillSummary,
  totals,
  type DayPoint,
  type SessionSummary,
  type SkillSummary,
} from "./summary.ts";

const SKILL_LABEL: Record<QuestionType, TranslationKey> = {
  literal: "skillLiteral",
  sequence: "skillSequence",
  vocabulary: "skillVocabulary",
  inference: "skillInference",
  main_idea: "skillMainIdea",
};

const BAND_LABEL: Record<MasteryBand, TranslationKey> = {
  unseen: "bandUnseen",
  learning: "bandLearning",
  practising: "bandPractising",
  known: "bandKnown",
};

/** An ordinal ramp, one hue. Never the only thing saying what a band is. */
const BAND_COLOUR: Record<MasteryBand, string> = {
  unseen: "bg-chart-empty",
  learning: "bg-mastery-1",
  practising: "bg-mastery-2",
  known: "bg-mastery-3",
};

interface Loaded {
  series: DayPoint[];
  skills: SkillSummary[];
  headline: ReturnType<typeof totals>;
  recent: { id: string; title: string; percent: number | null; wpm: number | null }[];
}

export function ProgressScreen() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    void (async () => {
      const [sessions, texts, stats] = await Promise.all([
        listAllSessions(),
        listTexts(),
        loadStats(),
      ]);
      const titles = new Map(texts.map((text) => [text.id, text.title]));

      const finished = sessions.filter((session) => session.finishedAt !== null);
      const summaries: SessionSummary[] = await Promise.all(
        finished.map(async (session) => ({
          id: session.id,
          startedAt: session.startedAt,
          wordCount: session.wordCount,
          readingMs: session.readingMs,
          speedCounts: session.speedCounts,
          verdicts: (await listAnswers(session.id)).map((answer) => answer.verdict),
        })),
      );

      setLoaded({
        series: dailySeries(summaries, 14),
        skills: skillSummary(stats, settings.level),
        headline: totals(summaries),
        recent: finished.slice(0, 10).map((session) => {
          const summary = summaries.find((item) => item.id === session.id);
          const understood = summary
            ? summary.verdicts.filter((verdict) => verdict === "correct").length /
              Math.max(1, summary.verdicts.filter((verdict) => verdict !== "unsure").length)
            : null;
          return {
            id: session.id,
            title: titles.get(session.textId) ?? "—",
            percent: understood === null ? null : Math.round(understood * 100),
            wpm: session.speedCounts
              ? displayRate((session.wordCount * 60_000) / session.readingMs)
              : null,
          };
        }),
      });
    })();
  }, [settings.level]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">{t("progress")}</h1>
      </header>

      {loaded === null ? null : loaded.headline.sessions === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("noProgressYet")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label={t("comprehension")}
              value={
                loaded.headline.comprehension === null
                  ? "—"
                  : `${displayPercent(loaded.headline.comprehension)}%`
              }
            />
            <Stat
              label={t("effectiveSpeed")}
              value={
                loaded.headline.effectiveWpm === null
                  ? "—"
                  : t("wordsPerMinute", { count: displayRate(loaded.headline.effectiveWpm) })
              }
              highlight
            />
            <Stat
              label={<Flame className="size-4" aria-hidden />}
              value={t("dayStreak", { count: loaded.headline.streak })}
            />
          </div>

          {loaded.headline.pending > 0 && (
            <p className="rounded-lg bg-muted p-3 text-center text-sm">
              {t("needsReview", { count: loaded.headline.pending })}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("effectiveSpeed")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart series={loaded.series} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("skills")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loaded.skills.map((skill) => (
                <div key={skill.type} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm">{t(SKILL_LABEL[skill.type])}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${BAND_COLOUR[skill.band]}`}
                      style={{ width: `${Math.round(skill.strength * 100)}%` }}
                      aria-hidden
                    />
                  </div>
                  {/* The band in words as well as in colour: the bar alone is
                      not readable to anyone who cannot distinguish the hues. */}
                  <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                    {t(BAND_LABEL[skill.band])}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <ul className="flex flex-col gap-2">
            {loaded.recent.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <Link to={`/result/${row.id}`} className="min-w-0 flex-1 truncate font-medium">
                      {row.title}
                    </Link>
                    <span className="shrink-0 text-sm tabular-nums">
                      {row.percent === null ? "—" : `${row.percent}%`}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {row.wpm === null ? "—" : t("wordsPerMinute", { count: row.wpm })}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Fourteen days of effective speed.
 *
 * Hand-rolled rather than a charting library, for the same reason the math app
 * did it: the chart is one series of fourteen bars, and a dependency for that
 * would weigh more than the feature. Every bar is a real button so the value is
 * reachable by keyboard, and the axis is labelled rather than implied.
 */
function Chart({ series }: { series: DayPoint[] }) {
  const values = series.map((point) => point.effectiveWpm ?? 0);
  const peak = Math.max(1, ...values);

  return (
    <div className="flex h-28 items-end gap-1">
      {series.map((point) => {
        const value = point.effectiveWpm;
        return (
          <button
            key={point.day}
            type="button"
            className="group flex flex-1 flex-col items-center justify-end gap-1"
            // Read out as "19 September, 64" rather than as an unlabelled bar.
            aria-label={`${point.day}: ${value === null ? "—" : displayRate(value)}`}
            title={`${point.day}: ${value === null ? "—" : displayRate(value)}`}
          >
            <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
              {value === null ? "" : displayRate(value)}
            </span>
            <span
              className={`w-full rounded-t ${value === null ? "bg-chart-empty" : "bg-chart-series"}`}
              style={{ height: value === null ? 2 : `${Math.round((value / peak) * 100)}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: React.ReactNode;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/8" : undefined}>
      <CardContent className="flex flex-col items-center gap-1 py-5 text-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`font-display text-lg font-bold tabular-nums ${highlight ? "text-primary" : ""}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
