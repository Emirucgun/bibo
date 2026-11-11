// docs/SPEC.md 5.2. Şema değişirse istem önbelleği bozulur: gereksiz yere değiştirme.
// `z.record` yok (katı JSON şeması serbest anahtarlı nesneyi desteklemez).
import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/content/activity-types";
import { L1_CODE_IDS, TOPIC_IDS } from "@/lib/content/taxonomy";

export const L1Code = z.enum(L1_CODE_IDS);
export const TopicId = z.enum(TOPIC_IDS);
export const ActivityType = z.enum(ACTIVITY_TYPES);

export const GeneratedPayload = z.object({
  instruction_tr: z.string().max(140),
  text_en: z.string().max(600).optional(), // okuma/dinleme metni
  question_en: z.string().max(160).optional(),
  options: z.array(z.string().max(80)).min(3).max(4).optional(),
  tokens: z.array(z.string()).min(3).max(14).optional(), // word_order, karışık
  source_tr: z.string().max(160).optional(), // translate_tr_en
  prompt_en: z.string().max(200).optional(), // short_write / speak_answer
});

export const GeneratedKey = z.object({
  correct: z.string().optional(), // mcq / listen_choose: doğru şıkkın metni
  accepted: z.array(z.string()).optional(),
  distractors: z
    .array(
      z.object({
        // her yanlış şık için bir kayıt
        option: z.string(),
        code: L1Code,
        feedback_tr: z.string().max(200),
      }),
    )
    .optional(),
  wrong_patterns: z.array(z.object({ answer: z.string(), code: L1Code })).optional(),
  target_words: z.array(z.string()).optional(),
  model_answer_en: z.string().optional(),
  explanation_short_tr: z.string().max(220), // ≤ 2 cümle
  explanation_long_tr: z.string().max(700),
  hint_tr: z.string().max(140),
});

// `id`: JSON şemasında bir kez `$defs`'e yazılır, slotlar `$ref` ile başvurur. Böylece istek
// küçük kalır ve isteğe bağlı alanlar slot sayısıyla çoğalmaz (Anthropic sınırı 24).
export const GeneratedItem = z
  .object({
    slot: z.number().int(),
    activity_type: ActivityType,
    topic_id: TopicId,
    payload: GeneratedPayload,
    key: GeneratedKey,
  })
  .meta({ id: "GeneratedItem" });
export type GeneratedItem = z.infer<typeof GeneratedItem>;

export const slotKey = (position: number) => `slot_${position}`;

/**
 * Oturum üretimi şeması (SPEC 5.2 `SessionGen`), slot anahtarlı: `{ slot_1: item, … }`.
 * Katı JSON şeması dizi uzunluğunu (`minItems > 1`) zorlayamadığı için model zaman zaman
 * eksik etkinlik dönüyordu (eval-generation, 11.11.2026); her slot zorunlu bir anahtar olunca
 * sayı şemayla zorlanır. Aynı şema yeniden üretimde yalnızca istenen slotlarla kullanılır
 * (SPEC 5.2 son paragraf, eski `SlotRegen`).
 */
export function SessionGen(positions: readonly number[]) {
  return z.object(
    Object.fromEntries(positions.map((p) => [slotKey(p), GeneratedItem])) as Record<string, typeof GeneratedItem>,
  );
}
export type SessionGen = Record<string, GeneratedItem>;

export const GradeResult = z.object({
  is_correct: z.boolean(),
  score: z.number().min(0).max(1),
  corrected: z.string(),
  feedback_short_tr: z.string().max(220),
  explanation_long_tr: z.string().max(700),
  errors: z
    .array(
      z.object({
        span: z.string(),
        correction: z.string(),
        l1_code: L1Code,
        topic_id: TopicId,
      }),
    )
    .max(5),
  evidence: z.array(z.object({ topic_id: TopicId, correct: z.boolean() })).max(6),
});
export type GradeResult = z.infer<typeof GradeResult>;
