// Yerleştirme testi (docs/SPEC.md 6 `POST /api/placement`, Ek C; PRD F2; PLAN karar 22, 31–33).
// Soru bankası `supabase/seed/placement.json`'dan gelir; dil modeli üretmez. Saf: rastgelelik ve
// seslendirme durumu parametre olarak gelir.
import bank from "@/supabase/seed/placement.json";
import { ACTIVITY_TYPE_INFO, isActivityType } from "@/lib/content/activity-types";
import { L1_CODES } from "@/lib/content/taxonomy";
import type { EngineTopic, ItemKey, Level, MasteryRow } from "@/lib/engine/types";
import { CHOICE_TYPES, shuffled, SPOKEN_TEXT_TYPES } from "./save-items";
import type { ItemPayload, NewItem } from "./types";

interface BankItem {
  position: number;
  activity_type: string;
  topic_id: string;
  l1_target: string | null;
  payload: ItemPayload;
  key: ItemKey;
}

export const PLACEMENT_BANK: readonly BankItem[] = (bank as { items: BankItem[] }).items;

/** Yerleştirmede ≥ %60 doğru → A2 (SPEC 4.4 "açık konular"). */
export const PLACEMENT_A2_RATE = 0.6;
/** "Tahmini zayıf noktalar" kartındaki konu sayısı (PRD F2). */
export const WEAK_POINT_COUNT = 3;

/**
 * Bankadan oturum satırları. Seslendirme kullanılamıyorsa dinleme soruları çıkarılır (karar 32):
 * öğrenci 4 dakikalık testte "ses yok" mesajıyla karşılaşmasın. Dinlemede seslendirilecek metin
 * doğru şıktır; `item_keys.text_en`'e yazılır, şıklar karıştırılır.
 */
export function buildPlacementItems(opts: { ttsAvailable: boolean; rng: () => number }): NewItem[] {
  const rows: NewItem[] = [];
  for (const raw of PLACEMENT_BANK) {
    if (!isActivityType(raw.activity_type)) continue;
    const type = raw.activity_type;
    if (SPOKEN_TEXT_TYPES.includes(type) && !opts.ttsAvailable) continue;
    const info = ACTIVITY_TYPE_INFO[type];
    const payload: ItemPayload = { ...raw.payload };
    if (CHOICE_TYPES.includes(type) && payload.options) payload.options = shuffled(payload.options, opts.rng);
    const key: ItemKey = { ...raw.key };
    if (SPOKEN_TEXT_TYPES.includes(type)) {
      key.text_en = raw.payload.text_en ?? raw.key.correct;
      delete payload.text_en;
    }
    rows.push({
      position: rows.length + 1,
      topic_id: raw.topic_id,
      activity_type: type,
      skill: info.skill,
      mode: info.mode,
      purpose: "placement",
      interest: null,
      l1_target: raw.l1_target,
      payload,
      key,
    });
  }
  return rows;
}

/** Tahmini seviye: A2 beyanı ya da değerlendirilmiş cevapların ≥ %60'ı doğru → A2 (SPEC 4.4). */
export function estimateLevel(levelSelf: string | null, correct: number, graded: number): Level {
  if (levelSelf === "A2") return "A2";
  return graded > 0 && correct / graded >= PLACEMENT_A2_RATE ? "A2" : "A1";
}

export interface WeakPoint {
  topicId: string;
  titleTr: string;
  /** Konunun Türkçe kaynaklı ilk hata kodunun kuralı (`l1_codes.rule_tr`); yoksa `null`. */
  ruleTr: string | null;
}

/**
 * "Tahmini zayıf noktalar" (PLAN karar 22): yerleştirmede sorulan konular arasında en düşük
 * ustalıklı üç konu; eşitlikte L1 riski yüksek olan. Ustalık satırı yoksa başlangıç değeri
 * (`0.50 − 0.15 × l1_risk`) kullanılır.
 */
export function weakPoints(
  topicIds: readonly string[],
  mastery: readonly Pick<MasteryRow, "topic_id" | "score">[],
  topics: readonly EngineTopic[],
): WeakPoint[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const scored = [...new Set(topicIds)].flatMap((id) => {
    const t = byId.get(id);
    if (!t) return [];
    const rows = mastery.filter((m) => m.topic_id === id);
    const score = rows.length > 0 ? Math.min(...rows.map((m) => m.score)) : 0.5 - 0.15 * t.l1_risk;
    return [{ t, score }];
  });
  return scored
    .sort((a, b) => a.score - b.score || b.t.l1_risk - a.t.l1_risk || a.t.sort - b.t.sort)
    .slice(0, WEAK_POINT_COUNT)
    .map(({ t }) => ({
      topicId: t.id,
      titleTr: t.title_tr,
      ruleTr: L1_CODES.find((c) => c.topic_id === t.id && c.is_l1 && c.rule_tr)?.rule_tr ?? null,
    }));
}
