import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Eye, EyeOff, HelpCircle, Keyboard, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/useI18n";
import { useSettings } from "@/settings/useSettings";
import { useQuiz, type RecordedAnswer } from "./useQuiz.ts";
import { getStoredQuestions } from "./questionSource.ts";
import { resolveAnswers } from "./resolveAnswers.ts";
import { useSpeech } from "@/voice/useSpeech";
import { ModeChoice } from "@/components/ModeChoice";
import { QuickToggles } from "@/components/QuickToggles";
import { LeaveButton } from "@/components/LeaveButton";
import {
  finishSession,
  getSession,
  getText,
  recordOutcome,
  saveAnswers,
} from "@/data/repositories";
import type { StoredSession } from "@/data/db";
import {
  displayPoints,
  isGoalReached,
  settingsForLevel,
  skillId,
  splitSentences,
  wordId,
  type Question,
  type ReadingSettings,
  type ScoreState,
  type StoredText,
} from "@/engine";
import { playSound } from "@/lib/sound";
import { celebrateCombo } from "@/lib/celebrate";
import { readPlayerLevel, raisePlayerLevel } from "@/lib/playerLevel";

interface Loaded {
  session: StoredSession;
  text: StoredText;
  questions: Question[];
}

/**
 * The test.
 *
 * One question at a time, the text gone, no way back to it. That is the whole
 * design: with the text on screen this measures how well a child can search a
 * page, which is a different and much easier skill than understanding what they
 * read.
 */
export function QuizScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { settings, update } = useSettings();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const session = await getSession(sessionId);
      if (!session) return;
      const text = await getText(session.textId);
      if (!text) return;
      const questions = await getStoredQuestions(session.cacheKey, session.textId, session.level);
      setLoaded({ session, text, questions });
    })();
  }, [sessionId]);

  if (!loaded) return null;
  return <QuizBody loaded={loaded} settings={settings} update={update} navigate={navigate} t={t} />;
}

interface BodyProps {
  loaded: Loaded;
  settings: ReadingSettings;
  update: (patch: Partial<ReadingSettings>) => void;
  navigate: ReturnType<typeof useNavigate>;
  t: ReturnType<typeof useI18n>["t"];
}

function QuizBody({ loaded, settings, update, navigate, t }: BodyProps) {
  const { session, text, questions } = loaded;

  const level = settings.level;
  const voice = settings.answerMode === "voice";
  const dyslexic = settings.dyslexicFont;
  // Read once per round: a level earned mid-round must not move the target the
  // child is currently playing towards.
  const [playerLevel] = useState(readPlayerLevel);
  const round = settingsForLevel(settings, playerLevel);

  const sentences = splitSentences(text.body, text.lang);

  const persist = useCallback(
    async (answers: readonly RecordedAnswer[], score: ScoreState) => {
      // The one place the model is asked about answers, and only about the ones
      // the local matcher could not settle. It runs under the "checking your
      // answers" screen, so the wait is somewhere rather than nowhere.
      const resolved = await resolveAnswers(answers, sentences, text.lang, level);

      await saveAnswers(
        resolved.answers.map((answer) => ({
          sessionId: session.id,
          questionId: answer.question.id,
          question: answer.question,
          given: answer.given,
          verdict: answer.verdict,
          judgedBy: answer.judgedBy,
          ms: answer.ms,
          usedHint: answer.usedHint,
        })),
      );

      /**
       * Mastery only records what was actually judged.
       *
       * An `unsure` answer is not evidence of anything yet — folding it in as a
       * failure would quietly tell the progress screen a child is weak at
       * inference when all that happened is nobody has looked at their answer.
       */
      const now = Date.now();
      for (const answer of resolved.answers) {
        if (answer.verdict === "unsure") continue;
        const outcome = {
          isCorrect: answer.verdict === "correct",
          ms: answer.ms,
          level,
          aided: answer.usedHint,
        };
        await recordOutcome(skillId(answer.question.type, level), outcome, now);
        if (answer.question.type === "vocabulary" && !outcome.isCorrect) {
          await recordOutcome(wordId(answer.question.canonicalAnswer), outcome, now);
        }
      }

      const goalReached = isGoalReached(score, round);
      // The level moves here, once, where the round genuinely ends — not on the
      // result screen, which can be opened again from the progress list.
      if (goalReached) raisePlayerLevel();

      await finishSession(session.id, {
        points: displayPoints(score),
        bestStreak: score.bestStreak,
        goalReached,
        playerLevel,
      });
      navigate(`/result/${session.id}`, { replace: true });
    },
    [session.id, level, navigate, sentences, text.lang, round, playerLevel],
  );

  const quiz = useQuiz({
    questions,
    lang: text.lang,
    level,
    onFinish: (answers, score) => void persist(answers, score),
  });

  const { state, question } = quiz;
  const speech = useSpeech(text.lang, quiz.setTyped);

  /**
   * The answer said out loud, once per question.
   *
   * Keyed on the question index rather than on the verdict, so a re-render
   * during the reveal cannot play the same sound twice — the same reason the
   * reveal timer is keyed that way.
   */
  useEffect(() => {
    if (state.phase !== "revealed" || !state.lastVerdict) return;
    playSound(
      state.lastVerdict === "correct"
        ? "correct"
        : state.lastVerdict === "unsure"
          ? "pending"
          : "wrong",
      settings.soundEnabled,
    );
    if (state.lastVerdict === "correct" && state.score.goodStreak >= 3) {
      playSound("comboUp", settings.soundEnabled);
      celebrateCombo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.index]);

  if (state.phase === "finished" || !question) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl items-center justify-center p-4">
        <p className="font-display text-xl text-muted-foreground">{t("checkingAnswers")}</p>
      </div>
    );
  }

  const revealing = state.phase === "revealed";
  const sentence = sentences[question.sentenceIndex]?.text ?? "";
  // Owned by the reducer, which clears it with everything else that belongs to
  // one question. It used to be component state, and it never got cleared.
  const hintShown = state.hintOpen;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* The round is abandoned rather than scored: the session keeps its
              `finishedAt` of null, so a test nobody finished never turns into a
              comprehension percentage on the progress screen. */}
          <LeaveButton onLeave={() => navigate("/", { replace: true })} />
          <p className="text-sm text-muted-foreground">
            {t("questionOf", { current: state.index + 1, total: questions.length })}
          </p>
          {/* The points the child is actually playing for, climbing in front of
              them. Without this the whole scoring layer is invisible, which is
              the same as not existing. */}
          <div className="flex items-center gap-1">
            <QuickToggles settings={settings} update={update} />
          </div>
          <span className="font-display text-sm font-bold tabular-nums text-combo">
            {round.goalEnabled
              ? t("pointsOfGoal", {
                  points: displayPoints(state.score),
                  count: round.goalTarget,
                })
              : t("pointsEarned", { points: displayPoints(state.score) })}
          </span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {questions.map((item, i) => (
            <span
              key={item.id}
              className={`h-1.5 flex-1 rounded-full ${
                i < state.index ? "bg-primary" : i === state.index ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-6 py-8">
          <p
            className="font-display text-2xl leading-relaxed"
            lang={text.lang}
            data-dyslexic={dyslexic || undefined}
          >
            {question.prompt}
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              quiz.submit();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              // Remounting per question clears the field and returns focus
              // without a separate effect to manage it.
              key={question.id}
              value={state.typed}
              onChange={(event) => quiz.setTyped(event.target.value)}
              disabled={revealing}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-14 text-xl"
              aria-label={t("yourAnswer")}
            />

            <div className="flex gap-2">
              <Button type="submit" size="lg" className="h-14 flex-1 text-lg" disabled={revealing}>
                {t("checkAnswer")}
              </Button>

              {/* The recogniser fills the box rather than submitting, so a
                  child can fix a word it misheard instead of losing the answer. */}
              {voice && speech.supported && (
                <Button
                  type="button"
                  size="lg"
                  variant={speech.phase === "listening" ? "default" : "outline"}
                  className="h-14"
                  disabled={revealing}
                  aria-label={speech.phase === "listening" ? t("listening") : t("speakAnswer")}
                  onClick={() => (speech.phase === "listening" ? speech.stop() : speech.listen())}
                >
                  <Mic className={speech.phase === "listening" ? "animate-pulse" : undefined} />
                </Button>
              )}
            </div>
          </form>

          {/* Switched here, mid-round, by whoever is answering. It writes
              through to the same setting the parent screen shows, so a child
              who prefers speaking does not have to re-choose every evening. */}
          <ModeChoice
            label={t("answerMode")}
            value={voice && speech.supported ? "voice" : "type"}
            onChange={(answerMode) => update({ answerMode })}
            options={[
              { id: "type", label: t("answerModeType"), icon: <Keyboard /> },
              {
                id: "voice",
                label: t("answerModeVoice"),
                icon: <Mic />,
                // The browser recogniser, not the model: no key needed, and
                // nothing to offer where the browser has no recogniser.
                available: speech.supported,
              },
            ]}
          />

          {hintShown && (
            <p
              className="rounded-lg bg-muted p-3 text-base"
              lang={text.lang}
              data-dyslexic={dyslexic || undefined}
            >
              {sentence}
            </p>
          )}

          <Button
            variant="ghost"
            className="self-start text-muted-foreground"
            disabled={revealing}
            aria-expanded={hintShown}
            onClick={quiz.toggleHint}
          >
            {hintShown ? <EyeOff /> : <Eye />}
            {hintShown ? t("hideSentence") : t("showSentence")}
            {/* The cost is quoted while it is still a choice, and not again
                afterwards: it has already been paid. */}
            {!state.usedHint && <span className="text-xs">({t("hintCost")})</span>}
          </Button>
        </CardContent>
      </Card>

      {revealing && state.lastVerdict && (
        <div
          role="status"
          className={`flex items-center justify-center gap-2 rounded-lg p-4 text-lg font-semibold ${
            state.lastVerdict === "correct"
              ? "bg-correct/15 text-correct"
              : state.lastVerdict === "unsure"
                ? "bg-muted text-muted-foreground"
                : "bg-wrong/15 text-wrong"
          }`}
        >
          {/* Icon and text together, never colour alone. */}
          {state.lastVerdict === "correct" ? (
            <Check />
          ) : state.lastVerdict === "unsure" ? (
            <HelpCircle />
          ) : (
            <X />
          )}
          {state.lastVerdict === "unsure" && t("childCheckLater")}
        </div>
      )}

      <p className="mt-auto text-center text-sm text-muted-foreground">{t("textIsHidden")}</p>
    </div>
  );
}
