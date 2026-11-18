// Değerlendirme örneklerinin birleştirilmesi (docs/arastirma/olcme-ve-ogrenen-modeli.md "kesinlik
// önceliği"; karar 11: `grade_samples` örnekle çoğunluk oyu). Saf.
// - Hata, ancak örneklerin yarısından fazlası aynı düzeltmeyi işaretlediyse kalır (düzeltme düzeyinde oy).
// - "Yanlış" kararı için de çoğunluk gerekir; eşitlikte cevap doğru sayılır (yanlış alarm, kaçırılan
//   hatadan pahalıdır: öğrenciye haksız "yanlış" dememek).
// - Metinler (düzeltilmiş cevap, geri bildirim) kararla ve kalan hatalarla en uyumlu örnekten alınır.
import { normalizeAnswer } from "@/lib/engine/normalize";
import type { GradeResult } from "./schemas";

export const CONFIDENCE_WEIGHT: Record<GradeResult["confidence"], number> = { high: 1, medium: 0.8, low: 0.5 };

export interface VotedGrade {
  result: GradeResult;
  /** Kararla aynı fikirdeki örnek oranı (0..1]. */
  agreement: number;
  /** Kanıt ağırlığı çarpanı: uyum × uyumlu örneklerin ortalama güveni. */
  confidence: number;
  samples: number;
}

const editKey = (e: { span: string; correction: string }) => `${normalizeAnswer(e.span)}→${normalizeAnswer(e.correction)}`;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function majority<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function voteGrades(samples: readonly GradeResult[]): VotedGrade {
  if (samples.length === 0) throw new Error("voteGrades: no samples");
  const k = samples.length;
  const half = k / 2;
  const wrongVotes = samples.filter((s) => !s.is_correct).length;
  const isCorrect = !(wrongVotes > half);
  const agreeing = samples.filter((s) => s.is_correct === isCorrect);

  // Düzeltme düzeyinde oy: aynı (yanlış parça → düzeltme) çiftini işaretleyen örnek sayısı.
  const editVotes = new Map<string, { n: number; errors: GradeResult["errors"] }>();
  for (const s of samples) {
    const seen = new Set<string>();
    for (const e of s.errors) {
      const key = editKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      const v = editVotes.get(key) ?? { n: 0, errors: [] };
      v.n += 1;
      v.errors.push(e);
      editVotes.set(key, v);
    }
  }
  const kept = [...editVotes.entries()].filter(([, v]) => v.n > half);
  const errors = kept.map(([, v]) => ({
    ...v.errors[0],
    l1_code: majority(v.errors.map((e) => e.l1_code)),
    topic_id: majority(v.errors.map((e) => e.topic_id)),
  }));
  const keptKeys = new Set(kept.map(([key]) => key));

  // Kanıt: konunun yarıdan fazla örnekte geçmesi; doğruluğu çoğunlukla (eşitlikte doğru).
  const byTopic = new Map<GradeResult["evidence"][number]["topic_id"], boolean[]>();
  for (const s of samples) {
    for (const ev of s.evidence) byTopic.set(ev.topic_id, [...(byTopic.get(ev.topic_id) ?? []), ev.correct]);
  }
  const evidence = [...byTopic.entries()]
    .filter(([, votes]) => votes.length > half)
    .map(([topic_id, votes]) => ({ topic_id, correct: !(votes.filter((v) => !v).length > votes.length / 2) }));

  // Metinler: kararla aynı ve kalan hatalarla en çok örtüşen örnek.
  const overlap = (s: GradeResult) => {
    const keys = new Set(s.errors.map(editKey));
    let hit = 0;
    for (const key of keptKeys) if (keys.has(key)) hit++;
    return hit - Math.abs(keys.size - keptKeys.size) * 0.1;
  };
  const rep = [...agreeing].sort((a, b) => overlap(b) - overlap(a))[0];

  const agreement = agreeing.length / k;
  const confidence = agreement * (agreeing.reduce((acc, s) => acc + CONFIDENCE_WEIGHT[s.confidence], 0) / agreeing.length);
  return {
    result: {
      ...rep,
      is_correct: isCorrect,
      score: median(agreeing.map((s) => s.score)),
      errors,
      evidence,
    },
    agreement,
    confidence: Math.round(confidence * 1000) / 1000,
    samples: k,
  };
}
