import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/useI18n";
import { checkPin, hasPin, isUnlocked, setPin } from "./pin.ts";

/**
 * Stands between a child and the settings screen.
 *
 * Three states: no PIN yet (offer to set one, and let them through either way),
 * locked, and unlocked. Skipping is allowed on purpose — a parent who has not
 * set a PIN should not be blocked out of their own settings by a screen
 * demanding they invent one first.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const [configuring, setConfiguring] = useState(() => !hasPin());
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  if (unlocked && !configuring) return <>{children}</>;

  const submit = async () => {
    if (configuring) {
      if (value.length >= 4) {
        await setPin(value);
        setConfiguring(false);
        setUnlocked(true);
      }
      return;
    }

    const ok = await checkPin(value);
    setWrong(!ok);
    setValue("");
    if (ok) setUnlocked(true);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
      </header>

      <Card className="mt-auto mb-auto">
        <CardContent className="flex flex-col items-center gap-5 py-10">
          <Lock className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-center font-display text-lg">
            {configuring ? t("pin") : t("pinPrompt")}
          </p>

          <form
            className="flex w-full flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={value}
              onChange={(event) => {
                setValue(event.target.value.replace(/\D/g, "").slice(0, 8));
                setWrong(false);
              }}
              className="h-14 text-center text-2xl tracking-widest"
              aria-label={t("pin")}
              autoFocus
            />

            {wrong && (
              <p className="text-center text-sm text-wrong" role="alert">
                {t("pinWrong")}
              </p>
            )}

            <Button type="submit" size="lg" disabled={value.length < 4}>
              {configuring ? t("save") : t("checkAnswer")}
            </Button>
          </form>

          {configuring && (
            // A parent who does not want a PIN must not be locked out of their
            // own settings by a screen insisting they invent one.
            <Button variant="ghost" onClick={() => setConfiguring(false)}>
              {t("cancel")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
