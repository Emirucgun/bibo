// Öğrenme profilinin oturum akışındaki yeri (docs/SPEC.md 4.1): bağlam, cevaptan kanıt, durum
// yükleme/kaydetme. `learner_state` bir önbellektir: yoksa, bozuksa ya da konu listesi/sürüm
// değiştiyse `attempts`'ten (olay kaynaklı) yeniden kurulur. Saf kısımlar dışa açıktır ve test edilir.
import {
  createContext,
  DEFAULT_LEARNER_MODEL_CONFIG,
  defaultTopicB,
  deserialize,
  emptyState,
  observe,
  replay,
  serialize,
  compatible,
  cell,
  reviewInDays,
  type LearnerModelConfig,
  type LearnerState,
  type ModelContext,
  type Observation,
  type SerializedState,
} from "@/lib/engine/learner-model";
import { DEFAULT_PLACEMENT_CONFIG, placementPrior } from "@/lib/engine/placement-cat";
import type { IrtParams } from "@/lib/engine/irt";
import type { EngineTopic, MasteryRow, Mode, Skill } from "@/lib/engine/types";

const DAY_MS = 86_400_000;

/**
 * Konu sırası kararlıdır (sort, id): durumun vektör düzeni buna bağlıdır. Pasif konular da bağlamda
 * kalır; böylece bir konunun kapatılması tüm profilleri geçersiz kılmaz.
 */
export function modelContextFor(topics: readonly EngineTopic[], config?: Partial<LearnerModelConfig>): ModelContext {
  const ordered = [...topics].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  return createContext(
    ordered.map((t) => ({ id: t.id, b: t.irt_b ?? defaultTopicB(t.level, t.l1_risk), l1_risk: t.l1_risk, kind: t.kind })),
    { ...DEFAULT_LEARNER_MODEL_CONFIG, ...(config ?? {}) },
  );
}

/** Seviye beyanından önsel (yerleştirmeyle aynı ölçek ve değerler). */
export function learnerPrior(levelSelf: string | null | undefined): { mu: number; sd: number } {
  return placementPrior(levelSelf, DEFAULT_PLACEMENT_CONFIG);
}

/** Değerlendirilmiş tek cevabın kanıt kaynağı (yeniden kurma ve canlı güncelleme aynı kuralı kullanır). */
export interface AttemptEvidence {
  topic_id: string;
  skill: Skill;
  mode: Mode;
  score: number;
  /** 0..1; yoksa (eski satır) ipucuna göre hesaplanır. */
  evidence_weight: number | null;
  hint_used: boolean;
  /** Serbest cevaptaki hedef dışı kanıt. */
  incidental: { topic_id: string; correct: boolean }[] | null;
  /** Yerleştirme maddesiyse bankadaki IRT parametreleri. */
  irt: IrtParams | null;
  at: Date;
}

/** Kanıt ağırlığı: ipucu kullanıldıysa `hint_weight`, değerlendirme güveniyle çarpılır. */
export function evidenceWeight(ctx: ModelContext, hintUsed: boolean, gradeConfidence = 1): number {
  const w = (hintUsed ? ctx.config.hint_weight : 1) * gradeConfidence;
  return Math.round(Math.min(1, Math.max(0, w)) * 1000) / 1000;
}

/** Cevaptan modelin kanıtları: hedef konu + (varsa) yan kanıtlar, `incidental_weight` ile. */
export function observationsFrom(ctx: ModelContext, e: AttemptEvidence): Observation[] {
  const weight = e.evidence_weight ?? evidenceWeight(ctx, e.hint_used);
  const out: Observation[] = [
    { topic_id: e.topic_id, skill: e.skill, mode: e.mode, score: e.score, weight, at: e.at, ...(e.irt ? { irt: e.irt } : {}) },
  ];
  for (const inc of e.incidental ?? []) {
    if (inc.topic_id === e.topic_id || !ctx.index.has(inc.topic_id)) continue;
    out.push({
      topic_id: inc.topic_id,
      skill: e.skill,
      mode: e.mode,
      score: inc.correct ? 1 : 0,
      weight: weight * ctx.config.incidental_weight,
      at: e.at,
    });
  }
  return out;
}

/** Saklanan durum geçerli ve bu bağlamla uyumluysa onu, değilse `null`. */
export function restoreState(ctx: ModelContext, stored: unknown): LearnerState | null {
  if (!stored || typeof stored !== "object") return null;
  const state = deserialize(stored as SerializedState);
  return state && compatible(ctx, state) ? state : null;
}

export function rebuildState(ctx: ModelContext, evidence: readonly AttemptEvidence[], levelSelf: string | null | undefined): LearnerState {
  return replay(ctx, evidence.flatMap((e) => observationsFrom(ctx, e)), learnerPrior(levelSelf));
}

export function freshState(ctx: ModelContext, levelSelf: string | null | undefined): LearnerState {
  return emptyState(ctx, learnerPrior(levelSelf));
}

/** Kanıtları sırayla işler; değişen hücreleri döner. */
export function applyEvidence(ctx: ModelContext, state: LearnerState, evidence: readonly AttemptEvidence[]): { topic_id: string; skill: Skill }[] {
  const touched = new Map<string, { topic_id: string; skill: Skill }>();
  for (const e of evidence) {
    for (const o of observationsFrom(ctx, e)) {
      observe(ctx, state, o);
      touched.set(`${o.topic_id}|${o.skill}`, { topic_id: o.topic_id, skill: o.skill });
    }
  }
  return [...touched.values()];
}

/**
 * `mastery` tablosu artık türetilmiş önbellektir (dışa aktarma, öğretmen görünümü): `score` hücrenin
 * kontrollü maddede ustalık olasılığı, `next_review_at` modelin tekrar zamanı.
 */
export function masteryCache(ctx: ModelContext, state: LearnerState, cells: readonly { topic_id: string; skill: Skill }[], now: Date): MasteryRow[] {
  return cells.flatMap(({ topic_id, skill }) => {
    const v = cell(ctx, state, topic_id, skill);
    if (!v) return [];
    const days = reviewInDays(ctx, state, topic_id, skill);
    return [
      {
        topic_id,
        skill,
        score: Math.round(v.p_mastered * 1000) / 1000,
        n: v.n,
        correct: v.correct,
        last_seen_at: v.last_seen,
        next_review_at: days === null ? null : new Date(now.getTime() + days * DAY_MS),
      },
    ];
  });
}

export { serialize };
