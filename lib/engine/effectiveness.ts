// Etkinlik verimi (docs/SPEC.md 4.5): bir odak etkinliğinin öğrettiği, ≥ 48 saat sonraki
// farklı türde bir tekrarda (purpose = 'retest') korunuyor mu?
import type { ActivityStat, ActivityType, Purpose } from "./types";

export const RETEST_MIN_GAP_MS = 48 * 60 * 60 * 1000;

export interface RetestAnswer {
  topic_id: string;
  activity_type: ActivityType;
  purpose: Purpose;
  is_correct: boolean;
  created_at: Date;
}

export interface FocusCandidate {
  item_id: string;
  topic_id: string;
  activity_type: ActivityType;
  purpose: Purpose;
  credited: boolean;
  created_at: Date;
}

export interface Credit {
  /** `items.credited = true` yapılacak odak etkinliği. */
  focus_item_id: string;
  activity_type: ActivityType;
  taught_inc: 1;
  retained_inc: 0 | 1;
}

/** Tekrar cevabı için uygun odak etkinliğini bulur; yoksa `null`. */
export function creditRetest(r: RetestAnswer, items: FocusCandidate[]): Credit | null {
  if (r.purpose !== "retest") return null;
  const cutoff = r.created_at.getTime() - RETEST_MIN_GAP_MS;
  let f: FocusCandidate | null = null;
  for (const it of items) {
    if (
      it.purpose === "focus" &&
      it.topic_id === r.topic_id &&
      !it.credited &&
      it.activity_type !== r.activity_type &&
      it.created_at.getTime() <= cutoff &&
      (!f || it.created_at.getTime() > f.created_at.getTime())
    ) {
      f = it;
    }
  }
  if (!f) return null;
  return { focus_item_id: f.item_id, activity_type: f.activity_type, taught_inc: 1, retained_inc: r.is_correct ? 1 : 0 };
}

/** Krediyi `activity_stats` listesine uygular (yeni dizi döner). */
export function applyCredit(stats: ActivityStat[], c: Credit): ActivityStat[] {
  const found = stats.some((s) => s.activity_type === c.activity_type);
  const base = found ? stats : [...stats, { activity_type: c.activity_type, taught_n: 0, retained_n: 0 }];
  return base.map((s) =>
    s.activity_type === c.activity_type
      ? { ...s, taught_n: s.taught_n + c.taught_inc, retained_n: s.retained_n + c.retained_inc }
      : s,
  );
}

/** Planlayıcının tür seçimi için verim puanı: (retained_n + 1) / (taught_n + 2). */
export function effectivenessScore(stat: Pick<ActivityStat, "taught_n" | "retained_n"> | undefined): number {
  return ((stat?.retained_n ?? 0) + 1) / ((stat?.taught_n ?? 0) + 2);
}
