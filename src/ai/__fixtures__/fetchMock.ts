/**
 * A scripted `fetch`, rather than a mocking library.
 *
 * The point is the *sequence*. A single canned response proves almost nothing;
 * `[429 with retry-after, 200 ok]` proves the delay was honoured, and
 * `[400 about thinking, 200 ok]` proves the capability probe retries exactly
 * once. Those are the behaviours worth testing, and they need a script.
 */

export interface Scripted {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ScriptedFetch {
  fetch: typeof globalThis.fetch;
  requests: RecordedRequest[];
}

export function scriptFetch(steps: readonly Scripted[]): ScriptedFetch {
  const requests: RecordedRequest[] = [];
  let index = 0;

  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const step = steps[Math.min(index, steps.length - 1)];
    index++;

    if (!step) throw new Error("scriptFetch: no steps given");

    const headerEntries: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
      for (const [name, value] of Object.entries(rawHeaders as Record<string, string>)) {
        headerEntries[name.toLowerCase()] = value;
      }
    }

    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: headerEntries,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    return Promise.resolve(
      new Response(JSON.stringify(step.body), {
        status: step.status,
        headers: { "content-type": "application/json", ...step.headers },
      }),
    );
  }) as typeof globalThis.fetch;

  return { fetch: impl, requests };
}

/** Wraps a payload the way `generateContent` returns one. */
export function asCandidate(text: string, extra: Record<string, unknown> = {}): unknown {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 400, totalTokenCount: 1200 },
    modelVersion: "gemini-test",
    ...extra,
  };
}

export function asError(code: number, message: string, details?: unknown[]): unknown {
  return { error: { code, message, status: "ERROR", ...(details ? { details } : {}) } };
}
