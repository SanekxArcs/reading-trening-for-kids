import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The architectural rule, enforced rather than documented.
 *
 * The engine stays pure so that every test in this folder runs without a DOM,
 * a network stub or a fake IndexedDB. The moment one file reaches for
 * `localStorage` or `fetch`, the whole folder quietly stops being testable that
 * way, and the rot is invisible until someone tries to write the next test.
 */
const ENGINE_DIR = join(import.meta.dirname, ".");

const BANNED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bfrom\s+["']react/, why: "React" },
  { pattern: /\bfrom\s+["']dexie/, why: "Dexie" },
  { pattern: /\bfrom\s+["']@\/(ai|data|components)\//, why: "an impure app layer" },
  { pattern: /\blocalStorage\b/, why: "localStorage" },
  { pattern: /\bsessionStorage\b/, why: "sessionStorage" },
  { pattern: /\bindexedDB\b/, why: "IndexedDB" },
  { pattern: /\bdocument\./, why: "the DOM" },
  { pattern: /\bwindow\./, why: "window" },
  { pattern: /\bfetch\s*\(/, why: "fetch" },
];

function sourceFiles(): string[] {
  return readdirSync(ENGINE_DIR)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts"));
}

describe("engine purity", () => {
  it("has source files to check", () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  it.each(sourceFiles())("%s touches nothing impure", (name) => {
    const source = readFileSync(join(ENGINE_DIR, name), "utf8");
    // Comments legitimately mention these words; only real code should fail.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const { pattern, why } of BANNED) {
      expect(pattern.test(code), `${name} must not use ${why}`).toBe(false);
    }
  });
});
