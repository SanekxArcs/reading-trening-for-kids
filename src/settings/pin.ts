/**
 * The parent gate.
 *
 * With no server there is nobody to check a PIN against, so this is honestly
 * what it is: a lock that stops a seven-year-old opening Settings and finding
 * the API key. An adult with devtools walks straight past it, and pretending
 * otherwise would be worse than having no lock at all.
 *
 * What it does do properly: the PIN itself is never stored. A random salt plus
 * SHA-256 means a parent who reuses a PIN elsewhere has not left it in
 * localStorage in plain text.
 */

const KEY = "read_master_pin";
const SESSION_KEY = "read_master_pin_ok";

/** How long one unlock lasts. Long enough to change several settings. */
const UNLOCK_MS = 15 * 60 * 1000;

interface StoredPin {
  hash: string;
  salt: string;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

function read(): StoredPin | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPin;
    return typeof parsed.hash === "string" && typeof parsed.salt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return read() !== null;
}

export async function setPin(pin: string): Promise<void> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await hashPin(pin, salt);
  try {
    localStorage.setItem(KEY, JSON.stringify({ hash, salt }));
  } catch {
    /* private mode — the lock will not survive a reload */
  }
}

export function clearPin(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Constant-time comparison.
 *
 * Timing is not a realistic attack on a four-digit PIN typed by a child, but
 * the alternative costs one line and there is no reason to write the careless
 * version.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = read();
  if (!stored) return true; // no PIN set: nothing is locked
  const ok = safeEqual(await hashPin(pin, stored.salt), stored.hash);
  if (ok) markUnlocked();
  return ok;
}

/** Unlock lives in sessionStorage, so closing the tab re-locks. */
function markUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now() + UNLOCK_MS));
  } catch {
    /* private mode — every visit will ask */
  }
}

export function isUnlocked(now = Date.now()): boolean {
  if (!hasPin()) return true;
  try {
    const until = Number(sessionStorage.getItem(SESSION_KEY) ?? 0);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}
