<p align="center">
  <img src="public/pwa-192.png" width="96" alt="Chytayko icon" />
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/transparent.svg?title=%D0%A7%D0%B8%D1%82%D0%B0%D0%B9%D0%BA%D0%BE+%C2%B7+Chytayko&subtitle=Reading+comprehension+trainer+for+kids+7%2B.+Read+against+the+clock,+then+prove+you+understood.&mode=dark&align=center" />
    <img alt="Chytayko" src="https://shieldcn.dev/header/transparent.svg?title=%D0%A7%D0%B8%D1%82%D0%B0%D0%B9%D0%BA%D0%BE+%C2%B7+Chytayko&subtitle=Reading+comprehension+trainer+for+kids+7%2B.+Read+against+the+clock,+then+prove+you+understood.&mode=light&align=center" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/SanekxArcs/reading-trening-for-kids-/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/SanekxArcs/reading-trening-for-kids-.svg?variant=secondary" /></a>
  <a href="https://github.com/SanekxArcs/reading-trening-for-kids-/actions"><img alt="CI status" src="https://shieldcn.dev/github/ci/SanekxArcs/reading-trening-for-kids-.svg?variant=secondary" /></a>
  <a href="https://github.com/SanekxArcs/reading-trening-for-kids-/commits/main"><img alt="Last commit" src="https://shieldcn.dev/github/last-commit/SanekxArcs/reading-trening-for-kids-.svg?variant=secondary" /></a>
  <img alt="React 19" src="https://shieldcn.dev/badge/React-19-61DAFB.svg?variant=secondary&logo=react" />
  <img alt="No backend" src="https://shieldcn.dev/badge/backend-none-8B7CF0.svg?variant=secondary&logo=shield" />
  <img alt="Gemini bring your own key" src="https://shieldcn.dev/badge/Gemini-your%20own%20key-F59E0B.svg?variant=secondary&logo=googlegemini" />
  <img alt="Languages UK PL EN" src="https://shieldcn.dev/badge/languages-UK%20%E2%80%A2%20PL%20%E2%80%A2%20EN-16A34A.svg?variant=secondary" />
</p>

<p align="center">
  A parent adds a text. The child reads it on a timer, the text disappears, and the questions begin.<br/>
  The score is <b>comprehension × speed</b>, so reading fast without understanding earns nothing.
</p>

---

## How a lesson goes

1. **Add a text.** Paste one, photograph a book page and let it be read by OCR, or ask for a made-up story at the child's level.
2. **Review the questions.** Five kinds are generated: literal, sequence, vocabulary, inference, main idea. Each one cites the sentence that proves it, and the parent approves the set before the child sees it.
3. **Warm up.** Four hard words, or words the child stumbled on last time, before the clock starts.
4. **Read.** Silently, or aloud with the microphone on. A finger-under-the-line highlighter can be drawn over the text; the ink is never saved or measured.
5. **Answer.** One question at a time with the text hidden. Type, or speak through the browser's own speech recognition.
6. **See the result.** Comprehension in percent, words per minute, and the effective speed that multiplies the two. Reading aloud adds oral speed, accuracy and the stumbled words.

Points, combo streaks, a points goal, player levels that only go up, a day streak, confetti and sounds keep a seven-year-old coming back. A round left through the home button is marked abandoned and never scored.

## What makes it different

- **No server, no accounts.** The whole app is a PWA that lives in the browser. Texts, questions, sessions and stats sit in IndexedDB on the device.
- **AI with the parent's own key.** Google Gemini is called straight from the browser. The key is pasted in Settings behind the parent PIN, stored only on the device, shown masked, and deletable. The app lists the key's models, prefers the cheapest flash-lite, and lets the parent pick another.
- **Honest usage meter.** Every call passes through one queue with a daily budget. Usage is measured against whichever limit comes first, the parent's own daily cap or the model's estimated allowance, and the estimate is replaced by the real number the moment the API reports a quota.
- **Never breaks for the child.** With no key or no network, questions come from an offline generator, answers are graded by a local fuzzy matcher, and cached question sets are replayed. The child never sees a message about keys, quotas or errors.
- **Lessons travel between families.** A lesson exports as a gzipped pack in a link or a file. The link carries the payload in the URL fragment, so no host ever sees it. The receiving family needs no key. A pack never contains the key, the PIN or any child data, and imported questions are re-validated against their citations.
- **Built for small readers.** Font scale up to 3×, line height up to 3, a dyslexia-font toggle that uses OpenDyslexic, Lexend or Atkinson Hyperlegible when installed, touch targets of 56 px or more, pastel lilac, mint and peach themes with buttons kept at 5:1 contrast, a dim dark theme that follows the OS, and reduced motion respected everywhere.

## Languages

The interface is in Ukrainian, Polish and English. Texts can be in any of the three, chosen separately from the interface, and questions always follow the language of the text.

## Privacy

What leaves the device, and only when a Gemini key is set: the text, photographed pages, the child's typed answers, and the read-aloud recording. They go directly to Google's Gemini API under the parent's key. The service worker never caches those calls. Everything else stays local: the Dexie database `read-master` with texts, question sets, sessions, answers, mastery stats and the daily usage ledger, plus settings, the hashed PIN and the player level in localStorage.

The parent PIN is a salted SHA-256 hash with a 15-minute unlock. It is meant to stop a child, not an adult. Parent screens are a separate lazy-loaded chunk that the service worker does not precache.

## Run it

Requirements: Node 22, pnpm 10.

```sh
pnpm install
pnpm dev
```

```sh
pnpm check           # typecheck + lint (oxlint, warnings denied) + tests
pnpm test            # Vitest, 30 test files; pure engine tests run without a DOM
pnpm format          # Prettier
pnpm build           # tsc -b && vite build
pnpm icons           # redraws the PWA icons from code
```

CI runs the same sequence on every push and pull request. `vercel.json` serves the single-page app, caches `/assets` for a year and never caches the service worker, the manifest or `index.html`. There are no environment variables.

One test, `src/engine/purity.test.ts`, fails the build if the engine or the AI core ever imports React or does I/O. The logic stays testable on its own.

## Routes

| Route | Screen |
|---|---|
| `/` | Library of texts |
| `/add` | Paste, photograph, or generate a text |
| `/review/:textId` | Parent approves the questions |
| `/share/:textId` | Export a lesson pack as a link or file |
| `/import` | Import a pack |
| `/read/:textId` | Timed reading with the highlighter |
| `/quiz/:sessionId` | Questions, one at a time |
| `/result/:sessionId` | Results |
| `/progress` | Speed over time, comprehension, per-skill and per-word mastery |
| `/settings` | Behind the PIN: levels, questions per round, reading mode, fonts, key, usage |

Bottom tabs for Texts, Add, Progress and Settings appear on the screens you navigate between and disappear during reading, the quiz and adding a text.

## Project layout

```
src/engine/     Pure logic: question types, levels, warm-up, grading, mastery, fallback questions
src/ai/         Gemini client, model discovery, budget and usage ledger, pipelines for story, OCR, questions, grading, transcription
src/read/       Reading screen and the highlighter canvas
src/quiz/ src/result/ src/progress/
src/library/    Texts and question review
src/share/      Lesson pack codec, export and import screens
src/settings/   PIN, API key, usage, reading options
src/voice/      Web Speech API answers
src/data/       Dexie database
src/i18n/       Ukrainian, Polish, English strings
scripts/        Icon generator
```

## Stack

React 19, React Router 7, Vite 8, TypeScript 7, Tailwind 4, Radix UI, motion, Dexie 4, vite-plugin-pwa, Vitest with Testing Library, oxlint, Prettier. Package manager pnpm.
