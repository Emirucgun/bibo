// docs/SPEC.md Bölüm 3, "Sabit kümeler" ve "Etkinlik türleri".
// Veritabanındaki check kısıtlarıyla aynı (tests/content/constants.test.ts denetler).

export const SKILLS = ["reading", "listening", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

export const MODES = ["recognition", "controlled", "free"] as const;
export type Mode = (typeof MODES)[number];

export const PURPOSES = [
  "placement",
  "review",
  "focus",
  "retest",
  "stretch",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const ROLES = ["student", "teacher", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIVITY_TYPES = [
  "mcq_read",
  "gap_fill",
  "word_order",
  "listen_choose",
  "dictation",
  "translate_tr_en",
  "short_write",
  "speak_answer",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type Grading = "local" | "llm" | "llm_audio";

export interface ActivityTypeInfo {
  skill: Skill;
  mode: Mode;
  grading: Grading;
  est_seconds: number;
}

export const ACTIVITY_TYPE_INFO: Record<ActivityType, ActivityTypeInfo> = {
  mcq_read: { skill: "reading", mode: "recognition", grading: "local", est_seconds: 100 },
  gap_fill: { skill: "writing", mode: "controlled", grading: "local", est_seconds: 60 },
  word_order: { skill: "writing", mode: "controlled", grading: "local", est_seconds: 60 },
  listen_choose: { skill: "listening", mode: "recognition", grading: "local", est_seconds: 75 },
  dictation: { skill: "listening", mode: "controlled", grading: "local", est_seconds: 90 },
  translate_tr_en: { skill: "writing", mode: "free", grading: "llm", est_seconds: 110 },
  short_write: { skill: "writing", mode: "free", grading: "llm", est_seconds: 180 },
  speak_answer: { skill: "speaking", mode: "free", grading: "llm_audio", est_seconds: 120 },
};

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
