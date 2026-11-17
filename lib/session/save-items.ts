// Üretilen etkinliği `items` (öğrenciye görünen) ve `item_keys` (yalnızca sunucu) satırlarına
// böler (docs/SPEC.md Bölüm 3). Saf: rastgelelik parametre olarak gelir.
import { ACTIVITY_TYPE_INFO, type ActivityType } from "@/lib/content/activity-types";
import type { GeneratedItem } from "@/lib/ai/schemas";
import type { ItemKey, PlanSlot } from "@/lib/engine/types";
import type { ItemPayload, NewItem } from "./types";

/** Seslendirilen metni cevabı ele veren türler: `text_en` anahtara taşınır (PLAN karar 14). */
export const SPOKEN_TEXT_TYPES: readonly ActivityType[] = ["listen_choose", "dictation"];

/** Şıklı türler: model doğru şıkkı çoğunlukla ilk sıraya yazar, sıra cevabı ele verir. */
export const CHOICE_TYPES: readonly ActivityType[] = ["mcq_read", "listen_choose"];

/** Fisher–Yates; kaynak dizi değişmez. */
export function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function splitGeneratedItem(item: GeneratedItem, slot: PlanSlot, rng: () => number): NewItem {
  const info = ACTIVITY_TYPE_INFO[item.activity_type];
  const payload: ItemPayload = { ...item.payload };
  if (CHOICE_TYPES.includes(item.activity_type) && payload.options) {
    payload.options = shuffled(payload.options, rng);
  }
  const key: ItemKey = { ...item.key };
  if (SPOKEN_TEXT_TYPES.includes(item.activity_type) && payload.text_en !== undefined) {
    key.text_en = payload.text_en;
    delete payload.text_en;
  }
  return {
    position: slot.position,
    topic_id: item.topic_id,
    activity_type: item.activity_type,
    skill: info.skill,
    mode: info.mode,
    purpose: slot.purpose,
    interest: slot.interest,
    l1_target: slot.l1_target,
    payload,
    key,
  };
}

/** Üretimden geçen etkinlikleri slotlarıyla eşleştirir; slotu olmayan etkinlik atılır. */
export function splitGeneratedItems(
  items: readonly GeneratedItem[],
  slots: readonly PlanSlot[],
  rng: () => number,
): NewItem[] {
  const byPos = new Map(slots.map((s) => [s.position, s]));
  return items.flatMap((item) => {
    const slot = byPos.get(item.slot);
    return slot ? [splitGeneratedItem(item, slot, rng)] : [];
  });
}
