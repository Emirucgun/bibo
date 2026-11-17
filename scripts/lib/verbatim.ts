// eval-verbatim (M8 Bitti testi 1–2, P6) yardımcıları: kayıt listesi şeması ve hata koruma kontrolü. Saf.
import { z } from "zod";
import { TOPIC_IDS } from "@/lib/content/taxonomy";

/**
 * Bir okuma hatası: transkriptte `expect` (öğrencinin söylediği yanlış biçim, ör. "she play") geçmeli,
 * `not` (düzeltilmiş biçim, ör. "she plays") geçmemeli. Eksik kelime hatası da böyle yazılır:
 * `{ expect: "is teacher", not: "is a teacher" }`.
 */
export const VerbatimError = z.object({ expect: z.string().min(1), not: z.string().min(1) });

export const VerbatimClip = z.discriminatedUnion("kind", [
  /** Bilerek hatalı okunmuş cümle (P6, 20 kayıt). */
  z.object({
    id: z.string().min(1),
    kind: z.literal("error"),
    file: z.string().min(1),
    read_text: z.string().min(1),
    errors: z.array(VerbatimError).min(1),
  }),
  /** Aksanlı ama dilbilgisi doğru cevap (10 kayıt): değerlendirme puan düşmemeli. */
  z.object({
    id: z.string().min(1),
    kind: z.literal("accent"),
    file: z.string().min(1),
    level: z.enum(["A1", "A2"]),
    topic_id: z.enum(TOPIC_IDS),
    prompt_en: z.string().min(1),
    model_answer_en: z.string().min(1),
  }),
]);
export type VerbatimClip = z.infer<typeof VerbatimClip>;
export const VerbatimManifest = z.array(VerbatimClip);

/** Küçük harf, kesme işareti düz, noktalama boşluk; kelimeler tek boşlukla. */
export function normalizeWords(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const containsPhrase = (haystack: string, phrase: string) => normalizeWords(haystack).includes(normalizeWords(phrase));

/** Hata transkriptte korundu mu: yanlış biçim var, düzeltilmiş biçim yok. */
export function errorKept(transcript: string, error: z.infer<typeof VerbatimError>): boolean {
  return containsPhrase(transcript, error.expect) && !containsPhrase(transcript, error.not);
}

/** Aksan kontrolü: doğru cevap doğru sayıldı ve puan kırılmadı. */
export const ACCENT_MIN_SCORE = 0.9;
export const VERBATIM_TARGET = 0.85;
