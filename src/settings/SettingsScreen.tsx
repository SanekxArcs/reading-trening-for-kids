import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import { LANG_LABELS, LANGS } from "@/i18n/translations";
import { useTheme, type Theme } from "@/lib/useTheme";

const THEMES: readonly Theme[] = ["light", "dark", "system"];
const THEME_ICONS: Record<Theme, string> = { light: "☀️", dark: "🌙", system: "💻" };

/**
 * Settings, and eventually the parent gate.
 *
 * Phase 1 scaffolding: only the two settings that need no storage layer yet.
 * The PIN gate, the API key field, the model picker and the usage meter all
 * arrive in phase 4 — and this whole screen sits behind the PIN from then on.
 */
export function SettingsScreen() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">{t("settings")}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("interfaceLanguage")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LANGS.map((code) => (
            <Button
              key={code}
              variant={code === lang ? "default" : "outline"}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
            >
              {LANG_LABELS[code]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Label>Theme</Label>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {THEMES.map((option) => (
            <Button
              key={option}
              variant={option === theme ? "default" : "outline"}
              aria-pressed={option === theme}
              onClick={() => setTheme(option)}
            >
              <span aria-hidden>{THEME_ICONS[option]}</span>
              {option}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
