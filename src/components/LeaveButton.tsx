import { useState } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";

/**
 * The way out, from the top of a screen that otherwise has none.
 *
 * Reading and answering both deliberately trap the child: the text cannot be
 * reached from the questions, and there is no going back to a question already
 * answered. That is right for the measurement and wrong for everything else —
 * a wrong text, a sibling's turn, or bedtime arriving all need a door.
 *
 * It asks first. One tap away from the exit is fine; one tap from losing a
 * round that has been going for four minutes is not, and a seven-year-old taps
 * everything at the top of a screen at least once.
 */
export function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t("leave")} onClick={() => setArmed(true)}>
        <Home />
      </Button>

      {armed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("leaveQuestion")}
        >
          <Card className="w-full max-w-sm">
            <CardContent className="flex flex-col gap-4 py-8 text-center">
              <p className="font-display text-xl font-bold">{t("leaveQuestion")}</p>
              {/* Staying is the bigger, default button: the common reason to be
                  looking at this dialog is having opened it by accident. */}
              <Button size="lg" className="h-14 text-lg" onClick={() => setArmed(false)}>
                {t("leaveStay")}
              </Button>
              <Button variant="outline" onClick={onLeave}>
                {t("leaveYes")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
