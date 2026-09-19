import { fold } from "./normalize.ts";
import type { TextLang } from "./types.ts";

/**
 * Words too common to be worth asking about.
 *
 * Used by the offline question generator to avoid producing "___ лисиця побігла
 * до лісу" with the answer "і". Short lists on purpose: these are the function
 * words, not a frequency dictionary. Anything borderline is better left in,
 * since the generator also weighs word length and rarity within the text.
 */
// prettier-ignore
const LISTS: Record<TextLang, readonly string[]> = {
  uk: [
    "і", "й", "та", "а", "але", "або", "що", "щоб", "як", "коли", "де", "бо",
    "не", "ні", "це", "цей", "ця", "те", "той", "та", "так", "там", "тут", "вже",
    "ще", "теж", "все", "він", "вона", "воно", "вони", "я", "ти", "ми", "ви", "мене",
    "тебе", "його", "її", "їх", "в", "у", "на", "з", "із", "зі", "до", "від",
    "для", "по", "за", "під", "над", "при", "про", "без", "через", "між", "біля", "після",
    "перед", "був", "була", "було", "були", "є", "буде", "бути", "має", "мав",
  ],
  ru: [
    "и", "а", "но", "или", "что", "чтобы", "как", "когда", "где", "не", "ни", "это",
    "этот", "эта", "то", "тот", "так", "там", "тут", "уже", "еще", "тоже", "все", "он",
    "она", "оно", "они", "я", "ты", "мы", "вы", "его", "ее", "их", "в", "на",
    "с", "со", "до", "от", "для", "по", "за", "под", "над", "при", "про", "без",
    "через", "между", "около", "после", "перед", "был", "была", "было", "были", "есть", "будет", "быть",
  ],
  pl: [
    "i", "a", "ale", "lub", "albo", "że", "żeby", "jak", "gdy", "kiedy", "gdzie", "bo",
    "nie", "to", "ten", "ta", "tam", "tu", "już", "jeszcze", "też", "wszystko", "się", "on",
    "ona", "ono", "oni", "ja", "ty", "my", "wy", "jego", "jej", "ich", "w", "we",
    "na", "z", "ze", "do", "od", "dla", "po", "za", "pod", "nad", "przy", "o",
    "bez", "przez", "między", "obok", "przed", "był", "była", "było", "byli", "jest", "są", "będzie",
    "być", "ma", "miał",
  ],
  cs: [
    "a", "ale", "nebo", "že", "aby", "jak", "když", "kde", "protože", "ne", "to", "ten",
    "ta", "tam", "tady", "už", "ještě", "taky", "všechno", "se", "on", "ona", "ono", "oni",
    "já", "ty", "my", "vy", "jeho", "její", "jejich", "v", "ve", "na", "s", "se",
    "do", "od", "pro", "po", "za", "pod", "nad", "při", "o", "bez", "přes", "mezi",
    "vedle", "před", "byl", "byla", "bylo", "byli", "je", "jsou", "bude", "být", "má", "měl",
  ],
  en: [
    "the", "a", "an", "and", "or", "but", "that", "which", "who", "whom", "whose", "if",
    "then", "than", "as", "when", "where", "because", "not", "no", "this", "these", "those", "there",
    "here", "just", "still", "also", "all", "very", "he", "she", "it", "they", "we", "you",
    "i", "his", "her", "its", "their", "our", "your", "in", "on", "at", "to", "from",
    "for", "by", "with", "about", "into", "over", "under", "of", "up", "down", "out", "off",
    "again", "before", "after", "was", "were", "is", "are", "be", "been", "being", "had", "has",
    "have", "did", "do", "would", "could", "should", "will", "can", "said",
  ],
};

/**
 * Stored folded, and looked up folded.
 *
 * The matcher compares diacritic-free text, so by the time a token reaches
 * `isStopword` the Polish "że" is already "ze". Folding the lists at module
 * load keeps both sides in the same alphabet instead of silently never matching
 * any accented function word.
 */
const SETS: Record<TextLang, ReadonlySet<string>> = {
  uk: new Set(LISTS.uk.map(fold)),
  ru: new Set(LISTS.ru.map(fold)),
  pl: new Set(LISTS.pl.map(fold)),
  cs: new Set(LISTS.cs.map(fold)),
  en: new Set(LISTS.en.map(fold)),
};

export function isStopword(word: string, lang: TextLang): boolean {
  return SETS[lang].has(fold(word.toLocaleLowerCase()));
}
