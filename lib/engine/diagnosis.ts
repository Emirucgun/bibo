// Teşhis (docs/SPEC.md 4.3, v2): öğrenme profilinin sonsal olasılıklarından.
// Sırayla: beceri eksiği → konu eksiği → etkinlik uyumsuzluğu → belirsiz (kayıt yok).
// Gösterilen güven, teşhisin sonsal olasılığıdır.
import { ACTIVITY_TYPE_LABELS_TR, SKILL_LABELS_TR as SKILL_LABELS, SKILLS } from "@/lib/content/activity-types";
import {
  cell,
  pSkillGap,
  pTopicGap,
  topicEvidence,
  topicMastery,
  type ModelContext,
  type LearnerState,
} from "./learner-model";
import type {
  ActivityEvidence,
  ActivityType,
  DiagnosisCandidate,
  DiagnosisEvidence,
  DiagnosisStatus,
  ExistingDiagnosis,
  Skill,
  SkillEvidence,
  TopicAttempt,
} from "./types";

/** Zayıf becerideki en az doğrudan cevap (konuda) ve becerinin tüm konulardaki en az cevabı. */
export const MIN_WEAK_EVIDENCE = 3;
export const MIN_SKILL_TOTAL = 4;
/**
 * Gözlenen karşıtlık güvencesi: zayıf hücrede doğru oranı ≤ WEAK_MAX_RATE, güçlü hücrede ≥ STRONG_MIN_RATE.
 * Etkinlik türü zorluklarının yanlış tahmin edilmesi tek başına teşhis üretmesin (kesinlik önce).
 */
export const WEAK_MAX_RATE = 0.5;
export const STRONG_MIN_RATE = 0.75;
/** Güçlü becerinin en az ustalık olasılığı ve kanıtı. */
export const STRONG_P = 0.5;
export const MIN_STRONG_EVIDENCE = 2;
/** Konu eksiği için konudaki en az cevap ve en çok konu ustalığı. */
export const MIN_TOPIC_EVIDENCE = 4;
export const TOPIC_GAP_MAX_MASTERY = 0.3;
/** Etkinlik uyumsuzluğunda tür başına en az cevap. */
export const MIN_ACTIVITY_EVIDENCE = 4;
export const SHOW_CONFIDENCE = 0.6;
export const RESOLVE_SCORE = 0.65;
/** Histerezis: teşhis ≥ diag_p ile açılır, olasılık bunun altına inince kapanır. */
export const RESOLVE_GAP_P = 0.7;
export const MISMATCH_RESOLVE_RATE = 0.7;
const EPS = 1e-9;

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Becerinin tüm konulardaki doğrudan cevap sayısı. */
function skillTotal(ctx: ModelContext, state: LearnerState, skill: Skill): number {
  const k = SKILLS.indexOf(skill);
  let n = 0;
  for (let t = 0; t < ctx.topics.length; t++) n += state.n[t * SKILLS.length + k];
  return n;
}

/** Beceri başına doğru/toplam ve ustalık olasılığı (kanıtı olan beceriler). */
export function skillEvidence(ctx: ModelContext, state: LearnerState, topicId: string): Partial<Record<Skill, SkillEvidence>> {
  const out: Partial<Record<Skill, SkillEvidence>> = {};
  for (const s of SKILLS) {
    const v = cell(ctx, state, topicId, s);
    if (v && v.n > 0) out[s] = { correct: v.correct, n: v.n, score: round2(v.p_mastered) };
  }
  return out;
}

/** Konu üzerindeki cevaplardan (beceri, tür) başına doğru/toplam. */
export function activityEvidence(attempts: TopicAttempt[]): Partial<Record<ActivityType, ActivityEvidence>> {
  const out: Partial<Record<ActivityType, ActivityEvidence>> = {};
  for (const a of attempts) {
    const e = (out[a.activity_type] ??= { skill: a.skill, correct: 0, n: 0 });
    e.n += 1;
    if (a.is_correct) e.correct += 1;
  }
  return out;
}

/** Bir konu için teşhis adayı; belirsizse `null`. */
export function diagnoseTopic(
  ctx: ModelContext,
  state: LearnerState,
  topicId: string,
  attempts: TopicAttempt[] = [],
): DiagnosisCandidate | null {
  const skills = skillEvidence(ctx, state, topicId);
  const base = { topic_id: topicId, weak_skill: null, strong_skill: null, weak_activity: null, strong_activity: null };
  const c = ctx.config;

  // 1) Beceri eksiği: konu bir beceride sağlam, başka bir beceride beklenenden belirgin biçimde zayıf.
  let best: DiagnosisCandidate | null = null;
  for (const weak of SKILLS) {
    const w = cell(ctx, state, topicId, weak);
    if (!w || w.n < MIN_WEAK_EVIDENCE || skillTotal(ctx, state, weak) < MIN_SKILL_TOTAL) continue;
    if (w.correct / w.n > WEAK_MAX_RATE + EPS) continue;
    const p = pSkillGap(ctx, state, topicId, weak);
    if (p < c.skill_gap_p - EPS) continue;
    let strong: Skill | null = null;
    let strongP = 0;
    for (const s of SKILLS) {
      if (s === weak) continue;
      const v = cell(ctx, state, topicId, s);
      if (v && v.n >= MIN_STRONG_EVIDENCE && v.p_mastered >= STRONG_P && v.correct / v.n >= STRONG_MIN_RATE - EPS && v.p_mastered > strongP) {
        strong = s;
        strongP = v.p_mastered;
      }
    }
    if (!strong) continue;
    if (!best || p > best.confidence) {
      best = { ...base, kind: "skill_gap", weak_skill: weak, strong_skill: strong, confidence: round2(p), evidence: { skills } };
    }
  }
  if (best) return best;

  // 2) Konu eksiği: konu her yerde zayıf ve öğrencinin genel seviyesinden beklenenden kötü.
  const all = Object.values(skills);
  const rate = all.reduce((a, e) => a + e!.correct, 0) / Math.max(1, all.reduce((a, e) => a + e!.n, 0));
  if (topicEvidence(ctx, state, topicId) >= MIN_TOPIC_EVIDENCE && rate <= WEAK_MAX_RATE + EPS && topicMastery(ctx, state, topicId) <= TOPIC_GAP_MAX_MASTERY) {
    const p = pTopicGap(ctx, state, topicId);
    if (p >= c.diag_p - EPS) return { ...base, kind: "topic_gap", confidence: round2(p), evidence: { skills } };
  }

  // 3) Etkinlik uyumsuzluğu: aynı beceride bir tür ≤ %35, diğeri ≥ %70 (tür başına ≥ 4 cevap).
  const activities = activityEvidence(attempts);
  let mismatch: DiagnosisCandidate | null = null;
  for (const skill of SKILLS) {
    const types = (Object.entries(activities) as [ActivityType, ActivityEvidence][]).filter(
      ([, e]) => e.skill === skill && e.n >= MIN_ACTIVITY_EVIDENCE,
    );
    if (types.length < 2) continue;
    const rate = ([, e]: [ActivityType, ActivityEvidence]) => e.correct / e.n;
    const weak = types.reduce((a, b) => (rate(b) < rate(a) ? b : a));
    const strong = types.reduce((a, b) => (rate(b) > rate(a) ? b : a));
    const min = rate(weak);
    const max = rate(strong);
    if (min <= 0.35 + EPS && max >= 0.7 - EPS) {
      const confidence = round2(clamp01((max - min - 0.2) / 0.3) * Math.min(1, weak[1].n / 4));
      if (!mismatch || confidence > mismatch.confidence) {
        mismatch = {
          ...base,
          kind: "activity_mismatch",
          weak_skill: skill,
          weak_activity: weak[0],
          strong_activity: strong[0],
          confidence,
          evidence: { skills, activities: { [weak[0]]: weak[1], [strong[0]]: strong[1] } },
        };
      }
    }
  }
  return mismatch;
}

export interface DiagnosisUpdate {
  id: string;
  status: Exclude<DiagnosisStatus, "active">;
}

export interface ReconcileResult {
  insert: DiagnosisCandidate | null;
  updates: DiagnosisUpdate[];
}

/** Aktif teşhis artık geçerli değilse (öğrenci ilerlediyse) `true`. */
export function isResolved(
  ctx: ModelContext,
  state: LearnerState,
  d: ExistingDiagnosis,
  attempts: TopicAttempt[],
): boolean {
  switch (d.kind) {
    case "skill_gap": {
      if (!d.weak_skill) return true;
      const v = cell(ctx, state, d.topic_id, d.weak_skill);
      return !!v && (v.p_mastered >= RESOLVE_SCORE - EPS || pSkillGap(ctx, state, d.topic_id, d.weak_skill) < RESOLVE_GAP_P);
    }
    case "topic_gap":
      return topicMastery(ctx, state, d.topic_id) >= RESOLVE_SCORE - EPS || pTopicGap(ctx, state, d.topic_id) < RESOLVE_GAP_P;
    case "activity_mismatch": {
      const e = d.weak_activity ? activityEvidence(attempts)[d.weak_activity] : undefined;
      return !!e && e.n >= MIN_ACTIVITY_EVIDENCE && e.correct / e.n >= MISMATCH_RESOLVE_RATE - EPS;
    }
  }
}

const sameDiagnosis = (a: ExistingDiagnosis, b: DiagnosisCandidate) =>
  a.kind === b.kind && a.weak_skill === b.weak_skill && a.weak_activity === b.weak_activity;

/**
 * Oturum sonunda bir konu için: aktif teşhislerden çözülenleri `resolved`, yeni ve güvenli
 * (≥ 0,6) bir aday varsa eski farklı aktifleri `superseded` yapar ve adayı ekler.
 */
export function reconcileDiagnoses(args: {
  ctx: ModelContext;
  state: LearnerState;
  topic_id: string;
  candidate: DiagnosisCandidate | null;
  existing: ExistingDiagnosis[];
  attempts?: TopicAttempt[];
}): ReconcileResult {
  const attempts = args.attempts ?? [];
  const updates: DiagnosisUpdate[] = [];
  const stillActive: ExistingDiagnosis[] = [];
  for (const d of args.existing) {
    if (d.topic_id !== args.topic_id || d.status !== "active") continue;
    if (isResolved(args.ctx, args.state, d, attempts)) updates.push({ id: d.id, status: "resolved" });
    else stillActive.push(d);
  }
  const c = args.candidate;
  if (!c || c.confidence < SHOW_CONFIDENCE - EPS) return { insert: null, updates };
  if (stillActive.some((d) => sameDiagnosis(d, c))) return { insert: null, updates };
  for (const d of stillActive) updates.push({ id: d.id, status: "superseded" });
  return { insert: c, updates };
}

/** Teşhis mesajı (şablondan, dil modeli yok). */
export function diagnosisMessage(c: DiagnosisCandidate, topicTitleTr: string): string {
  const ev: DiagnosisEvidence = c.evidence;
  const sk = (s: Skill | null) => (s ? ev.skills[s] : undefined);
  switch (c.kind) {
    case "skill_gap": {
      const strong = sk(c.strong_skill)!;
      const weak = sk(c.weak_skill)!;
      const weakLabel = SKILL_LABELS[c.weak_skill!];
      return (
        `${topicTitleTr} konusunu biliyorsun: ${SKILL_LABELS[c.strong_skill!]} etkinliklerinde ` +
        `${strong.correct}/${strong.n} doğru. Zorlandığın yer ${weakLabel}: ${weak.correct}/${weak.n}. ` +
        `Önümüzdeki oturumlarda ${topicTitleTr} konusunu ${weakLabel} ile çalışacağız.`
      );
    }
    case "topic_gap": {
      const all = Object.values(ev.skills);
      const d = all.reduce((acc, e) => acc + e!.correct, 0);
      const n = all.reduce((acc, e) => acc + e!.n, 0);
      return `${topicTitleTr} henüz oturmamış: tüm becerilerde toplam ${d}/${n}. Konuyu baştan, kısa adımlarla ele alacağız.`;
    }
    case "activity_mismatch": {
      const weak = ev.activities![c.weak_activity!]!;
      const strong = ev.activities![c.strong_activity!]!;
      const wl = `“${ACTIVITY_TYPE_LABELS_TR[c.weak_activity!]}”`;
      const sl = `“${ACTIVITY_TYPE_LABELS_TR[c.strong_activity!]}”`;
      return (
        `${topicTitleTr}: ${wl} türünde ${weak.correct}/${weak.n}, ${sl} türünde ${strong.correct}/${strong.n}. ` +
        `Sende ${sl} daha iyi işliyor; ona ağırlık vereceğiz.`
      );
    }
  }
}
