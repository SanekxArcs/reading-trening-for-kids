import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/useI18n";
import { asAiError, errorInfo } from "@/ai/core/errors";
import type { StoryLength } from "@/ai/core/prompts/story";
import { aiContext, requestStory, type StoryOutcome } from "@/ai/service";
import { useSettings } from "@/settings/useSettings";
import { TEXT_LANG_NAMES } from "./textLanguage.ts";
import type { TextLang } from "@/engine";
import type { TranslationKey } from "@/i18n/translations";

const LENGTHS: readonly { id: StoryLength; label: TranslationKey }[] = [
  { id: "short", label: "storyShort" },
  { id: "medium", label: "storyMedium" },
  { id: "long", label: "storyLong" },
];

/**
 * A story to read when there is no book to hand.
 *
 * The parent's escape hatch, and the one that turns "nothing to practise with
 * tonight" into thirty seconds of setup. The story lands in the textarea like a
 * scan does, so it is read and kept, or discarded and asked for again.
 */
export function StoryCard({
  lang,
  onText,
}: {
  lang: TextLang;
  onText: (text: string, title: string) => void;
}) {
  const { t } = useI18n();
  const { settings } = useSettings();

  const [topic, setTopic] = useState("");
  const [length, setLength] = useState<StoryLength>("medium");
  const [busy, setBusy] = useState(false);
  const [story, setStory] = useState<StoryOutcome | null>(null);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const write = async () => {
    const context = aiContext();
    if (!context) {
      setErrorKey("errNoKey");
      return;
    }

    setBusy(true);
    setErrorKey(null);
    try {
      setStory(
        await requestStory(context, {
          lang,
          level: settings.level,
          length,
          ...(topic.trim() ? { topic: topic.trim() } : {}),
        }),
      );
    } catch (error) {
      setErrorKey(errorInfo(asAiError(error).code).parentKey);
      setStory(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("makeStory")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder={t("storyTopicHint")}
          aria-label={t("storyTopic")}
        />

        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={option.id === length ? "default" : "outline"}
              aria-pressed={option.id === length}
              onClick={() => setLength(option.id)}
            >
              {t(option.label)}
            </Button>
          ))}
        </div>

        {/* Said before the request is spent, not after it comes back in the
            wrong language: the story follows the text language above, which is
            not the language of the interface. */}
        <p className="text-xs text-muted-foreground">
          {t("storyLanguage", { answer: TEXT_LANG_NAMES[lang] })}
        </p>

        <Button disabled={busy} onClick={() => void write()}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? t("storyWriting") : t("makeStory")}
        </Button>

        {story && (
          <div className="flex flex-col gap-3">
            <div className="max-h-60 overflow-y-auto rounded-lg bg-muted p-3">
              <p className="font-display font-semibold">{story.title}</p>
              <p className="whitespace-pre-wrap text-sm" lang={lang}>
                {story.text}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("wordsCount", { count: story.wordCount })} ·{" "}
              {t("sentencesCount", { count: story.sentenceCount })}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onText(story.text, story.title);
                  setStory(null);
                }}
              >
                {t("useThisStory")}
              </Button>
              {/* Each press is another request, so it is a button rather than
                  something that happens automatically on a story they dislike. */}
              <Button variant="outline" disabled={busy} onClick={() => void write()}>
                {t("anotherStory")}
              </Button>
            </div>
          </div>
        )}

        {errorKey && (
          <p className="text-sm text-wrong" role="alert">
            {t(errorKey, { seconds: 0, when: "", count: 0 })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
