// Teşhis kuralları (docs/SPEC.md 4.3). Kurallar sırayla uygulanır (docs/PLAN.md karar 1):
// beceri eksiği → konu eksiği → etkinlik uyumsuzluğu → belirsiz (kayıt yok).
import { ACTIVITY_TYPE_LABELS_TR, SKILL_LABELS_TR as SKILL_LABELS, SKILLS } from "@/lib/content/activity-types";
import type {
  ActivityEvidence,
  ActivityType,
  DiagnosisCandidate,
  DiagnosisEvidence,
  DiagnosisStatus,
  ExistingDiagnosis,
  MasteryState,
  Skill,
  SkillEvidence,
  TopicAttempt,
} from "./types";

export const MIN_SKILL_EVIDENCE = 3;
export const SHOW_CONFIDENCE = 0.6;
export const RESOLVE_SCORE = 0.65;
export const MISMATCH_RESOLVE_RATE = 0.7;
const EPS = 1e-9;

export type MasteryBySkill = Partial<Record<Skill, Pick<MasteryState, "score" | "n" | "correct">>>;

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function skillEvidence(mastery: MasteryBySkill): Partial<Record<Skill, SkillEvidence>> {
  const out: Partial<Record<Skill, SkillEvidence>> = {};
  for (const s of SKILLS) {
    const m = mastery[s];
    if (m && m.n > 0) out[s] = { correct: m.correct, n: m.n, score: m.score };
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

/** 4.3: bir konu için teşhis adayı; belirsizse `null`. Güven eşiği burada uygulanmaz. */
export function diagnoseTopic(
  topic_id: string,
  mastery: MasteryBySkill,
  attempts: TopicAttempt[] = [],
): DiagnosisCandidate | null {
  const skills = skillEvidence(mastery);
  const S = SKILLS.filter((s) => (mastery[s]?.n ?? 0) >= MIN_SKILL_EVIDENCE);
  const m = (s: Skill) => mastery[s]!.score;
  const n = (s: Skill) => mastery[s]!.n;
  const base = { topic_id, weak_skill: null, strong_skill: null, weak_activity: null, strong_activity: null };

  if (S.length >= 2) {
    // 1) Beceri eksiği
    const hi = S.reduce((a, b) => (m(b) > m(a) ? b : a));
    const lo = S.reduce((a, b) => (m(b) < m(a) ? b : a));
    const gap = m(hi) - m(lo);
    if (gap >= 0.3 - EPS && m(hi) >= 0.65 - EPS && m(lo) <= 0.45 + EPS) {
      return {
        ...base,
        kind: "skill_gap",
        weak_skill: lo,
        strong_skill: hi,
        confidence: round2(clamp01((gap - 0.15) / 0.25) * Math.min(1, n(lo) / 4)),
        evidence: { skills },
      };
    }
    // 2) Konu eksiği
    const sumN = S.reduce((acc, s) => acc + n(s), 0);
    if (S.every((s) => m(s) <= 0.45 + EPS) && sumN >= 6) {
      const mean = S.reduce((acc, s) => acc + m(s), 0) / S.length;
      return {
        ...base,
        kind: "topic_gap",
        confidence: round2(clamp01((0.55 - mean) / 0.25) * Math.min(1, sumN / 8)),
        evidence: { skills },
      };
    }
  }

  // 3) Etkinlik uyumsuzluğu: aynı beceride n ≥ 3 olan iki tür
  const activities = activityEvidence(attempts);
  let best: DiagnosisCandidate | null = null;
  for (const skill of SKILLS) {
    const types = (Object.entries(activities) as [ActivityType, ActivityEvidence][])
      .filter(([, e]) => e.skill === skill && e.n >= MIN_SKILL_EVIDENCE);
    if (types.length < 2) continue;
    const rate = ([, e]: [ActivityType, ActivityEvidence]) => e.correct / e.n;
    const weak = types.reduce((a, b) => (rate(b) < rate(a) ? b : a));
    const strong = types.reduce((a, b) => (rate(b) > rate(a) ? b : a));
    const min = rate(weak);
    const max = rate(strong);
    if (min <= 0.35 + EPS && max >= 0.7 - EPS) {
      const confidence = round2(clamp01((max - min - 0.2) / 0.3) * Math.min(1, weak[1].n / 4));
      if (!best || confidence > best.confidence) {
        best = {
          ...base,
          kind: "activity_mismatch",
          weak_skill: skill,
          weak_activity: weak[0],
          strong_activity: strong[0],
          confidence,
          evidence: {
            skills,
            activities: { [weak[0]]: weak[1], [strong[0]]: strong[1] },
          },
        };
      }
    }
  }
  return best;
}

export interface DiagnosisUpdate {
  id: string;
  status: Exclude<DiagnosisStatus, "active">;
}

export interface ReconcileResult {
  /** Yeni `active` teşhis (güven ≥ 0,6 ve aynısı zaten aktif değilse). */
  insert: DiagnosisCandidate | null;
  updates: DiagnosisUpdate[];
}

/** Aktif teşhis artık geçerli değilse (öğrenci ilerlediyse) `true`. docs/PLAN.md karar 12. */
export function isResolved(d: ExistingDiagnosis, mastery: MasteryBySkill, attempts: TopicAttempt[]): boolean {
  switch (d.kind) {
    case "skill_gap": {
      const m = d.weak_skill ? mastery[d.weak_skill] : undefined;
      return !!m && m.score >= RESOLVE_SCORE - EPS;
    }
    case "topic_gap": {
      const measured = SKILLS.map((s) => mastery[s]).filter((m) => m && m.n >= MIN_SKILL_EVIDENCE);
      if (measured.length === 0) return false;
      const mean = measured.reduce((acc, m) => acc + m!.score, 0) / measured.length;
      return mean >= RESOLVE_SCORE - EPS;
    }
    case "activity_mismatch": {
      const e = d.weak_activity ? activityEvidence(attempts)[d.weak_activity] : undefined;
      return !!e && e.n >= MIN_SKILL_EVIDENCE && e.correct / e.n >= MISMATCH_RESOLVE_RATE - EPS;
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
  topic_id: string;
  candidate: DiagnosisCandidate | null;
  existing: ExistingDiagnosis[];
  mastery: MasteryBySkill;
  attempts?: TopicAttempt[];
}): ReconcileResult {
  const attempts = args.attempts ?? [];
  const updates: DiagnosisUpdate[] = [];
  const stillActive: ExistingDiagnosis[] = [];
  for (const d of args.existing) {
    if (d.topic_id !== args.topic_id || d.status !== "active") continue;
    if (isResolved(d, args.mastery, attempts)) updates.push({ id: d.id, status: "resolved" });
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
