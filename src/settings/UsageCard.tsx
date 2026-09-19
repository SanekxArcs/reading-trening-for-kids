import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import type { DayLedger } from "@/ai/core/budget";
import { readCaps, recentDays, writeCaps } from "@/ai/runtime/ledger";

/**
 * What the key was spent on, and the parent's own limit on spending more.
 *
 * `usageMetadata` comes back with every response for free, so this costs
 * nothing to keep — and the per-label breakdown answers the question a parent
 * actually has, which is not "how many tokens" but "what used them".
 */
export function UsageCard() {
  const { t } = useI18n();
  const [days, setDays] = useState<DayLedger[]>([]);
  const [cap, setCap] = useState(() => readCaps().maxRequestsPerDay);

  useEffect(() => {
    void recentDays(7).then(setDays);
  }, []);

  const today = days.at(-1);
  const peak = Math.max(1, ...days.map((day) => day.requests));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("usageToday", {
            requests: today?.requests ?? 0,
            tokens: (today?.promptTokens ?? 0) + (today?.outputTokens ?? 0),
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
