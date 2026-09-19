export const LANGS = ["uk", "pl", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  uk: "🇺🇦 Українська",
  pl: "🇵🇱 Polski",
  en: "🇬🇧 English",
};

/**
 * English is the source of truth for the key set: `TranslationKey` is derived
 * from it, and the other languages are typed as complete records, so a missing
 * or misspelled key is a compile error rather than a string that silently falls
 * back to its own name in front of a child.
 *
 * `{braces}` mark interpolated values.
 *
 * Note which languages these are and which they are not. The UI language is a
 * separate thing from the language of the text being read: a Ukrainian child in
 * a Polish school reads Polish texts through a Ukrainian interface, and the
 * question language always follows the text, never this setting.
 */
const en = {
  // Shell
  appName: "Chytayko",
  library: "Texts",
  progress: "Progress",
  settings: "Settings",
  back: "Back",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  retry: "Try again",
  close: "Close",

  // Library
  addText: "Add a text",
  pasteText: "Paste text",
  photographPages: "Photograph pages",
  noTextsYet: "No texts yet. Add the first one.",
  wordsCount: "{count} words",
  sentencesCount: "{count} sentences",
  readTimes: "read {count} times",
  neverRead: "not read yet",

  // Reading
  ready: "Ready?",
  startReading: "Start reading",
  iHaveRead: "I've read it",
  readingPaused: "Paused",
  resume: "Resume",
  warmupTitle: "Words worth knowing",
  readAloudHint: "Read out loud, clearly, into the microphone.",

  // Quiz
  questionOf: "Question {current} of {total}",
  yourAnswer: "Your answer",
  checkAnswer: "Check",
  speakAnswer: "Answer with your voice",
  listening: "Listening…",
  showSentence: "Show me where",
  hintCost: "no points for this one",
  textIsHidden: "The text is hidden now — answer from memory.",
  checkingAnswers: "Checking your answers…",

  // Result
  comprehension: "Comprehension",
  speed: "Speed",
  effectiveSpeed: "Effective speed",
  wordsPerMinute: "{count} wpm",
  yourAnswerWas: "You wrote: {answer}",
  correctAnswerIs: "The answer: {answer}",
  fromSentence: "From the text: {sentence}",
  grownUpWillCheck: "A grown-up will check this one",
  fasterThanLast: "{count} wpm faster than last time",
  slowerThanLast: "{count} wpm slower than last time",
  readTooFast: "That was very fast — this one is not counted for speed.",
  pointsEarned: "{points} points",
  bestStreak: "best streak {count}",

  // Settings
  childLevel: "Reading level",
  levelBeginner: "Just starting",
  levelDeveloping: "Getting there",
  levelFluent: "Reads well",
  levelAdvanced: "Strong reader",
  readingMode: "How to read",
  readingModeSilent: "Silently",
  readingModeAloud: "Out loud",
  answerMode: "How to answer",
  answerModeType: "Typing",
  answerModeVoice: "Voice",
  interfaceLanguage: "Interface language",
  apiKey: "Gemini API key",
  apiKeyHelp:
    "Stored on this device only. Create a separate key, restrict it to the Generative Language API, and delete it here when you're done.",
  apiKeyValid: "Key works. {count} models available.",
  model: "Model",
  usageToday: "Today: {requests} requests, {tokens} tokens",
  dailyCap: "Stop after this many requests a day",
  reviewQuestions: "Review questions before my child sees them",
  warmup: "Warm-up with hard words",
  sound: "Sound",
  pin: "Parent PIN",
  pinPrompt: "Enter the parent PIN",
  pinWrong: "Wrong PIN",

  // What the child is told when something is unavailable. Three states, ever,
  // and none of them mentions an API, a key, a quota or a model.
  childQuestionsUnavailable: "Today we're reading without questions.",
  childCheckLater: "A grown-up will check these answers.",
  childTryAgain: "Let's try that again.",

  // What the parent is told. Actionable, specific, and kept off the child's screen.
  errNoKey: "No Gemini key yet. Add one in Settings to get real comprehension questions.",
  errInvalidKey: "That key was rejected. Check it was copied in full from AI Studio.",
  errKeyRestricted:
    "The key is restricted and this app's address isn't allowed. In Google Cloud, allow this site under the key's HTTP referrer restrictions — an IP restriction can never work from a browser.",
  errRateLimited: "Gemini is rate-limiting this key. Waiting {seconds}s, then trying again.",
  errDailyQuota: "The free daily quota is used up. It resets around {when}.",
  errLocalCap: "Your own daily limit of {count} requests is reached. Raise it in Settings.",
  errServerBusy: "Gemini is busy. Trying again shortly.",
  errOffline: "No connection. Texts and questions you already have still work.",
  errTimeout: "Gemini took too long to answer.",
  errBadJson: "Gemini's answer couldn't be read, even after a repair attempt.",
  errSafetyBlocked: "Gemini refused this text. Try a different passage.",
  errRecitationBlocked:
    "Gemini won't work with this text because it recognises it as a published book. Type a shorter excerpt, or use the offline questions.",
  errEmptyResponse: "Gemini returned nothing for this text.",
  errPayloadTooLarge: "That's too much at once. Use fewer pages or a shorter recording.",
  errUnknown: "Something went wrong talking to Gemini.",
} satisfies Record<string, string>;

export type TranslationKey = keyof typeof en;

const uk: Record<TranslationKey, string> = {
  appName: "Читайко",
  library: "Тексти",
  progress: "Прогрес",
  settings: "Налаштування",
  back: "Назад",
  cancel: "Скасувати",
  save: "Зберегти",
  delete: "Видалити",
  retry: "Спробувати ще",
  close: "Закрити",

  addText: "Додати текст",
  pasteText: "Вставити текст",
  photographPages: "Сфотографувати сторінки",
  noTextsYet: "Текстів ще немає. Додай перший.",
  wordsCount: "{count} слів",
  sentencesCount: "{count} речень",
  readTimes: "прочитано {count} разів",
  neverRead: "ще не читали",

  ready: "Готовий?",
  startReading: "Почати читати",
  iHaveRead: "Я прочитав",
  readingPaused: "Пауза",
  resume: "Далі",
  warmupTitle: "Слова, які варто знати",
  readAloudHint: "Читай уголос, чітко, у мікрофон.",

  questionOf: "Питання {current} з {total}",
  yourAnswer: "Твоя відповідь",
  checkAnswer: "Перевірити",
  speakAnswer: "Відповісти голосом",
  listening: "Слухаю…",
  showSentence: "Покажи, де це",
  hintCost: "за це балів не буде",
  textIsHidden: "Текст сховано — відповідай з пам'яті.",
  checkingAnswers: "Перевіряю твої відповіді…",

  comprehension: "Розуміння",
  speed: "Швидкість",
  effectiveSpeed: "Ефективна швидкість",
  wordsPerMinute: "{count} сл/хв",
  yourAnswerWas: "Ти написав: {answer}",
  correctAnswerIs: "Відповідь: {answer}",
  fromSentence: "У тексті: {sentence}",
  grownUpWillCheck: "Це перевірить дорослий",
  fasterThanLast: "на {count} сл/хв швидше, ніж минулого разу",
  slowerThanLast: "на {count} сл/хв повільніше, ніж минулого разу",
  readTooFast: "Це було дуже швидко — цей раз не рахуємо у швидкість.",
  pointsEarned: "{points} балів",
  bestStreak: "найкраща серія {count}",

  childLevel: "Рівень читання",
  levelBeginner: "Тільки починає",
  levelDeveloping: "Вже виходить",
  levelFluent: "Читає добре",
  levelAdvanced: "Впевнений читач",
  readingMode: "Як читати",
  readingModeSilent: "Про себе",
  readingModeAloud: "Уголос",
  answerMode: "Як відповідати",
  answerModeType: "Друкувати",
  answerModeVoice: "Голосом",
  interfaceLanguage: "Мова інтерфейсу",
  apiKey: "Ключ Gemini API",
  apiKeyHelp:
    "Зберігається тільки на цьому пристрої. Створи окремий ключ, обмеж його Generative Language API, і видали тут, коли більше не потрібен.",
  apiKeyValid: "Ключ працює. Доступно моделей: {count}.",
  model: "Модель",
  usageToday: "Сьогодні: {requests} запитів, {tokens} токенів",
  dailyCap: "Зупинятись після стількох запитів на день",
  reviewQuestions: "Переглядати питання перед тим, як їх побачить дитина",
  warmup: "Розминка зі складними словами",
  sound: "Звук",
  pin: "Батьківський PIN",
  pinPrompt: "Введи батьківський PIN",
  pinWrong: "Невірний PIN",

  childQuestionsUnavailable: "Сьогодні читаємо без питань.",
  childCheckLater: "Ці відповіді перевірить дорослий.",
  childTryAgain: "Спробуймо ще раз.",

  errNoKey: "Ключа Gemini ще немає. Додай його в Налаштуваннях, щоб були справжні питання.",
  errInvalidKey: "Цей ключ відхилено. Перевір, чи скопійовано його повністю з AI Studio.",
  errKeyRestricted:
    "Ключ обмежено, і адреса цього застосунку не в списку дозволених. У Google Cloud додай цей сайт в обмеження ключа за HTTP-referrer — обмеження за IP з браузера не спрацює ніколи.",
  errRateLimited: "Gemini обмежує швидкість для цього ключа. Чекаю {seconds}с і пробую знову.",
  errDailyQuota: "Безкоштовна денна квота вичерпана. Оновиться близько {when}.",
  errLocalCap:
    "Досягнуто твій власний ліміт — {count} запитів на день. Зміни його в Налаштуваннях.",
  errServerBusy: "Gemini зайнятий. Скоро спробую ще раз.",
  errOffline: "Немає зв'язку. Тексти й питання, які вже є, працюють далі.",
  errTimeout: "Gemini відповідав занадто довго.",
  errBadJson: "Відповідь Gemini не вдалося прочитати навіть після спроби полагодити.",
  errSafetyBlocked: "Gemini відмовився працювати з цим текстом. Спробуй інший уривок.",
  errRecitationBlocked:
    "Gemini не працює з цим текстом, бо впізнає в ньому видану книжку. Набери коротший уривок або грай з локальними питаннями.",
  errEmptyResponse: "Gemini не повернув нічого для цього тексту.",
  errPayloadTooLarge: "Забагато за раз. Візьми менше сторінок або коротший запис.",
  errUnknown: "Щось пішло не так у розмові з Gemini.",
};

const pl: Record<TranslationKey, string> = {
  appName: "Czytajko",
  library: "Teksty",
  progress: "Postępy",
  settings: "Ustawienia",
  back: "Wstecz",
  cancel: "Anuluj",
  save: "Zapisz",
  delete: "Usuń",
  retry: "Spróbuj ponownie",
  close: "Zamknij",

  addText: "Dodaj tekst",
  pasteText: "Wklej tekst",
  photographPages: "Zrób zdjęcia stron",
  noTextsYet: "Nie ma jeszcze tekstów. Dodaj pierwszy.",
  wordsCount: "{count} słów",
  sentencesCount: "{count} zdań",
  readTimes: "przeczytane {count} razy",
  neverRead: "jeszcze nieczytane",

  ready: "Gotowy?",
  startReading: "Zacznij czytać",
  iHaveRead: "Przeczytałem",
  readingPaused: "Pauza",
  resume: "Dalej",
  warmupTitle: "Słowa, które warto znać",
  readAloudHint: "Czytaj na głos, wyraźnie, do mikrofonu.",

  questionOf: "Pytanie {current} z {total}",
  yourAnswer: "Twoja odpowiedź",
  checkAnswer: "Sprawdź",
  speakAnswer: "Odpowiedz głosem",
  listening: "Słucham…",
  showSentence: "Pokaż, gdzie to jest",
  hintCost: "za to nie ma punktów",
  textIsHidden: "Tekst jest schowany — odpowiadaj z pamięci.",
  checkingAnswers: "Sprawdzam twoje odpowiedzi…",

  comprehension: "Zrozumienie",
  speed: "Szybkość",
  effectiveSpeed: "Szybkość efektywna",
  wordsPerMinute: "{count} sł/min",
  yourAnswerWas: "Napisałeś: {answer}",
  correctAnswerIs: "Odpowiedź: {answer}",
  fromSentence: "W tekście: {sentence}",
  grownUpWillCheck: "To sprawdzi dorosły",
  fasterThanLast: "o {count} sł/min szybciej niż poprzednio",
  slowerThanLast: "o {count} sł/min wolniej niż poprzednio",
  readTooFast: "To było bardzo szybko — tego razu nie liczymy do szybkości.",
  pointsEarned: "{points} punktów",
  bestStreak: "najlepsza seria {count}",

  childLevel: "Poziom czytania",
  levelBeginner: "Dopiero zaczyna",
  levelDeveloping: "Już idzie",
  levelFluent: "Czyta dobrze",
  levelAdvanced: "Pewny czytelnik",
  readingMode: "Jak czytać",
  readingModeSilent: "Po cichu",
  readingModeAloud: "Na głos",
  answerMode: "Jak odpowiadać",
  answerModeType: "Pisanie",
  answerModeVoice: "Głosem",
  interfaceLanguage: "Język interfejsu",
  apiKey: "Klucz Gemini API",
  apiKeyHelp:
    "Przechowywany tylko na tym urządzeniu. Utwórz osobny klucz, ogranicz go do Generative Language API i usuń tutaj, gdy nie będzie potrzebny.",
  apiKeyValid: "Klucz działa. Dostępnych modeli: {count}.",
  model: "Model",
  usageToday: "Dzisiaj: {requests} zapytań, {tokens} tokenów",
  dailyCap: "Zatrzymaj się po tylu zapytaniach dziennie",
  reviewQuestions: "Przeglądaj pytania, zanim zobaczy je dziecko",
  warmup: "Rozgrzewka z trudnymi słowami",
  sound: "Dźwięk",
  pin: "PIN rodzica",
  pinPrompt: "Podaj PIN rodzica",
  pinWrong: "Zły PIN",

  childQuestionsUnavailable: "Dzisiaj czytamy bez pytań.",
  childCheckLater: "Te odpowiedzi sprawdzi dorosły.",
  childTryAgain: "Spróbujmy jeszcze raz.",

  errNoKey: "Nie ma jeszcze klucza Gemini. Dodaj go w Ustawieniach, żeby mieć prawdziwe pytania.",
  errInvalidKey: "Ten klucz został odrzucony. Sprawdź, czy skopiowałeś go w całości z AI Studio.",
  errKeyRestricted:
    "Klucz jest ograniczony, a adres tej aplikacji nie jest dozwolony. W Google Cloud dodaj tę stronę do ograniczeń klucza według HTTP referrer — ograniczenie po IP nigdy nie zadziała z przeglądarki.",
  errRateLimited: "Gemini ogranicza tempo dla tego klucza. Czekam {seconds}s i próbuję ponownie.",
  errDailyQuota: "Darmowy dzienny limit został wyczerpany. Odnowi się około {when}.",
  errLocalCap: "Osiągnięto twój własny limit {count} zapytań dziennie. Zmień go w Ustawieniach.",
  errServerBusy: "Gemini jest zajęty. Zaraz spróbuję ponownie.",
  errOffline: "Brak połączenia. Teksty i pytania, które już masz, nadal działają.",
  errTimeout: "Gemini odpowiadał zbyt długo.",
  errBadJson: "Nie udało się odczytać odpowiedzi Gemini, nawet po próbie naprawy.",
  errSafetyBlocked: "Gemini odmówił pracy z tym tekstem. Spróbuj innego fragmentu.",
  errRecitationBlocked:
    "Gemini nie zadziała z tym tekstem, bo rozpoznaje w nim wydaną książkę. Wpisz krótszy fragment albo graj z pytaniami offline.",
  errEmptyResponse: "Gemini nie zwrócił nic dla tego tekstu.",
  errPayloadTooLarge: "Za dużo naraz. Weź mniej stron albo krótsze nagranie.",
  errUnknown: "Coś poszło nie tak w rozmowie z Gemini.",
};

export const translations: Record<Lang, Record<TranslationKey, string>> = { uk, pl, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export function translate(
  lang: Lang,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const template = translations[lang][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    // An unknown placeholder is left as-is rather than blanked, so a typo shows
    // up as "{count}" on screen instead of a silently missing number.
    name in vars ? String(vars[name]) : whole,
  );
}
