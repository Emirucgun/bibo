// Oturum planlayıcısı v2 (docs/SPEC.md 4.4): müfredat motorunun odağı + öğrenme profilinin
// tekrar zamanları + oturum bileşimi (odak, aralıklı tekrar, doğrulama sondası, anlam odaklı girdi
// ve çıktı, akıcılık ya da germe). Hedef: 8–10 etkinlik, 900–1200 sn, dört beceri en az birer kez
// (seslendirme kapalıyken dinleme hariç).
import { ACTIVITY_TYPE_INFO, ACTIVITY_TYPES, SKILLS } from "@/lib/content/activity-types";
import { chooseFocus, defaultPath, openTopics, topicStatus, type CurriculumInput } from "./curriculum";
import { STRONG_P } from "./diagnosis";
import { effectivenessScore } from "./effectiveness";
import { cell, reviewInDays, topicEvidence } from "./learner-model";
import type {
  ActivityType,
  EngineTopic,
  ExistingDiagnosis,
  Interest,
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
export const REVIEW_SLOTS = 2;
export const RECENT_ERROR_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Eşit kanıtta beceri sırası: önce üretim becerileri. docs/PLAN.md karar 7. */
export const SKILL_TIE_ORDER: Skill[] = ["writing", "speaking", "reading", "listening"];

/** Seslendirme kapalıyken dinleme türlerinin metin karşılığı (aynı mod). */
export const TTS_FALLBACK: Partial<Record<ActivityType, ActivityType>> = {
  listen_choose: "mcq_read",
  dictation: "gap_fill",
};

const TYPES_BY_SKILL: Record<Skill, ActivityType[]> = Object.fromEntries(
  SKILLS.map((s) => [s, ACTIVITY_TYPES.filter((t) => ACTIVITY_TYPE_INFO[t].skill === s)]),
) as Record<Skill, ActivityType[]>;

/** Amaca göre izinli türler (boş = becerinin tüm türleri). */
const PURPOSE_TYPES: Partial<Record<Purpose, ActivityType[]>> = {
  input: ["mcq_read", "listen_choose"],
  output: ["short_write", "speak_answer", "translate_tr_en"],
  fluency: ["gap_fill", "word_order", "dictation", "mcq_read", "listen_choose"],
};

const est = (t: ActivityType) => ACTIVITY_TYPE_INFO[t].est_seconds;

type Role = "focus" | "interleave" | "review" | "probe" | "input" | "output" | "fluency" | "stretch" | "coverage" | "fill";

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
  const { ctx, state } = input.model;
  const tts = settings.tts_enabled;
  const notes: string[] = [];
  if (!tts) notes.push("tts_disabled: listening slots fall back to text types");

  const cur: CurriculumInput = {
    ctx,
    state,
    topics: input.topics,
    level_est: input.level_est,
    study_mode: input.study_mode,
    goal: input.goal,
    school_topic_id: input.school_topic_id,
    focus_choice: input.focus_choice,
    recent_focus: input.recent_focus,
  };
  const open = openTopics(cur);
  const openIds = new Set(open.map((t) => t.id));
  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  const pron = input.topics.filter((t) => t.active && t.kind === "pron" && tts);
  const requiredSkills = SKILLS.filter((s) => tts || s !== "listening");
  const skillsFor = (t: EngineTopic): Skill[] => (t.kind === "pron" ? ["listening"] : requiredSkills);
  const nOf = (t: string, s: Skill) => cell(ctx, state, t, s)?.n ?? 0;
  const pOf = (t: string, s: Skill) => cell(ctx, state, t, s)?.p_mastered ?? 0;

  const activeDiag = new Map<string, ExistingDiagnosis>();
  for (const d of input.active_diagnoses) if (d.status === "active") activeDiag.set(d.topic_id, d);

  const recentCutoff = now.getTime() - RECENT_ERROR_DAYS * DAY_MS;
  const recentErrors = input.recent_errors
    .filter((e) => e.created_at.getTime() >= recentCutoff && openIds.has(e.topic_id))
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  const leastMeasured = (t: EngineTopic, skills: Skill[]) =>
    [...skills].sort(
      (a, b) => nOf(t.id, a) - nOf(t.id, b) || pOf(t.id, a) - pOf(t.id, b) || SKILL_TIE_ORDER.indexOf(a) - SKILL_TIE_ORDER.indexOf(b),
    );

  const slots: Draft[] = [];

  const pickType = (topic: string, skill: Skill, purpose: Purpose, avoid: ActivityType[] = []): { skill: Skill; type: ActivityType } => {
    const allowed = PURPOSE_TYPES[purpose];
    const all = TYPES_BY_SKILL[skill].filter((t) => !allowed || allowed.includes(t));
    const base = all.length > 0 ? all : TYPES_BY_SKILL[skill];
    const usedHere = slots.filter((x) => x.topic_id === topic && x.skill === skill).map((x) => x.activity_type);
    let candidates = base.filter((t) => !avoid.includes(t) && !usedHere.includes(t));
    if (candidates.length === 0) candidates = base.filter((t) => !avoid.includes(t));
    if (candidates.length === 0) candidates = base;
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
    const picked = pickType(t.id, skill, purpose, avoid);
    slots.push({ topic_id: t.id, skill: picked.skill, activity_type: picked.type, purpose, role, reason });
  };
  const used = (id: string) => slots.some((x) => x.topic_id === id);

  // 1. Odak (3): müfredat motoru; beceri eksiği varsa 2 slot zayıf beceriden.
  const decision = chooseFocus(cur);
  const focus = decision.topic;
  if (decision.bridge_for) notes.push(`bridge: ${focus?.id} before school topic ${decision.bridge_for}`);
  if (focus) {
    const diag = activeDiag.get(focus.id);
    const skills = skillsFor(focus);
    let focusSkills: Skill[];
    if (diag?.kind === "skill_gap" && diag.weak_skill && skills.includes(diag.weak_skill)) {
      const other = leastMeasured(focus, skills.filter((s) => s !== diag.weak_skill))[0];
      focusSkills = [diag.weak_skill, diag.weak_skill, other];
    } else {
      const ranked = leastMeasured(focus, skills);
      focusSkills = [ranked[0], ranked[1] ?? ranked[0], ranked[0]];
    }
    const avoidFor = (s: Skill): ActivityType[] =>
      diag?.kind === "activity_mismatch" && diag.weak_skill === s && diag.weak_activity ? [diag.weak_activity] : [];
    // Karışık çalışma: odak en az bir oturumdur sürüyorsa üçüncü slot karışabilir konusundan.
    const streak = input.recent_focus.filter((f) => f === focus.id).length;
    const partner = (focus.confusables ?? [])
      .map((id) => topicById.get(id))
      .find((p): p is EngineTopic => !!p && openIds.has(p.id) && topicEvidence(ctx, state, p.id) >= 2);
    focusSkills.forEach((s, i) => {
      if (i === 2 && partner && streak >= 1) {
        add(partner, leastMeasured(partner, skillsFor(partner))[0], "review", "interleave", `interleave with ${focus.id}`);
      } else {
        add(focus, s, "focus", "focus", `${decision.reason}${diag ? ` (${diag.kind})` : ""}`, avoidFor(s));
      }
    });
  } else {
    notes.push("no_focus_topic");
  }

  // 2. Doğrulama sondası (1): son hatanın konusu, hatanın yapıldığı beceriden FARKLI bir beceride.
  const probeFrom = recentErrors.find((e) => !used(e.topic_id) || e.topic_id === focus?.id);
  if (probeFrom) {
    // Ayırt edici sonda: konu başka bir beceride sağlamsa hatalı beceri yeniden sınanır (beceri eksiği mi?);
    // değilse başka bir beceride sınanır (konu eksiği mi?).
    const t = topicById.get(probeFrom.topic_id)!;
    const others = skillsFor(t).filter((s) => s !== probeFrom.skill);
    const strongElsewhere = others.some((s) => nOf(t.id, s) > 0 && pOf(t.id, s) >= STRONG_P);
    if (strongElsewhere) add(t, probeFrom.skill, "probe", "probe", `probe same skill (${probeFrom.skill}) after error; strong elsewhere`);
    else if (others.length > 0) add(t, leastMeasured(t, others)[0], "probe", "probe", `probe after error in ${probeFrom.skill}`);
  } else {
    // Kısa kontrol: okul konusu ya da varsayılan yoldaki ilk "büyük olasılıkla biliniyor" konu;
    // yoksa çalışılan konunun en az ölçülen becerisi.
    const school = input.school_topic_id ? topicById.get(input.school_topic_id) : undefined;
    const likely =
      (school && !used(school.id) && openIds.has(school.id) && topicStatus(cur, school) === "likely" ? school : undefined) ??
      defaultPath(open).find((t) => !used(t.id) && topicStatus(cur, t) === "likely");
    if (likely) add(likely, leastMeasured(likely, skillsFor(likely))[0], "probe", "probe", "verify likely-known topic");
    else {
      const uncertain = open
        .filter((t) => !used(t.id) && topicStatus(cur, t) === "learning")
        .map((t) => ({ t, s: leastMeasured(t, skillsFor(t))[0] }))
        .sort((a, b) => nOf(a.t.id, a.s) - nOf(b.t.id, b.s))[0];
      if (uncertain) add(uncertain.t, uncertain.s, "probe", "probe", "probe least measured skill");
    }
  }

  // 3. Aralıklı tekrar (2): vadesi gelen hücreler (unutma modeli), en düşük ustalıktan.
  const due: { t: EngineTopic; s: Skill; p: number }[] = [];
  for (const t of [...open, ...pron]) {
    if (t.id === focus?.id) continue;
    for (const s of skillsFor(t)) {
      const days = reviewInDays(ctx, state, t.id, s);
      if (days === 0) due.push({ t, s, p: pOf(t.id, s) });
    }
  }
  due.sort((a, b) => a.p - b.p);
  for (const d of due) {
    if (slots.filter((x) => x.role === "review").length >= REVIEW_SLOTS) break;
    if (used(d.t.id)) continue;
    add(d.t, d.s, "review", "review", "review due (forgetting model)");
  }
  if (due.length === 0) notes.push("no_review_due");

  // 4–6. Anlam odaklı girdi, çıktı, akıcılık/germe. Okul modunda girdi ve akıcılık dönüşümlü.
  const selfMode = input.study_mode === "self";
  const even = input.session_index % 2 === 0;
  const known = open.filter((t) => topicStatus(cur, t) === "solid" || topicEvidence(ctx, state, t.id) >= 2);
  const pickKnown = () => known.filter((t) => !used(t.id))[Math.floor(rng() * Math.max(1, known.filter((t) => !used(t.id)).length))];
  if (selfMode || even) {
    const t = pickKnown() ?? focus;
    if (t) {
      const skill: Skill = tts && input.session_index % 2 === 1 ? "listening" : "reading";
      add(t, skill, "input", "input", "meaning-focused input");
    }
  }
  if (focus) {
    const skill: Skill = slots.some((x) => x.skill === "speaking") ? "writing" : "speaking";
    add(focus, skill, "output", "output", "meaning-focused output (can-do task)");
  }
  if (selfMode && !even) {
    const solid = open.filter((t) => topicStatus(cur, t) === "solid" && !used(t.id));
    const t = solid[Math.floor(rng() * solid.length)];
    if (t) add(t, leastMeasured(t, ["writing", "reading"])[0], "fluency", "fluency", "fluency round (known structure)");
  } else {
    const stretch = open.find((t) => !used(t.id) && topicStatus(cur, t) === "ready" && topicEvidence(ctx, state, t.id) === 0);
    if (stretch) add(stretch, leastMeasured(stretch, skillsFor(stretch))[0], "stretch", "stretch", "stretch: next ready topic");
  }

  // 7. Kapsama: eksik her beceri.
  const anchor = focus ?? (slots[0] ? topicById.get(slots[0].topic_id) : null) ?? open[0] ?? null;
  for (const s of requiredSkills) {
    if (slots.some((x) => x.skill === s)) continue;
    let t: EngineTopic | null = anchor;
    if (s === "listening") {
      const p = pron.filter((pt) => !used(pt.id)).sort((a, b) => nOf(a.id, "listening") - nOf(b.id, "listening"))[0];
      if (p && nOf(p.id, "listening") < 3) t = p;
    }
    if (!t) continue;
    const purpose: Purpose = t.id === focus?.id ? "focus" : "review";
    add(t, s, purpose, "coverage", `coverage: ${s}`);
  }

  // 8. Sayı ve süre.
  // Doldurma: önce çalışılan konular (en düşük ustalık), sonra kontrol edilecekler, sonra yoldaki hazır konular.
  const statusRank: Record<string, number> = { learning: 0, likely: 1, ready: 2, solid: 3, locked: 4 };
  const pathOrder = new Map(defaultPath(open).map((t, i) => [t.id, i]));
  const fillQueue = open
    .filter((t) => t.id !== focus?.id)
    .map((t) => ({ t, st: statusRank[topicStatus(cur, t)] }))
    .filter((x) => x.st < 4)
    .sort((a, b) => a.st - b.st || (pathOrder.get(a.t.id) ?? 0) - (pathOrder.get(b.t.id) ?? 0))
    .map((x) => x.t);
  const addFill = (reason: string) => {
    const t = fillQueue.find((x) => !used(x.id)) ?? fillQueue[0] ?? focus;
    if (!t) return false;
    add(t, leastMeasured(t, skillsFor(t))[0], "review", "fill", reason);
    return true;
  };
  const total = () => slots.reduce((a, x) => a + est(x.activity_type), 0);
  const coveredWithout = (i: number) => requiredSkills.every((s) => slots.some((x, j) => j !== i && x.skill === s));
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
  const dropOrder: Role[] = ["fill", "fluency", "stretch", "input", "review", "coverage", "interleave", "probe"];
  while (slots.length > MAX_SLOTS && removeOne(dropOrder)) { /* */ }
  while (total() > MAX_SECONDS && slots.length > MIN_SLOTS && removeOne(dropOrder)) { /* */ }
  while (slots.length < MIN_SLOTS && addFill("fill: minimum slot count")) { /* */ }
  while (total() < MIN_SECONDS && slots.length < MAX_SLOTS && addFill("fill: minimum duration")) { /* */ }

  const mismatchAvoid = (x: Draft) => {
    const d = activeDiag.get(x.topic_id);
    return d?.kind === "activity_mismatch" ? d.weak_activity : null;
  };
  const shift = (x: Draft, dir: 1 | -1): ActivityType | null => {
    const allowed = PURPOSE_TYPES[x.purpose];
    const types = TYPES_BY_SKILL[x.skill]
      .filter((t) => !allowed || allowed.includes(t))
      .filter((t) => tts || !TTS_FALLBACK[t])
      .filter((t) => t !== mismatchAvoid(x))
      .filter((t) => (dir === 1 ? est(t) > est(x.activity_type) : est(t) < est(x.activity_type)))
      .sort((a, b) => dir * (est(a) - est(b)));
    return types[0] ?? null;
  };
  const retype = (dir: 1 | -1) => {
    const order = slots.map((x, i) => ({ x, i })).sort((a, b) => dir * (est(a.x.activity_type) - est(b.x.activity_type)));
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

  // 9. İlgi alanları ve çıktı.
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

  return { focus_topic_id: focus?.id ?? null, bridge_for: decision.bridge_for, slots: out, total_seconds: total(), notes };
}

/** `round(n × rate)` slot genel içerik (`null`, rastgele konum); diğerleri ilgi alanlarına sırayla. */
export function assignInterests(n: number, interests: Interest[], rate: number, rng: () => number): (Interest | null)[] {
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
