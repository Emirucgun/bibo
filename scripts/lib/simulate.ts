// Uçtan uca simülasyon çekirdeği (docs/SPEC.md Bölüm 12): sentetik öğrenci + sahte
// değerlendirme ile planlayıcı → ustalık → teşhis döngüsü. Ağ ve veritabanı yok.
// scripts/simulate.ts ve tests/engine/simulate.test.ts bunu kullanır.
import { diagnoseTopic, reconcileDiagnoses, type MasteryBySkill } from "@/lib/engine/diagnosis";
import { applyEvidence, emptyMastery } from "@/lib/engine/mastery";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type {
  DiagnosisCandidate,
  EngineL1Code,
  EngineTopic,
  ExistingDiagnosis,
  Interest,
  MasteryRow,
  RecentError,
  Skill,
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
}

export function simulate(args: {
  topics: EngineTopic[];
  l1_codes: EngineL1Code[];
  profile?: StudentProfile;
  sessions?: number;
  seed?: number;
  start?: Date;
  interests?: Interest[];
}): SimResult {
  const profile = args.profile ?? WRITES_BUT_CANNOT_SPEAK;
  const rng = createRng(args.seed ?? 42);
  const start = args.start ?? new Date("2026-12-14T09:00:00Z");
  const topicById = new Map(args.topics.map((t) => [t.id, t]));

  const mastery = new Map<string, MasteryRow>();
  const attempts = new Map<string, TopicAttempt[]>();
  const errors: RecentError[] = [];
  let diagnoses: (ExistingDiagnosis & { candidate: DiagnosisCandidate })[] = [];
  const sessions: SimSession[] = [];
  let speakingGap: number | null = null;

  for (let s = 0; s < (args.sessions ?? 6); s++) {
    const now = new Date(start.getTime() + s * DAY_MS);
    const plan = planSession({
      now,
      rng,
      level_est: "A1",
      interests: args.interests ?? ["football", "gaming"],
      topics: args.topics,
      l1_codes: args.l1_codes,
      mastery: [...mastery.values()],
      activity_stats: [],
      active_diagnoses: diagnoses.filter((d) => d.status === "active"),
      recent_errors: errors,
      school_topic_id: null,
      settings: { tts_enabled: true, general_content_rate: 0.2 },
    });

    const session: SimSession = {
      index: s + 1,
      focus_topic_id: plan.focus_topic_id,
      slots: [],
      total_seconds: plan.total_seconds,
      new_diagnoses: [],
    };
    const touched = new Set<string>();
    plan.slots.forEach((slot, i) => {
      const t = topicById.get(slot.topic_id)!;
      const at = new Date(now.getTime() + (i + 1) * 90_000);
      const correct = rng() < profile[slot.skill];
      const key = `${slot.topic_id}|${slot.skill}`;
      const prev = mastery.get(key) ?? { ...emptyMastery(t), topic_id: t.id, skill: slot.skill };
      const next = applyEvidence(
        prev,
        { topic_id: t.id, skill: slot.skill, mode: slot.mode, score: correct ? 1 : 0, is_correct: correct, hint_used: false, incidental: false },
        at,
      );
      mastery.set(key, { ...next, topic_id: t.id, skill: slot.skill });
      const list = attempts.get(t.id) ?? [];
      list.push({ skill: slot.skill, activity_type: slot.activity_type, is_correct: correct });
      attempts.set(t.id, list);
      if (!correct) errors.push({ topic_id: t.id, skill: slot.skill, l1_code: slot.l1_target ?? "GEN.OTHER", created_at: at });
      touched.add(t.id);
      session.slots.push({ topic_id: t.id, skill: slot.skill, activity_type: slot.activity_type, purpose: slot.purpose, correct });
    });

    // Oturum sonu: dokunulan her konu için teşhis
    for (const topicId of touched) {
      const bySkill: MasteryBySkill = {};
      for (const sk of ["reading", "listening", "writing", "speaking"] as Skill[]) {
        const r = mastery.get(`${topicId}|${sk}`);
        if (r) bySkill[sk] = r;
      }
      const candidate = diagnoseTopic(topicId, bySkill, attempts.get(topicId));
      const result = reconcileDiagnoses({
        topic_id: topicId,
        candidate,
        existing: diagnoses,
        mastery: bySkill,
        attempts: attempts.get(topicId),
      });
      for (const u of result.updates) {
        diagnoses = diagnoses.map((d) => (d.id === u.id ? { ...d, status: u.status } : d));
      }
      if (result.insert) {
        const c = result.insert;
        diagnoses.push({
          id: `d${diagnoses.length + 1}`,
          topic_id: c.topic_id,
          kind: c.kind,
          weak_skill: c.weak_skill,
          weak_activity: c.weak_activity,
          status: "active",
          candidate: c,
        });
        session.new_diagnoses.push(c);
      }
    }
    const hasGap = diagnoses.some(
      (d) => d.status === "active" && d.kind === "skill_gap" && d.weak_skill === "speaking" && d.candidate.confidence >= 0.6,
    );
    if (hasGap && speakingGap === null) speakingGap = s + 1;
    sessions.push(session);
  }

  return {
    sessions,
    speaking_gap_session: speakingGap,
    active: diagnoses.filter((d) => d.status === "active").map((d) => ({
      id: d.id, topic_id: d.topic_id, kind: d.kind, weak_skill: d.weak_skill, weak_activity: d.weak_activity, status: d.status,
    })),
  };
}
