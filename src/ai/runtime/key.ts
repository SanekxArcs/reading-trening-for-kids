import type { ModelInfo } from "../core/provider.ts";

/**
 * The API key, and the model the parent chose.
 *
 * The key lives under its own localStorage entry, apart from every other
 * setting. That separation is the whole point: settings get serialised into
 * diagnostics, exports and bug reports, and a key that rides along inside that
 * object eventually ends up somewhere it should not be.
 *
 * None of this is a security boundary. Anything that can run script on this
 * origin can read the key, and the settings screen says so in as many words —
 * the honest mitigations are a separate key, restricted to this API and this
 * domain, and a delete button.
 */

const KEY = "read_master_api_key";
const MODEL_KEY = "read_master_model";
const CATALOG_KEY = "read_master_models";

/** How long a fetched model list is trusted before being refreshed. */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export function readApiKey(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, trimmed);
  } catch {
    /* private mode — the key will not survive a reload */
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CATALOG_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * `AIza••••••4f2` — enough for a parent to tell two keys apart, not enough to
 * be worth reading over a shoulder.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(6)}${key.slice(-3)}`;
}

export function readModelId(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function writeModelId(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    /* private mode */
  }
}

interface CachedCatalog {
  /** A fingerprint of the key, never the key. Detects a key swap. */
  fingerprint: string;
  fetchedAt: number;
  models: ModelInfo[];
}

/** FNV-1a. Not a secret-keeping function, and does not need to be. */
export function fingerprint(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function readCatalog(key: string, now = Date.now()): ModelInfo[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCatalog;
    if (cached.fingerprint !== fingerprint(key)) return null;
    if (now - cached.fetchedAt > CATALOG_TTL_MS) return null;
    return Array.isArray(cached.models) && cached.models.length > 0 ? cached.models : null;
  } catch {
    return null;
  }
}

export function writeCatalog(key: string, models: ModelInfo[], now = Date.now()): void {
  try {
    const payload: CachedCatalog = { fingerprint: fingerprint(key), fetchedAt: now, models };
    localStorage.setItem(CATALOG_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}
