// Uçtan uca simülasyon çekirdeği (docs/SPEC.md Bölüm 12): sentetik öğrenci + sahte değerlendirme
// ile planlayıcı → öğrenme profili → teşhis döngüsü. Ağ ve veritabanı yok.
// scripts/simulate.ts ve tests/engine/simulate.test.ts bunu kullanır.
import { diagnoseTopic, reconcileDiagnoses } from "@/lib/engine/diagnosis";
import { topicStatus, type CurriculumInput } from "@/lib/engine/curriculum";
import { createContext, defaultTopicB, emptyState, expectedAccuracy, observe, type LearnerState, type ModelContext } from "@/lib/engine/learner-model";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type {
  DiagnosisCandidate,
  EngineL1Code,
  EngineTopic,
  ExistingDiagnosis,
  Interest,
  Level,
  RecentError,
  Skill,
  StudyMode,
  TopicAttempt,
} from "@/lib/engine/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Beceri başına doğru cevap olasılığı. */
export type StudentProfile = Record<Skill, number>;

/** "Yazmada bilen, konuşmada bilmeyen" öğrenci. */
export const WRITES_BUT_CANNOT_SPEAK: StudentProfile = {
  reading: 0.85,
  listening: 0.7,
  writing: 0.9,
  speaking: 0.15,
};

export interface SimSession {
  index: number;
  focus_topic_id: string | null;
  slots: { topic_id: string; skill: Skill; activity_type: string; purpose: string; correct: boolean }[];
  total_seconds: number;
  new_diagnoses: DiagnosisCandidate[];
}

export interface SimResult {
  sessions: SimSession[];
  /** `skill_gap(speaking)` güveni ≥ 0,6 ilk görüldüğü oturum (1 tabanlı) ya da `null`. */
  speaking_gap_session: number | null;
  active: ExistingDiagnosis[];
  /** Odak olduğunda ön koşulu henüz hiç odak/sağlam olmamış konu sayısı (müfredat ölçütü). */
  prerequisite_violations: number;
  /** Odak olan farklı konular. */
  focused_topics: string[];
  ctx: ModelContext;
  state: LearnerState;
}

export function modelContextFor(topics: EngineTopic[]): ModelContext {
  return createContext(topics.map((t) => ({ id: t.id, b: t.irt_b ?? defaultTopicB(t.level, t.l1_risk), l1_risk: t.l1_risk, kind: t.kind })));
}

export function simulate(args: {
  topics: EngineTopic[];
  l1_codes: EngineL1Code[];
  profile?: StudentProfile;
  /** Verilirse sabit beceri olasılıkları yerine: konu pratik edildikçe öğrenilir. */
  learns?: boolean;
  sessions?: number;
  seed?: number;
  start?: Date;
  interests?: Interest[];
  level?: Level;
  study_mode?: StudyMode;
  prior?: { mu: number; sd: number };
}): SimResult {
  const profile = args.profile ?? WRITES_BUT_CANNOT_SPEAK;
  const rng = createRng(args.seed ?? 42);
  const start = args.start ?? new Date("2026-12-14T09:00:00Z");
  const topicById = new Map(args.topics.map((t) => [t.id, t]));
  const ctx = modelContextFor(args.topics);
  const state = emptyState(ctx, args.prior);
  const practice = new Map<string, number>();

  const attempts = new Map<string, TopicAttempt[]>();
  const errors: RecentError[] = [];
  let diagnoses: (ExistingDiagnosis & { candidate: DiagnosisCandidate })[] = [];
  const sessions: SimSession[] = [];
  const recentFocus: (string | null)[] = [];
  const firstFocus = new Map<string, number>();
  let violations = 0;
  let speakingGap: number | null = null;

  for (let s = 0; s < (args.sessions ?? 6); s++) {
    const now = new Date(start.getTime() + s * DAY_MS);
    const plan = planSession({
      now,
      rng,
      level_est: args.level ?? "A1",
      interests: args.interests ?? ["football", "gaming"],
      topics: args.topics,
      l1_codes: args.l1_codes,
      model: { ctx, state },
      activity_stats: [],
      active_diagnoses: diagnoses.filter((d) => d.status === "active"),
      recent_errors: errors,
      school_topic_id: null,
      study_mode: args.study_mode ?? "school",
      goal: null,
      focus_choice: null,
      recent_focus: recentFocus,
      session_index: s,
      settings: { tts_enabled: true, general_content_rate: 0.2 },
    });

    if (plan.focus_topic_id && !firstFocus.has(plan.focus_topic_id)) {
      firstFocus.set(plan.focus_topic_id, s);
      const cur: CurriculumInput = {
        ctx, state, topics: args.topics, level_est: args.level ?? "A1", study_mode: "school", goal: null,
        school_topic_id: null, focus_choice: null, recent_focus: recentFocus,
      };
      // İhlal: ön koşul ne önce odak oldu, ne sağlam, ne de beklenen doğru oranı ≥ %65 (hazır).
      for (const p of topicById.get(plan.focus_topic_id)!.prereqs) {
        const pt = topicById.get(p);
        if (pt && !firstFocus.has(p) && topicStatus(cur, pt) !== "solid" && expectedAccuracy(ctx, state, p) < 0.65) violations++;
      }
    }
    recentFocus.unshift(plan.focus_topic_id);

    const session: SimSession = { index: s + 1, focus_topic_id: plan.focus_topic_id, slots: [], total_seconds: plan.total_seconds, new_diagnoses: [] };
    const touched = new Set<string>();
    plan.slots.forEach((slot, i) => {
      const at = new Date(now.getTime() + (i + 1) * 90_000);
      let p = profile[slot.skill];
      if (args.learns) {
        const n = practice.get(slot.topic_id) ?? 0;
        practice.set(slot.topic_id, n + 1);
        p = Math.min(0.95, profile[slot.skill] * (0.5 + 0.08 * n));
      }
      const correct = rng() < p;
      observe(ctx, state, { topic_id: slot.topic_id, skill: slot.skill, mode: slot.mode, score: correct ? 1 : 0, weight: 1, at });
      const list = attempts.get(slot.topic_id) ?? [];
      list.push({ skill: slot.skill, activity_type: slot.activity_type, is_correct: correct });
      attempts.set(slot.topic_id, list);
      if (!correct) errors.push({ topic_id: slot.topic_id, skill: slot.skill, l1_code: slot.l1_target ?? "GEN.OTHER", created_at: at });
      touched.add(slot.topic_id);
      session.slots.push({ topic_id: slot.topic_id, skill: slot.skill, activity_type: slot.activity_type, purpose: slot.purpose, correct });
    });

    for (const topicId of touched) {
      const candidate = diagnoseTopic(ctx, state, topicId, attempts.get(topicId));
      const result = reconcileDiagnoses({ ctx, state, topic_id: topicId, candidate, existing: diagnoses, attempts: attempts.get(topicId) });
      for (const u of result.updates) diagnoses = diagnoses.map((d) => (d.id === u.id ? { ...d, status: u.status } : d));
      if (result.insert) {
        const c = result.insert;
        diagnoses.push({ id: `d${diagnoses.length + 1}`, topic_id: c.topic_id, kind: c.kind, weak_skill: c.weak_skill, weak_activity: c.weak_activity, status: "active", candidate: c });
        session.new_diagnoses.push(c);
      }
    }
    const hasGap = diagnoses.some((d) => d.status === "active" && d.kind === "skill_gap" && d.weak_skill === "speaking" && d.candidate.confidence >= 0.6);
    if (hasGap && speakingGap === null) speakingGap = s + 1;
    sessions.push(session);
  }

  return {
    sessions,
    speaking_gap_session: speakingGap,
    active: diagnoses.filter((d) => d.status === "active").map((d) => ({
      id: d.id, topic_id: d.topic_id, kind: d.kind, weak_skill: d.weak_skill, weak_activity: d.weak_activity, status: d.status,
    })),
    prerequisite_violations: violations,
    focused_topics: [...firstFocus.keys()],
    ctx,
    state,
  };
}
