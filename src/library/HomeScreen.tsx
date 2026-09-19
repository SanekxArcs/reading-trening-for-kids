import { Link } from "react-router-dom";
import { BookOpen, Plus, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/useI18n";

/**
 * The library — the first thing anyone sees.
 *
 * Phase 1 scaffolding: the shell, the navigation and the empty state are real;
 * the list of texts arrives with the Dexie layer in phase 2.
 */
export function HomeScreen() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold text-primary">{t("appName")}</h1>
        <Button asChild variant="ghost" size="icon" aria-label={t("settings")}>
          <Link to="/settings">
            <SettingsIcon />
          </Link>
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <BookOpen className="size-10 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">{t("noTextsYet")}</p>
          <Button size="lg" disabled>
            <Plus />
            {t("addText")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
