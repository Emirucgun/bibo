// GEÇİCİ (M6): dinleme ve konuşma etkinliklerinin arayüzü henüz yok. Bu bayrak açıkken
// planlayıcının dinleme ve konuşma slotları metin türlerine düşürülür (ROADMAP M6).
// M7'de dinleme kısmı `tts_enabled` ayarına bağlanır, M8'de konuşma kısmı silinir.
import { ACTIVITY_TYPE_INFO, type ActivityType } from "@/lib/content/activity-types";
import { TTS_FALLBACK } from "@/lib/engine/planner";
import type { PlanSlot } from "@/lib/engine/types";

export const TEXT_ONLY_SESSIONS = true;

/** Dinleme: planlayıcıdaki `tts_enabled = false` eşlemesi. Konuşma: aynı mod, aynı `prompt_en`. */
export const TEXT_FALLBACK: Partial<Record<ActivityType, ActivityType>> = {
  ...TTS_FALLBACK,
  speak_answer: "short_write",
};

/** Slotun türünü metin karşılığına çevirir; beceri ve mod yeni türden gelir. */
export function applyTextFallback(slots: readonly PlanSlot[]): PlanSlot[] {
  return slots.map((slot) => {
    const to = TEXT_FALLBACK[slot.activity_type];
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
