// Motor testleri için fikstürler: gerçek seed (scripts/lib/seed.ts) + küçük yardımcılar.
import { createRng } from "@/lib/engine/random";
import { createContext, defaultTopicB, emptyState, observe, type LearnerState, type ModelTopic } from "@/lib/engine/learner-model";
import type { EngineL1Code, EngineTopic, Mode, PlannerInput, Skill } from "@/lib/engine/types";
import { loadL1Codes, loadTopics } from "@/scripts/lib/seed";

export const TOPICS: EngineTopic[] = loadTopics();
export const L1_CODES: EngineL1Code[] = loadL1Codes();
export const NOW = new Date("2026-12-14T09:00:00Z");
export const DAY = 24 * 60 * 60 * 1000;

export const MODEL_TOPICS: ModelTopic[] = TOPICS.map((t) => ({
  id: t.id,
  b: t.irt_b ?? defaultTopicB(t.level, t.l1_risk),
  l1_risk: t.l1_risk,
  kind: t.kind,
}));
export const CTX = createContext(MODEL_TOPICS);

export const topic = (id: string) => {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`konu yok: ${id}`);
  return t;
};

const modeFor = (skill: Skill): Mode => (skill === "reading" || skill === "listening" ? "recognition" : skill === "speaking" ? "free" : "controlled");

/** Önsel + [konu, beceri, cevaplar] listesinden öğrenme profili. */
export function stateFrom(
  answers: [string, Skill, number[]][] = [],
  prior?: { mu: number; sd: number },
  at: Date = new Date(NOW.getTime() - DAY),
): LearnerState {
  const state = emptyState(CTX, prior);
  let i = 0;
  for (const [topicId, skill, list] of answers) {
    for (const score of list) {
      observe(CTX, state, { topic_id: topicId, skill, mode: modeFor(skill), score, weight: 1, at: new Date(at.getTime() + i++ * 60_000) });
    }
  }
  return state;
}

export function plannerInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    now: NOW,
    rng: createRng(1),
    level_est: "A1",
    interests: ["football", "music"],
    topics: TOPICS,
    l1_codes: L1_CODES,
    model: { ctx: CTX, state: stateFrom() },
    activity_stats: [],
    active_diagnoses: [],
    recent_errors: [],
    school_topic_id: null,
    study_mode: "school",
    goal: null,
    focus_choice: null,
    recent_focus: [],
    session_index: 0,
    settings: { tts_enabled: true, general_content_rate: 0.2 },
    ...overrides,
  };
}
