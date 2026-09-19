import { PackError, readPack, type Pack, type ReadPack } from "./pack.ts";

/**
 * Getting a pack from one house to another with no server in between.
 *
 * Two shapes, because the two ways families actually pass things around have
 * different limits:
 *
 *   - a **link**, which goes in a message and opens the app with the lesson
 *     already in it. Everything rides in the URL fragment, which browsers
 *     never send to a server — so even the page host learns nothing about what
 *     was shared. Links have a practical length limit, hence the cap below.
 *   - a **file**, for anything longer: a photographed chapter, a long story.
 *     No limit, no chat app mangling it, and it can sit in a school drive
 *     folder for a week.
 *
 * Both are gzipped before encoding, which roughly quarters a text — the
 * difference between a link that survives a messenger and one that does not.
 */

/** Past this, messengers and address bars start truncating. */
export const MAX_LINK_CHARS = 12_000;

/** The query key a shared link carries its pack in. */
export const LINK_PARAM = "p";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
}

/**
 * A one-chunk stream, built by hand rather than from a Blob.
 *
 * `Blob.stream()` is the obvious way and it is missing from the DOM jsdom
 * gives the tests, which would leave the one piece of this file worth testing
 * untested.
 */
function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Gzip, where the browser has it.
 *
 * `CompressionStream` is everywhere that matters now, but a browser without it
 * should still be able to share — one flag byte says which way the payload was
 * written, so the other side never has to guess.
 */
const GZIPPED = "1";
const PLAIN = "0";

export async function encodePack(pack: Pack): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack));

  if (typeof CompressionStream === "undefined") return PLAIN + toBase64Url(json);

  const stream = streamOf(json).pipeThrough(new CompressionStream("gzip"));
  return GZIPPED + toBase64Url(await collect(stream));
}

export async function decodePack(encoded: string): Promise<ReadPack> {
  const flag = encoded.slice(0, 1);
  const body = encoded.slice(1);
  if (flag !== GZIPPED && flag !== PLAIN) throw new PackError("not-a-pack");

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64Url(body);
  } catch {
    // A link that a chat app wrapped, shortened or cut in half lands here.
    throw new PackError("not-a-pack");
  }

  if (flag === GZIPPED) {
    if (typeof DecompressionStream === "undefined") throw new PackError("not-a-pack");
    try {
      bytes = await collect(streamOf(bytes).pipeThrough(new DecompressionStream("gzip")));
    } catch {
      throw new PackError("not-a-pack");
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PackError("not-a-pack");
  }
  return readPack(parsed);
}

/**
 * The fragment, not the query string.
 *
 * Anything after `#` is never sent to the server, so a shared lesson stays
 * between the two people passing it around even though the app is hosted
 * somewhere public.
 */
export function packLink(origin: string, encoded: string): string {
  return `${origin.replace(/\/+$/u, "")}/import#${LINK_PARAM}=${encoded}`;
}

/** Reads a pack out of a link, a fragment, or a pasted blob of either. */
export function encodedFromLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const marker = `${LINK_PARAM}=`;
  const at = trimmed.lastIndexOf(marker);
  const candidate = at === -1 ? trimmed : trimmed.slice(at + marker.length);

  // Whitespace and quotes survive a copy-paste out of a chat window; anything
  // that is not base64url is not ours.
  const cleaned = candidate.replaceAll(/\s|["'<>]/gu, "");
  return /^[01][A-Za-z0-9_-]+$/u.test(cleaned) ? cleaned : null;
}

/** A filename a parent can recognise in a downloads folder a week later. */
export function packFilename(title: string): string {
  const slug =
    title
      .toLocaleLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .slice(0, 40) || "text";
  return `${slug}.chytayko.json`;
}
