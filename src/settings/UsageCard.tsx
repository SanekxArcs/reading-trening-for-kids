import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import type { DayLedger } from "@/ai/core/budget";
import { dailyBudget, limitsFor } from "@/ai/core/modelLimits";
import { readCaps, recentDays, writeCaps } from "@/ai/runtime/ledger";
import { readObservedLimit } from "@/ai/runtime/quota";
import { readModelId } from "@/ai/runtime/key";
import { clearLastFailure, readLastFailure } from "@/ai/runtime/diagnostics";

/**
 * What the key was spent on, against what this model actually allows.
 *
 * "12 requests today" is not information — twelve out of twenty is a problem
 * and twelve out of five hundred is nothing, and the difference is the model.
 * So the meter is drawn against whichever limit binds first: the parent's own
 * cap, or the model's daily allowance.
 *
 * Where the allowance comes from is shown too, because it changes what to do
 * about it. An estimate is marked with a "~": Google no longer publishes these
 * numbers, so until a refusal states the real one, this is the best the app
 * has. After that it is exact and says so.
 */
export function UsageCard() {
  const { t } = useI18n();
  const [days, setDays] = useState<DayLedger[]>([]);
  const [cap, setCap] = useState(() => readCaps().maxRequestsPerDay);
  const [modelId] = useState(() => readModelId());
  const [failure, setFailure] = useState(() => readLastFailure());

  useEffect(() => {
    void recentDays(7).then(setDays);
  }, []);

  const today = days.at(-1);
  const peak = Math.max(1, ...days.map((day) => day.requests));

  const used = today?.requests ?? 0;
  const limits = modelId ? limitsFor(modelId, readObservedLimit(modelId)) : null;
  const budget = dailyBudget(used, cap, limits);
  const share = Math.min(1, used / Math.max(1, budget.limit));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("usageToday", {
            requests: used,
            tokens: (today?.promptTokens ?? 0) + (today?.outputTokens ?? 0),
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* The number that decides whether tonight works. Drawn as a share of
            the binding limit rather than as a bare count. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="tabular-nums">
              {t("requestsOfLimit", {
                requests: used,
                count: budget.limit,
                answer: budget.approximate ? "~" : "",
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              {budget.binding === "model"
                ? t("limitFromModel", { answer: modelId ?? "" })
                : t("limitFromYou")}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${share > 0.85 ? "bg-wrong" : "bg-chart-series"}`}
              style={{ width: `${Math.round(share * 100)}%` }}
              aria-hidden
            />
          </div>
          {limits && (
            <p className="text-xs text-muted-foreground">
              {limits.source === "estimated" ? t("limitEstimated") : t("limitObserved")}
            </p>
          )}
        </div>

        {/* Seven bars, each labelled with its own number: a sparkline nobody
            can read is decoration, and colour alone is not a label. */}
        <div className="flex h-16 items-end gap-1">
          {days.map((day) => (
            <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-chart-series"
                style={{ height: `${Math.round((day.requests / peak) * 100)}%`, minHeight: 2 }}
                aria-hidden
              />
              <span className="text-[10px] tabular-nums text-muted-foreground">{day.requests}</span>
            </div>
          ))}
        </div>

        {today && Object.keys(today.byLabel).length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(today.byLabel).map(([label, count]) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
        )}

        {/* What actually went wrong, for the grown-up. The message the app
            shows during a session is short on purpose and says nothing a bug
            report could use. */}
        {failure && (
          <details className="rounded-lg bg-muted p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {t("lastError", {
                answer: failure.code,
                when: new Date(failure.at).toLocaleString(),
              })}
            </summary>
            <p className="mt-2 break-words font-mono text-[11px]">
              {failure.label}: {failure.detail}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                clearLastFailure();
                setFailure(null);
              }}
            >
              {t("close")}
            </Button>
          </details>
        )}

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="cap" className="flex-1">
            {t("dailyCap")}
          </Label>
          <Input
            id="cap"
            type="number"
            min={1}
            max={2000}
            value={cap}
            className="w-24"
            onChange={(event) => {
              const next = Math.max(1, Number(event.target.value) || 1);
              setCap(next);
              writeCaps({ ...readCaps(), maxRequestsPerDay: next });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
