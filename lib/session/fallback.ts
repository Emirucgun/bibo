// GEÇİCİ (M6): dinleme ve konuşma etkinliklerinin arayüzü henüz yok. Bu bayrak açıkken
// planlayıcının dinleme ve konuşma slotları metin türlerine düşürülür (ROADMAP M6).
// M7'de dinleme kısmı `tts_enabled` ayarına bağlanır, M8'de konuşma kısmı silinir.
import { ACTIVITY_TYPE_INFO, type ActivityType } from "@/lib/content/activity-types";
import { TTS_FALLBACK } from "@/lib/engine/planner";
import type { PlanSlot } from "@/lib/engine/types";

export const TEXT_ONLY_SESSIONS = true;

/** Dinleme: planlayıcıdaki `tts_enabled = false` eşlemesi (aynı mod). */
export const LISTENING_FALLBACK = TTS_FALLBACK;

/**
 * Konuşma slotları sırayla bu türlere düşer (ikisi de `free` mod). Hepsi `short_write` olunca
 * oturum yazma ağırlıklı ve uzun çıkıyordu (16.11.2026 denemesi: 9 etkinliğin 6'sı, ≈ 22 dk).
 */
export const SPEAKING_FALLBACK: readonly ActivityType[] = ["short_write", "translate_tr_en"];

/** Slotun türünü metin karşılığına çevirir; beceri ve mod yeni türden gelir. */
export function applyTextFallback(slots: readonly PlanSlot[]): PlanSlot[] {
  let spoken = 0;
  return slots.map((slot) => {
    const to =
      slot.activity_type === "speak_answer"
        ? SPEAKING_FALLBACK[spoken++ % SPEAKING_FALLBACK.length]
        : LISTENING_FALLBACK[slot.activity_type];
    if (!to) return slot;
    const info = ACTIVITY_TYPE_INFO[to];
    return {
      ...slot,
      activity_type: to,
      skill: info.skill,
      mode: info.mode,
      reason: `${slot.reason} · M6: ${slot.activity_type} → ${to}`,
    };
  });
}
