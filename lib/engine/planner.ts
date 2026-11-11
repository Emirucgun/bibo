// Oturum planlayıcısı (docs/SPEC.md 4.4; açık noktalar docs/PLAN.md karar 2, 4–11).
// Hedef: 8–10 etkinlik, est_seconds toplamı 900–1200 sn, dört beceri en az birer kez
// (seslendirme kapalıyken dinleme hariç).
import { ACTIVITY_TYPE_INFO, ACTIVITY_TYPES, SKILLS } from "@/lib/content/activity-types";
import { effectivenessScore } from "./effectiveness";
import { emptyMastery } from "./mastery";
import type {
  ActivityType,
  EngineTopic,
  ExistingDiagnosis,
  Interest,
  MasteryState,
  Plan,
  PlannerInput,
  PlanSlot,
  Purpose,
  Skill,
} from "./types";

export const MIN_SLOTS = 8;
export const MAX_SLOTS = 10;
export const MIN_SECONDS = 900;
export const MAX_SECONDS = 1200;
export const EPSILON = 0.2;
export const FOCUS_SLOTS = 3;
export const CROSS_SLOTS = 2;
export const RECENT_ERROR_DAYS = 3;
export const STRETCH_PREREQ_SCORE = 0.6;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Eşit kanıtta beceri sırası: önce üretim becerileri (yazma, konuşma). Ürünün ana sorusu
 * "yazmada biliyor, konuşmada bilmiyor" ayrımı; tanıma becerileri (α = 0,15) yavaş ilerler.
 * docs/PLAN.md karar 7.
 */
export const SKILL_TIE_ORDER: Skill[] = ["writing", "speaking", "reading", "listening"];

/** Seslendirme kapalıyken dinleme türlerinin metin karşılığı (aynı mod). */
export const TTS_FALLBACK: Partial<Record<ActivityType, ActivityType>> = {
  listen_choose: "mcq_read",
  dictation: "gap_fill",
};

const TYPES_BY_SKILL: Record<Skill, ActivityType[]> = Object.fromEntries(
  SKILLS.map((s) => [s, ACTIVITY_TYPES.filter((t) => ACTIVITY_TYPE_INFO[t].skill === s)]),
) as Record<Skill, ActivityType[]>;

const est = (t: ActivityType) => ACTIVITY_TYPE_INFO[t].est_seconds;

type Role = "review" | "focus" | "cross" | "coverage" | "stretch";

interface Draft {
  topic_id: string;
  skill: Skill;
  activity_type: ActivityType;
  purpose: Purpose;
  role: Role;
  reason: string;
}

export function planSession(input: PlannerInput): Plan {
  const { now, rng, settings } = input;
  const tts = settings.tts_enabled;
  const notes: string[] = [];
  if (!tts) notes.push("tts_disabled: listening slots fall back to text types");

  const levelOk = (t: EngineTopic) => input.level_est === "A2" || t.level === "A1";
  const open = input.topics
    .filter((t) => t.active && levelOk(t) && (t.kind !== "pron" || tts))
    .sort((a, b) => a.sort - b.sort);
  const topicById = new Map(open.map((t) => [t.id, t]));
  const grammar = open.filter((t) => t.kind === "grammar");
  const pron = open.filter((t) => t.kind === "pron");

  const requiredSkills = SKILLS.filter((s) => tts || s !== "listening");
  /** Konunun planlanabilir becerileri: sesletim yalnızca dinleme. */
  const skillsFor = (t: EngineTopic): Skill[] => (t.kind === "pron" ? ["listening"] : requiredSkills);

  const masteryKey = (topic: string, skill: Skill) => `${topic}|${skill}`;
  const masteryMap = new Map(input.mastery.map((r) => [masteryKey(r.topic_id, r.skill), r]));
  const getM = (t: EngineTopic, s: Skill): MasteryState => masteryMap.get(masteryKey(t.id, s)) ?? emptyMastery(t);

  const activeDiag = new Map<string, ExistingDiagnosis>();
  for (const d of input.active_diagnoses) if (d.status === "active") activeDiag.set(d.topic_id, d);

  const recentCutoff = now.getTime() - RECENT_ERROR_DAYS * DAY_MS;
  const recentErrors = input.recent_errors
    .filter((e) => e.created_at.getTime() >= recentCutoff && topicById.has(e.topic_id))
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  const priority = (t: EngineTopic) => {
    const minM = Math.min(...skillsFor(t).map((s) => getM(t, s).score));
    return (
      1 - minM +
      0.15 * t.l1_risk +
      (input.school_topic_id === t.id ? 0.2 : 0) +
      (activeDiag.has(t.id) ? 0.1 : 0)
    );
  };
  const byPriority = [...grammar].sort((a, b) => priority(b) - priority(a) || a.sort - b.sort);

  /** Kanıtı az olan beceri önce, eşitse ustalığı düşük olan. */
  const leastMeasured = (t: EngineTopic, skills: Skill[]) =>
    [...skills].sort(
      (a, b) =>
        getM(t, a).n - getM(t, b).n ||
        getM(t, a).score - getM(t, b).score ||
        SKILL_TIE_ORDER.indexOf(a) - SKILL_TIE_ORDER.indexOf(b),
    );

  const slots: Draft[] = [];

  /** Beceri içinde ε-greedy tür seçimi; seslendirme kapalıysa dinleme türü metne düşer. */
  const pickType = (topic: string, skill: Skill, avoid: ActivityType[] = []): { skill: Skill; type: ActivityType } => {
    const all = TYPES_BY_SKILL[skill];
    const usedHere = slots.filter((x) => x.topic_id === topic && x.skill === skill).map((x) => x.activity_type);
    let candidates = all.filter((t) => !avoid.includes(t) && !usedHere.includes(t));
    if (candidates.length === 0) candidates = all.filter((t) => !avoid.includes(t));
    if (candidates.length === 0) candidates = all;
    let type: ActivityType;
    if (candidates.length > 1 && rng() < EPSILON) {
      type = candidates[Math.floor(rng() * candidates.length)];
    } else {
      const score = (t: ActivityType) => effectivenessScore(input.activity_stats.find((s) => s.activity_type === t));
      type = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    }
    if (!tts && TTS_FALLBACK[type]) {
      const fb = TTS_FALLBACK[type]!;
      return { skill: ACTIVITY_TYPE_INFO[fb].skill, type: fb };
    }
    return { skill, type };
  };

  const add = (t: EngineTopic, skill: Skill, purpose: Purpose, role: Role, reason: string, avoid: ActivityType[] = []) => {
    const picked = pickType(t.id, skill, avoid);
    slots.push({ topic_id: t.id, skill: picked.skill, activity_type: picked.type, purpose, role, reason });
  };

  // 1. Tekrar: vadesi gelmiş en eski (konu, beceri)
  const due = input.mastery
    .filter((r) => r.n > 0 && r.next_review_at && r.next_review_at.getTime() <= now.getTime())
    .filter((r) => {
      const t = topicById.get(r.topic_id);
      return !!t && skillsFor(t).includes(r.skill === "listening" && !tts ? "reading" : r.skill);
    })
    .sort((a, b) => a.next_review_at!.getTime() - b.next_review_at!.getTime());
  const review = due[0] ? topicById.get(due[0].topic_id)! : null;
  if (review) add(review, due[0].skill, "review", "review", `due since ${due[0].next_review_at!.toISOString()}`);
  else notes.push("no_review_due");

  // 2. Odak
  const focus = byPriority[0] ?? null;
  if (focus) {
    const diag = activeDiag.get(focus.id);
    const skills = skillsFor(focus);
    let focusSkills: Skill[];
    if (diag?.kind === "skill_gap" && diag.weak_skill && skills.includes(diag.weak_skill)) {
      const other = leastMeasured(focus, skills.filter((s) => s !== diag.weak_skill))[0];
      focusSkills = [diag.weak_skill, diag.weak_skill, other];
    } else {
      const ranked = leastMeasured(focus, skills);
      focusSkills = [ranked[0], ranked[1], ranked[0]];
    }
    const avoidFor = (s: Skill): ActivityType[] =>
      diag?.kind === "activity_mismatch" && diag.weak_skill === s && diag.weak_activity ? [diag.weak_activity] : [];
    for (const s of focusSkills.slice(0, FOCUS_SLOTS)) {
      add(focus, s, "focus", "focus", diag ? `focus (${diag.kind})` : `focus priority ${priority(focus).toFixed(2)}`, avoidFor(s));
    }
  } else {
    notes.push("no_focus_topic");
  }

  // 3. Çapraz tekrar: son 3 günde hata yapılan, sonra belirsiz, sonra öncelik sırası
  const errorSkills = new Map<string, Set<Skill>>();
  for (const e of recentErrors) {
    if (!errorSkills.has(e.topic_id)) errorSkills.set(e.topic_id, new Set());
    errorSkills.get(e.topic_id)!.add(e.skill);
  }
  // Belirsiz konular karara en yakın olandan (toplam kanıtı en çok) başlar: kanıt dağılmaz,
  // eksik ölçülen beceride birikir (PRD F7). docs/PLAN.md karar 6.
  const evidenceN = (t: EngineTopic) => skillsFor(t).reduce((a, s) => a + getM(t, s).n, 0);
  const uncertain = byPriority
    .filter((t) => {
      const ms = skillsFor(t).map((s) => getM(t, s));
      return ms.some((m) => m.n > 0) && ms.some((m) => m.n < 3) && !activeDiag.has(t.id);
    })
    .sort((a, b) => evidenceN(b) - evidenceN(a));
  const crossQueue: EngineTopic[] = [];
  const pushUnique = (t: EngineTopic | undefined) => {
    if (t && t.kind === "grammar" && t.id !== focus?.id && t.id !== review?.id && !crossQueue.includes(t)) crossQueue.push(t);
  };
  for (const e of recentErrors) pushUnique(topicById.get(e.topic_id));
  uncertain.forEach(pushUnique);
  byPriority.forEach(pushUnique);

  const addCross = (reason?: string) => {
    const t = crossQueue.shift();
    if (!t) return false;
    const errs = errorSkills.get(t.id);
    const allowed = skillsFor(t).filter((s) => !errs?.has(s));
    const skill = leastMeasured(t, allowed.length ? allowed : skillsFor(t))[0];
    add(t, skill, "retest", "cross", reason ?? (errs ? "cross-skill retest after recent error" : "cross-skill retest (uncertain)"));
    return true;
  };
  for (let i = 0; i < CROSS_SLOTS; i++) addCross();

  // 4. Kapsama: eksik her beceri
  const anchor = focus ?? review ?? grammar[0] ?? null;
  for (const s of requiredSkills) {
    if (slots.some((x) => x.skill === s)) continue;
    let t: EngineTopic | null = anchor;
    if (s === "listening") {
      const p = pron
        .map((pt) => ({ pt, m: getM(pt, "listening") }))
        .filter(({ pt, m }) => m.n < 3 && !slots.some((x) => x.topic_id === pt.id))
        .sort((a, b) => a.m.n - b.m.n)[0];
      if (p) t = p.pt;
    }
    if (!t) continue;
    const purpose: Purpose = t.id === focus?.id ? "focus" : t.id === review?.id ? "review" : "retest";
    add(t, s, purpose, "coverage", `coverage: ${s}`);
  }

  // 5. Germe
  const avgMeasured = (t: EngineTopic) => {
    const ms = skillsFor(t).map((s) => getM(t, s)).filter((m) => m.n > 0);
    return ms.length ? ms.reduce((a, m) => a + m.score, 0) / ms.length : null;
  };
  const stretch = grammar.find((t) => {
    if (slots.some((x) => x.topic_id === t.id)) return false;
    if (skillsFor(t).some((s) => getM(t, s).n > 0)) return false;
    return t.prereqs.every((p) => {
      const pt = input.topics.find((x) => x.id === p);
      const avg = pt ? avgMeasured(pt) : null;
      return avg !== null && avg >= STRETCH_PREREQ_SCORE;
    });
  });
  if (stretch) {
    const counts = (s: Skill) => slots.filter((x) => x.skill === s).length;
    const skill = [...skillsFor(stretch)].sort((a, b) => counts(a) - counts(b))[0];
    add(stretch, skill, "stretch", "stretch", "stretch: prerequisites ≥ 0.6, no evidence yet");
  }

  // 6. Sayı ve süre ayarı
  const total = () => slots.reduce((a, x) => a + est(x.activity_type), 0);
  const coveredWithout = (i: number) =>
    requiredSkills.every((s) => slots.some((x, j) => j !== i && x.skill === s));
  const removeOne = (roles: Role[]) => {
    for (const role of roles) {
      for (let i = slots.length - 1; i >= 0; i--) {
        if (slots[i].role === role && coveredWithout(i)) {
          slots.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  };
  while (slots.length > MAX_SLOTS && removeOne(["stretch", "review", "cross", "coverage", "focus"])) { /* */ }
  while (total() > MAX_SECONDS && slots.length > MIN_SLOTS && removeOne(["stretch", "review"])) { /* */ }
  while (slots.length < MIN_SLOTS && addCross("fill: minimum slot count")) { /* */ }
  while (total() < MIN_SECONDS && slots.length < MAX_SLOTS && addCross("fill: minimum duration")) { /* */ }

  const mismatchAvoid = (x: Draft) => {
    const d = activeDiag.get(x.topic_id);
    return d?.kind === "activity_mismatch" ? d.weak_activity : null;
  };
  /** Aynı beceride bir sonraki daha uzun (dir = 1) ya da daha kısa (dir = -1) tür. */
  const shift = (x: Draft, dir: 1 | -1): ActivityType | null => {
    const types = TYPES_BY_SKILL[x.skill]
      .filter((t) => tts || !TTS_FALLBACK[t])
      .filter((t) => t !== mismatchAvoid(x))
      .filter((t) => (dir === 1 ? est(t) > est(x.activity_type) : est(t) < est(x.activity_type)))
      .sort((a, b) => dir * (est(a) - est(b)));
    return types[0] ?? null;
  };
  const retype = (dir: 1 | -1) => {
    // uzatırken en kısa slottan, kısaltırken en uzun slottan başla
    const order = slots
      .map((x, i) => ({ x, i }))
      .sort((a, b) => dir * (est(a.x.activity_type) - est(b.x.activity_type)));
    for (const { x } of order) {
      const next = shift(x, dir);
      if (next) {
        x.reason += ` · retyped ${x.activity_type}→${next} (duration)`;
        x.activity_type = next;
        return true;
      }
    }
    return false;
  };
  while (total() > MAX_SECONDS && retype(-1)) { /* */ }
  while (total() < MIN_SECONDS && retype(1)) { /* */ }
  if (total() < MIN_SECONDS || total() > MAX_SECONDS) notes.push(`duration_out_of_range: ${total()}`);

  // 7. İlgi alanları ve 8. çıktı
  const interests = assignInterests(slots.length, input.interests, settings.general_content_rate, rng);
  const out: PlanSlot[] = slots.map((x, i) => ({
    position: i + 1,
    topic_id: x.topic_id,
    skill: x.skill,
    activity_type: x.activity_type,
    mode: ACTIVITY_TYPE_INFO[x.activity_type].mode,
    purpose: x.purpose,
    l1_target: l1TargetFor(x.topic_id, recentErrors, input.l1_codes),
    interest: interests[i],
    reason: x.reason,
  }));

  return { focus_topic_id: focus?.id ?? null, slots: out, total_seconds: total(), notes };
}

/** `round(n × rate)` slot genel içerik (`null`, rastgele konum); diğerleri ilgi alanlarına sırayla. */
export function assignInterests(
  n: number,
  interests: Interest[],
  rate: number,
  rng: () => number,
): (Interest | null)[] {
  if (interests.length === 0) return Array(n).fill(null);
  const general = Math.min(n, Math.max(0, Math.round(n * rate)));
  const positions = Array.from({ length: n }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const nulls = new Set(positions.slice(0, general));
  let k = 0;
  return Array.from({ length: n }, (_, i) => (nulls.has(i) ? null : interests[k++ % interests.length]));
}

function l1TargetFor(
  topicId: string,
  recentErrors: { topic_id: string; l1_code: string }[],
  codes: { code: string; topic_id: string | null }[],
): string | null {
  const recent = recentErrors.find((e) => e.topic_id === topicId);
  if (recent) return recent.l1_code;
  return codes.find((c) => c.topic_id === topicId && c.code.startsWith("L1."))?.code ?? null;
}
