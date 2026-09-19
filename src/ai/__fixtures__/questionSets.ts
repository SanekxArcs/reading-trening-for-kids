/**
 * Model output, in the shapes it actually arrives in.
 *
 * Written against the real story used in the tests, so the citation check has
 * something true to verify against. The malformed variants are the three
 * failures that genuinely happen: a fenced block, a trailing comma, and a
 * response cut off at the token limit.
 */

export const STORY_SENTENCES = [
  "Одного ранку маленька лисиця вийшла зі своєї затишної нори.",
  "Вона побачила великого сірого журавля біля холодного струмка.",
  "Журавель уважно ловив рибу своїм довгим гострим дзьобом.",
  "Лисиця захотіла подружитися з цим незвичайним птахом.",
  "Вони весело розмовляли аж до самого пізнього вечора.",
];

export const STORY = STORY_SENTENCES.join(" ");

const GOOD_QUESTIONS = [
  {
    type: "literal",
    tier: "easy",
    sentenceIndex: 0,
    rationale: "Про це сказано в першому реченні.",
    prompt: "Хто вийшов з нори?",
    canonicalAnswer: "лисиця",
    acceptableAnswers: ["лисиця", "лисицю", "маленька лисиця"],
    gradingMode: "exact-ish",
  },
  {
    type: "literal",
    tier: "easy",
    sentenceIndex: 2,
    rationale: "Журавель ловив рибу.",
    prompt: "Що ловив журавель?",
    canonicalAnswer: "рибу",
    acceptableAnswers: ["рибу", "риба", "рибку"],
    gradingMode: "exact-ish",
  },
  {
    type: "inference",
    tier: "hard",
    sentenceIndex: 4,
    rationale: "Вони довго розмовляли, отже подружилися.",
    prompt: "Чому лисиця і журавель залишилися разом до вечора?",
    canonicalAnswer: "бо подружилися",
    acceptableAnswers: ["бо подружилися", "стали друзями", "їм було весело"],
    requiredKeywords: [["друг", "дружба", "подружитися", "весело"]],
    gradingMode: "semantic",
  },
];

export const VALID_SET = { language: "uk", questions: GOOD_QUESTIONS };

export const VALID_JSON = JSON.stringify(VALID_SET);

/** Wrapped in a markdown fence, which structured output does not prevent. */
export const FENCED_JSON = "```json\n" + VALID_JSON + "\n```";

/** A comma before a closing bracket. */
export const TRAILING_COMMA_JSON = JSON.stringify(VALID_SET).replace("}]}", "},]}");

/** Cut off mid-object, as a response that hit `maxOutputTokens` would be. */
export const TRUNCATED_JSON = VALID_JSON.slice(0, VALID_JSON.indexOf('"Що ловив') + 5);

/**
 * A question citing a sentence that does not exist, and one whose answer is not
 * in the sentence it cites — the two hallucinations the citation check catches.
 */
export const BAD_CITATIONS_SET = {
  language: "uk",
  questions: [
    GOOD_QUESTIONS[0],
    {
      type: "literal",
      tier: "easy",
      sentenceIndex: 99,
      rationale: "…",
      prompt: "Скільки було зайців?",
      canonicalAnswer: "троє",
      acceptableAnswers: ["троє"],
      gradingMode: "exact-ish",
    },
    {
      type: "literal",
      tier: "easy",
      sentenceIndex: 1,
      rationale: "…",
      prompt: "Що їла лисиця на сніданок?",
      canonicalAnswer: "каша",
      acceptableAnswers: ["каша"],
      gradingMode: "exact-ish",
    },
  ],
};

/** The same question twice, worded almost identically. */
export const DUPLICATE_SET = {
  language: "uk",
  questions: [
    GOOD_QUESTIONS[0],
    { ...GOOD_QUESTIONS[0], sentenceIndex: 0, prompt: "Хто вийшов з нори ?" },
  ],
};

export const MODELS_LIST = {
  models: [
    {
      name: "models/gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      inputTokenLimit: 1_048_576,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ["generateContent", "countTokens"],
    },
    {
      name: "models/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      inputTokenLimit: 1_048_576,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ["generateContent", "countTokens"],
    },
    {
      name: "models/gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash-Lite",
      inputTokenLimit: 1_048_576,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ["generateContent", "countTokens"],
    },
    {
      name: "models/gemini-3-flash",
      displayName: "Gemini 3 Flash",
      inputTokenLimit: 1_048_576,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/text-embedding-004",
      displayName: "Text Embedding",
      supportedGenerationMethods: ["embedContent"],
    },
    {
      name: "models/imagen-3.0-generate-002",
      displayName: "Imagen 3",
      supportedGenerationMethods: ["predict"],
    },
    {
      name: "models/gemini-2.0-flash-live-001",
      displayName: "Live",
      supportedGenerationMethods: ["bidiGenerateContent"],
    },
  ],
};

export const RATE_LIMIT_BODY = {
  error: {
    code: 429,
    message: "Resource has been exhausted (e.g. check quota).",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
    ],
  },
};

export const DAILY_QUOTA_BODY = {
  error: {
    code: 429,
    message: "You exceeded your current quota.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            // The allowance itself. The only place a per-model limit is stated
            // now that the documentation prints none.
            quotaValue: "500",
          },
        ],
      },
    ],
  },
};

export const INVALID_KEY_BODY = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
  },
};

export const RESTRICTED_KEY_BODY = {
  error: {
    code: 403,
    message: "Requests from referer https://example.app are blocked.",
    status: "PERMISSION_DENIED",
  },
};

export const THINKING_REJECTED_BODY = {
  error: {
    code: 400,
    message: "thinkingConfig is not supported for this model.",
    status: "INVALID_ARGUMENT",
  },
};

export const SAFETY_BLOCKED_RESPONSE = {
  promptFeedback: { blockReason: "SAFETY" },
};

export const RECITATION_RESPONSE = {
  candidates: [{ finishReason: "RECITATION" }],
};

export const EMPTY_RESPONSE = { candidates: [] };
