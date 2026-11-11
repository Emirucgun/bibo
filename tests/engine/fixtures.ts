// Motor testleri için fikstürler: gerçek seed (scripts/lib/seed.ts) + küçük yardımcılar.
import { applyEvidence, emptyMastery } from "@/lib/engine/mastery";
import { createRng } from "@/lib/engine/random";
import type {
  EngineL1Code,
  EngineTopic,
  MasteryRow,
  Mode,
  PlannerInput,
  Skill,
} from "@/lib/engine/types";
import { loadL1Codes, loadTopics } from "@/scripts/lib/seed";

export const TOPICS: EngineTopic[] = loadTopics();
export const L1_CODES: EngineL1Code[] = loadL1Codes();
export const NOW = new Date("2026-12-14T09:00:00Z");
export const DAY = 24 * 60 * 60 * 1000;

export const topic = (id: string) => {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`konu yok: ${id}`);
  return t;
};

/** Bir konu+beceride 0/1 cevap dizisini sırayla işler. */
export function masteryFrom(
  topicId: string,
  skill: Skill,
  answers: number[],
  mode: Mode = skill === "reading" || skill === "listening" ? "recognition" : "controlled",
  at: Date = NOW,
): MasteryRow {
  const t = topic(topicId);
  let state = emptyMastery(t);
  for (const a of answers) {
    state = applyEvidence(
      state,
      { topic_id: topicId, skill, mode, score: a, is_correct: a >= 0.5, hint_used: false, incidental: false },
      at,
    );
  }
  return { ...state, topic_id: topicId, skill };
}

export function plannerInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    now: NOW,
    rng: createRng(1),
    level_est: "A1",
    interests: ["football", "music"],
    topics: TOPICS,
    l1_codes: L1_CODES,
    mastery: [],
    activity_stats: [],
    active_diagnoses: [],
    recent_errors: [],
    school_topic_id: null,
    settings: { tts_enabled: true, general_content_rate: 0.2 },
    ...overrides,
  };
}
