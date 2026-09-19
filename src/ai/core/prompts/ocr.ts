import { JSON_DISCIPLINE, LANGUAGE_LOCK, type Prompt } from "./shared.ts";

/**
 * Transcribing photographed pages of a children's book.
 *
 * The rules here are mostly about what *not* to do, and each one exists because
 * the obvious failure would poison everything downstream: a "helpfully"
 * simplified sentence changes what the comprehension questions are about; a
 * page number swept into the prose becomes a sentence a question can cite; an
 * invented word to cover a blurred one is a fact the child never read.
 */
export function buildOcrPrompt(pageCount: number): Prompt {
  const system = `You transcribe photographed pages of a children's book into plain text.
${LANGUAGE_LOCK}

RULES
1. Transcribe the body prose exactly as printed. Preserve the original language,
   spelling and punctuation. Do NOT translate. Do NOT simplify. Do NOT summarise.
2. Rejoin a word split by a hyphen at a line break into one word.
3. Merge the lines inside a paragraph into a single line. Keep a blank line
   between paragraphs. Keep dialogue dashes and quotation marks as printed.
4. OMIT: page numbers, running headers and footers, chapter numbers printed as
   decoration, image captions, publisher marks, and anything handwritten in the
   margin.
5. Fix only unambiguous photographic artefacts (l/1, rn/m, O/0). If a word is
   genuinely unreadable, write [...] in its place. Never invent a word.
6. The pages are in reading order. Concatenate them in that order, and if a
   sentence runs across a page break, join it.
7. "notes" is for the grown-up: mention a page that is blurred, cut off or
   upside down. Leave it empty when every page was clean.
${JSON_DISCIPLINE}`;

  const user =
    pageCount === 1
      ? "Transcribe this page."
      : `Transcribe these ${pageCount} pages, in the order given.`;

  return { system, user };
}
