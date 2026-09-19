import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/useI18n";
import { LANG_LABELS, LANGS } from "@/i18n/translations";
import { useTheme, type Theme } from "@/lib/useTheme";
import { isSpeechSupported } from "@/voice/useSpeech";
import { useSettings } from "./useSettings.ts";
import { ApiKeyCard } from "./ApiKeyCard.tsx";
import { UsageCard } from "./UsageCard.tsx";
import { PinGate } from "./PinGate.tsx";
import { CHILD_LEVELS, type ChildLevel, type TranslationKeyOfLevel } from "./levelLabels.ts";

const THEMES: readonly Theme[] = ["light", "dark", "system"];
const THEME_ICONS: Record<Theme, string> = { light: "☀️", dark: "🌙", system: "💻" };

const LEVEL_KEYS: Record<ChildLevel, TranslationKeyOfLevel> = {
  beginner: "levelBeginner",
  developing: "levelDeveloping",
  fluent: "levelFluent",
  advanced: "levelAdvanced",
};

/**
 * Settings, behind the parent PIN.
 *
 * Everything here belongs to a grown-up: the API key, the reading level, the
 * modes. The usage meter and the daily cap arrive with the request queue in
 * phase 6.
 */
export function SettingsScreen() {
  // Everything below belongs to the parent, starting with the API key.
  return (
    <PinGate>
      <SettingsBody />
    </PinGate>
  );
}

function SettingsBody() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { settings, update } = useSettings();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">{t("settings")}</h1>
      </header>

      <ApiKeyCard />
      <UsageCard />

      <Card>
        <CardHeader>
          <CardTitle>{t("childLevel")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CHILD_LEVELS.map((level) => (
            <Button
              key={level}
              variant={level === settings.level ? "default" : "outline"}
              aria-pressed={level === settings.level}
              onClick={() => update({ level })}
            >
              {t(LEVEL_KEYS[level])}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("readingMode")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={settings.readingMode === "silent" ? "default" : "outline"}
            aria-pressed={settings.readingMode === "silent"}
            onClick={() => update({ readingMode: "silent" })}
          >
            {t("readingModeSilent")}
          </Button>
          <Button
            variant={settings.readingMode === "aloud" ? "default" : "outline"}
            aria-pressed={settings.readingMode === "aloud"}
            onClick={() => update({ readingMode: "aloud" })}
          >
            {t("readingModeAloud")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("answerMode")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={settings.answerMode === "type" ? "default" : "outline"}
            aria-pressed={settings.answerMode === "type"}
            onClick={() => update({ answerMode: "type" })}
          >
            {t("answerModeType")}
          </Button>
          {/* Offered only where the browser can actually do it. Hiding it beats
              a button that does nothing on the one tablet the child uses. */}
          {isSpeechSupported() && (
            <Button
              variant={settings.answerMode === "voice" ? "default" : "outline"}
              aria-pressed={settings.answerMode === "voice"}
              onClick={() => update({ answerMode: "voice" })}
            >
              {t("answerModeVoice")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <ToggleRow
            id="warmup"
            label={t("warmup")}
            checked={settings.warmupEnabled}
            onChange={(warmupEnabled) => update({ warmupEnabled })}
          />
          <ToggleRow
            id="review"
            label={t("reviewQuestions")}
            checked={settings.reviewQuestions}
            onChange={(reviewQuestions) => update({ reviewQuestions })}
          />
          <ToggleRow
            id="sound"
            label={t("sound")}
            checked={settings.soundEnabled}
            onChange={(soundEnabled) => update({ soundEnabled })}
          />
          <ToggleRow
            id="dyslexic"
            label={t("dyslexicFont")}
            checked={settings.dyslexicFont}
            onChange={(dyslexicFont) => update({ dyslexicFont })}
          />
        </CardContent>
      </Card>

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
        <CardContent className="flex flex-wrap gap-2 py-4">
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

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="flex-1 cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
