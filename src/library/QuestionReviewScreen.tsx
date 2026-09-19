import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import type { TranslationKey } from "@/i18n/translations";
import { getText, saveReviewedQuestions } from "@/data/repositories";
import { getQuestionsFor } from "@/quiz/questionSource.ts";
import { useSettings } from "@/settings/useSettings";
import { PinGate } from "@/settings/PinGate";
import { errorInfo } from "@/ai/core/errors";
import { splitSentences, type Question, type QuestionType, type StoredText } from "@/engine";
import {
  blankQuestion,
  editQuestion,
  formatAnswers,
  isUsable,
  parseAnswers,
  readyToApprove,
  removeQuestion,
} from "./reviewEdits.ts";

const TYPE_LABEL: Record<QuestionType, TranslationKey> = {
  literal: "skillLiteral",
  sequence: "skillSequence",
  vocabulary: "skillVocabulary",
  inference: "skillInference",
  main_idea: "skillMainIdea",
};

/**
 * The questions, before a child ever sees them.
 *
 * This screen is the reason `reviewQuestions` defaults to on. A model can ask
 * about something the text never says; the citation check catches most of that
 * and this catches the rest — and because the questions are generated *here*,
 * with review on, a child's read never spends a request of its own.
 *
 * It is also where a parent adds the question they actually care about, which
 * no prompt will ever guess.
 */
export function QuestionReviewScreen() {
  return (
    <PinGate>
      <ReviewBody />
    </PinGate>
  );
}

function ReviewBody() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { textId } = useParams<{ textId: string }>();
  const { settings } = useSettings();

  const [text, setText] = useState<StoredText | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [fromModel, setFromModel] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!textId) return;
    const abort = new AbortController();

    void (async () => {
      const loaded = await getText(textId);
      if (!loaded) return;
      setText(loaded);

      // The one caller allowed to generate while review is on — which is the
      // whole point of the screen, and why it is behind the PIN.
      const source = await getQuestionsFor(loaded, settings, {
        forReview: true,
        signal: abort.signal,
      });
      setCacheKey(source.cacheKey);
      setQuestions(source.questions);
      setFromModel(source.fromModel);
      setErrorKey(source.failure ? errorInfo(source.failure).parentKey : null);
    })();

    return () => abort.abort();
  }, [textId, settings]);

  const sentences = useMemo(() => (text ? splitSentences(text.body, text.lang) : []), [text]);

  if (!text || questions === null) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("reviewPreparing")}</p>
      </div>
    );
  }

  const done = async () => {
    if (!cacheKey) return;
    setSaving(true);
    await saveReviewedQuestions(cacheKey, questions);
    navigate(`/read/${text.id}`, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">{t("reviewTitle")}</h1>
          <p className="truncate text-sm text-muted-foreground">{text.title}</p>
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        {fromModel ? t("reviewIntro") : t("reviewPractice")}
      </p>

      {errorKey && (
        <p className="rounded-lg bg-muted p-3 text-sm" role="alert">
          {t(errorKey, { seconds: 0, when: "", count: settings.maxQuestions })}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {questions.map((question, index) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              number={index + 1}
              sentences={sentences}
              onChange={(patch) => setQuestions(editQuestion(questions, question.id, patch))}
              onRemove={() => setQuestions(removeQuestion(questions, question.id))}
            />
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        onClick={() => setQuestions([...questions, blankQuestion(questions, 0)])}
      >
        <Plus />
        {t("reviewAddQuestion")}
      </Button>

      <div className="sticky bottom-4 mt-auto pt-4">
        <Button
          size="lg"
          className="h-14 w-full text-lg"
          disabled={saving || !readyToApprove(questions)}
          onClick={() => void done()}
        >
          {t("reviewApprove")}
        </Button>
        {!readyToApprove(questions) && (
          <p className="mt-2 text-center text-sm text-muted-foreground">{t("reviewIncomplete")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * One question, opened up.
 *
 * The sentence that proves the answer is shown next to it rather than hidden
 * behind the index — the parent is being asked "is this fair?", and they cannot
 * answer that without seeing what the child will have read.
 */
function QuestionCard({
  question,
  number,
  sentences,
  onChange,
  onRemove,
}: {
  question: Question;
  number: number;
  sentences: readonly { index: number; text: string }[];
  onChange: (patch: { prompt?: string; answers?: string[]; sentenceIndex?: number }) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  // Held as text while it is being typed: parsing on every keystroke would eat
  // the comma the moment a parent typed it.
  const [answerField, setAnswerField] = useState(() => formatAnswers(question.acceptableAnswers));
  const cited = sentences[question.sentenceIndex];

  return (
    <Card className={isUsable(question) ? undefined : "border-wrong"}>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-muted-foreground">{number}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {t(TYPE_LABEL[question.type])}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label={t("delete")}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${question.id}-prompt`}>{t("reviewPrompt")}</Label>
          <Input
            id={`${question.id}-prompt`}
            value={question.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${question.id}-answers`}>{t("reviewAnswers")}</Label>
          <Input
            id={`${question.id}-answers`}
            value={answerField}
            onChange={(event) => {
              setAnswerField(event.target.value);
              onChange({ answers: parseAnswers(event.target.value) });
            }}
          />
          <p className="text-xs text-muted-foreground">{t("reviewAnswersHint")}</p>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${question.id}-sentence`}>{t("reviewFrom")}</Label>
          <select
            id={`${question.id}-sentence`}
            className="h-10 rounded-lg border border-input bg-background px-3"
            value={question.sentenceIndex}
            onChange={(event) => onChange({ sentenceIndex: Number(event.target.value) })}
          >
            {sentences.map((sentence) => (
              <option key={sentence.index} value={sentence.index}>
                {sentence.index + 1}. {sentence.text.slice(0, 60)}
              </option>
            ))}
          </select>
          {cited && <p className="rounded-lg bg-muted p-2 text-sm">{cited.text}</p>}
        </div>

        {question.rationale && (
          <p className="text-xs text-muted-foreground">{question.rationale}</p>
        )}
      </CardContent>
    </Card>
  );
}
