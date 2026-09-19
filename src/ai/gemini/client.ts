import { AiError } from "../core/errors.ts";
import { isThinkingComplaint, toAiError } from "./map.ts";
import type {
  GeminiErrorBody,
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiListModelsResponse,
} from "./wire.ts";

/**
 * The only file in the app that calls `fetch`.
 *
 * Kept as thin as it can be: transport, timeouts and turning a failed response
 * into an `AiError`. Every decision it looks like it is making is a pure
 * function in `map.ts`.
 */

export const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Generous for a text request, and the audio path will want its own. */
const DEFAULT_TIMEOUT_MS = 45_000;

export interface ClientOptions {
  apiKey: string;
  /** Injected in tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The key travels in a header, never in the query string.
 *
 * A key in a URL ends up in `performance.getEntries()`, in devtools history,
 * and in any `Referer` the page happens to send. The header costs a CORS
 * preflight and nothing else.
 */
function headers(apiKey: string): HeadersInit {
  return { "content-type": "application/json", "x-goog-api-key": apiKey };
}

async function readErrorBody(response: Response): Promise<GeminiErrorBody | null> {
  try {
    return (await response.json()) as GeminiErrorBody;
  } catch {
    return null;
  }
}

/**
 * Wraps a request with a timeout, and translates transport failures.
 *
 * A rejected `fetch` is almost always the network rather than the service, and
 * saying "no connection" to a parent staring at a spinner is more useful than
 * the browser's own message.
 */
async function send(
  url: string,
  init: RequestInit,
  options: ClientOptions,
  signal?: AbortSignal,
): Promise<Response> {
  const impl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    return await impl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw new AiError("aborted", "cancelled by the caller");
    if (controller.signal.aborted) throw new AiError("timeout", "the request took too long");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new AiError("offline", "no connection");
    }
    throw new AiError("offline", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function listModelsRaw(
  options: ClientOptions,
  signal?: AbortSignal,
): Promise<GeminiListModelsResponse> {
  const response = await send(
    `${BASE}/models?pageSize=200`,
    { method: "GET", headers: headers(options.apiKey) },
    options,
    signal,
  );

  if (!response.ok) {
    throw toAiError(response.status, await readErrorBody(response), response.headers);
  }
  return (await response.json()) as GeminiListModelsResponse;
}

export interface GenerateOutcome {
  response: GeminiGenerateContentResponse;
  /** True when the model turned out not to accept `thinkingConfig`. */
  thinkingRejected: boolean;
}

/**
 * One `generateContent` call, with the thinking capability probe built in.
 *
 * Whether a model accepts `thinkingConfig`, and whether it accepts a budget of
 * zero, varies by model and is not discoverable from the catalogue. Rather than
 * keeping a table that goes stale, the first 400 that mentions thinking is
 * treated as the answer: the field is dropped, the call is retried once, and
 * the caller remembers so the 400 is never paid twice.
 */
export async function generateContent(
  modelId: string,
  body: GeminiGenerateContentRequest,
  options: ClientOptions,
  signal?: AbortSignal,
): Promise<GenerateOutcome> {
  const call = async (payload: GeminiGenerateContentRequest) =>
    send(
      `${BASE}/models/${encodeURIComponent(modelId)}:generateContent`,
      { method: "POST", headers: headers(options.apiKey), body: JSON.stringify(payload) },
      options,
      signal,
    );

  let response = await call(body);
  let thinkingRejected = false;

  if (response.status === 400 && body.generationConfig?.thinkingConfig) {
    const errorBody = await readErrorBody(response);
    if (isThinkingComplaint(errorBody)) {
      const { thinkingConfig: _dropped, ...generationConfig } = body.generationConfig;
      thinkingRejected = true;
      response = await call({ ...body, generationConfig });
    } else {
      throw toAiError(400, errorBody, response.headers);
    }
  }

  if (!response.ok) {
    throw toAiError(response.status, await readErrorBody(response), response.headers);
  }

  return {
    response: (await response.json()) as GeminiGenerateContentResponse,
    thinkingRejected,
  };
}
