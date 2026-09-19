import { Type, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { ReadingSettings } from "@/engine";

/**
 * The two switches that get flipped mid-evening, in the corner of the screen
 * they affect.
 *
 * Sound, because a child reading next to a sleeping sibling needs it off in
 * one tap and not through a PIN. Letter spacing, because whether it helps is
 * something you find out by trying it on the text in front of you, and a
 * setting you have to leave the page to change is one nobody compares.
 *
 * The theme stays in settings: it is chosen once and it is not a reading aid.
 */
export function QuickToggles({
  settings,
  update,
}: {
  settings: ReadingSettings;
  update: (patch: Partial<ReadingSettings>) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={settings.soundEnabled}
        aria-label={t("sound")}
        title={t("sound")}
        className={settings.soundEnabled ? undefined : "text-muted-foreground"}
        onClick={() => update({ soundEnabled: !settings.soundEnabled })}
      >
        {settings.soundEnabled ? <Volume2 /> : <VolumeX />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-pressed={settings.dyslexicFont}
        aria-label={t("dyslexicFont")}
        title={t("dyslexicFont")}
        className={settings.dyslexicFont ? "text-primary" : "text-muted-foreground"}
        onClick={() => update({ dyslexicFont: !settings.dyslexicFont })}
      >
        <Type />
      </Button>
    </>
  );
}
