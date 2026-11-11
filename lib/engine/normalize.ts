// Cevap normalizasyonu (docs/SPEC.md 4.6): küçük harf, baş/son boşluk, çoklu boşluk tek,
// kıvrık kesme işareti düz, sondaki noktalama yok sayılır, kısaltma eşdeğerleri açılır.

const APOSTROPHES = /[‘’ʼ`´]/g;
const TRAILING_PUNCT = /[\s.!?,;:…"]+$/u;
const LEADING_PUNCT = /^["\s]+/u;

/** `'s` yalnızca bu kelimelerden sonra `is` olarak açılır ("Tom's car" iyelik kalır). */
const S_IS_WORDS = [
  "he", "she", "it", "that", "what", "where", "who", "there", "here", "how", "when", "this",
];

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\b([a-z]+)n't\b/g, "$1 not"],
  [/\bi'm\b/g, "i am"],
  [/\b([a-z]+)'re\b/g, "$1 are"],
  [/\b([a-z]+)'ve\b/g, "$1 have"],
  [/\b([a-z]+)'ll\b/g, "$1 will"],
  [/\blet's\b/g, "let us"],
  [new RegExp(`\\b(${S_IS_WORDS.join("|")})'s\\b`, "g"), "$1 is"],
];

/** Tek bir cevabı karşılaştırma biçimine getirir. */
export function normalizeAnswer(input: string): string {
  let s = input.replace(APOSTROPHES, "'").toLowerCase();
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(TRAILING_PUNCT, "").replace(LEADING_PUNCT, "");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Kelime düzeyi karşılaştırma için (dikte): normalize eder, kelime içindeki kesme
 * işareti dışındaki noktalamayı atar ve boşluktan böler.
 */
export function tokenizeWords(input: string): string[] {
  const s = normalizeAnswer(input)
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, " ");
  return s.split(/\s+/).filter(Boolean);
}

/** İki cevap normalize edildikten sonra aynı mı? */
export function answersMatch(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b);
}
