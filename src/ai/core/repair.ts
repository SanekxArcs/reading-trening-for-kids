/**
 * Getting JSON out of what a model actually returned.
 *
 * Structured output mode makes this rare rather than unnecessary. The three
 * things that still happen, in order of frequency: a fenced code block around
 * the JSON, a trailing comma, and a response cut off at `maxOutputTokens`
 * mid-array. All three are recoverable locally, and each one recovered here is
 * an API call not spent on a repair round-trip.
 */

/** Characters a model sometimes substitutes for the ASCII ones JSON requires. */
const SMART_QUOTES: Record<string, string> = {
  "“": '"',
  "”": '"',
  "„": '"',
  "‘": "'",
  "’": "'",
};

function desmarten(text: string): string {
  return text.replace(/[“”„‘’]/g, (char) => SMART_QUOTES[char] ?? char);
}

/**
 * Finds the JSON value inside a response.
 *
 * Scans bracket depth while respecting string literals and escapes — a naive
 * "first { to last }" breaks the moment a question contains a brace, and
 * children's texts contain stranger things than braces.
 */
export function extractJson(raw: string): string | null {
  const text = desmarten(raw.replace(/```(?:json)?/gi, "")).trim();

  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const opener = text[start] as string;
  const closer = opener === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i] as string;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === opener) depth++;
    else if (char === closer) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/** Removes commas that sit immediately before a closing bracket. */
function dropTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Closes a response that was cut off mid-flight.
 *
 * The insight that makes this worth doing: a question set truncated at item 7
 * of 9 is a perfectly good 7-question set. Dropping the partial element and
 * closing the brackets costs nothing and saves a whole round-trip.
 */
export function salvageTruncated(raw: string): string | null {
  const text = desmarten(raw.replace(/```(?:json)?/gi, "")).trim();
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** Index just after the last element that closed cleanly at depth 2. */
  let lastSafeComma = -1;

  for (let i = start; i < text.length; i++) {
    const char = text[i] as string;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") stack.pop();
    else if (char === "," && stack.length <= 3) lastSafeComma = i;
  }

  if (stack.length === 0) return null; // nothing was truncated

  // Cut back to the last complete element, then close what is still open.
  const body = lastSafeComma > start ? text.slice(start, lastSafeComma) : text.slice(start);
  return dropTrailingCommas(body) + stack.toReversed().join("");
}

export interface ParseOutcome {
  value: unknown;
  /** True when the raw text was not valid JSON on its own. */
  repaired: boolean;
}

/**
 * Parses, trying progressively harder.
 *
 * Returns null only when there is genuinely nothing recoverable, at which point
 * the caller spends its one repair call — or gives up and falls back to the
 * offline questions.
 */
export function parseLoosely(raw: string): ParseOutcome | null {
  try {
    return { value: JSON.parse(raw), repaired: false };
  } catch {
    /* keep going */
  }

  const extracted = extractJson(raw);
  if (extracted) {
    try {
      return { value: JSON.parse(extracted), repaired: true };
    } catch {
      try {
        return { value: JSON.parse(dropTrailingCommas(extracted)), repaired: true };
      } catch {
        /* keep going */
      }
    }
  }

  const salvaged = salvageTruncated(raw);
  if (salvaged) {
    try {
      return { value: JSON.parse(salvaged), repaired: true };
    } catch {
      /* out of ideas */
    }
  }

  return null;
}
