// Teşhis motorunun girdi/çıktı türleri (docs/SPEC.md Bölüm 4).
// Veritabanı satırlarına benzer ama onlardan bağımsızdır: Route Handler'lar satırları
// bu türlere çevirir. Zaman alanları `Date`; motor `Date.now()` çağırmaz.
import type { ActivityType, Mode, Purpose, Skill } from "@/lib/content/activity-types";
import type { Interest } from "@/lib/content/interests";

export type { ActivityType, Mode, Purpose, Skill, Interest };

export type Level = "A1" | "A2";

/** `topics` satırının motorun kullandığı kısmı. */
export interface EngineTopic {
  id: string;
  level: Level;
  kind: "grammar" | "pron";
  title_tr: string;
  l1_risk: 0 | 1 | 2;
  prereqs: string[];
  sort: number;
  active: boolean;
}

/** `l1_codes` satırının motorun kullandığı kısmı. */
export interface EngineL1Code {
  code: string;
  topic_id: string | null;
}

/** `mastery` satırındaki değişen alanlar. */
export interface MasteryState {
  score: number;
  n: number;
  correct: number;
  last_seen_at: Date | null;
  next_review_at: Date | null;
}

/** `mastery` satırı (konu × beceri). */
export interface MasteryRow extends MasteryState {
  topic_id: string;
  skill: Skill;
}

/** Ustalık güncellemesi için tek kanıt (4.1). */
export interface Evidence {
  topic_id: string;
  skill: Skill;
  mode: Mode;
  /** 0..1 */
  score: number;
  is_correct: boolean;
  hint_used: boolean;
  /** Hedef dışı yan kanıt (serbest cevaptaki `evidence`); alpha yarıya iner. */
  incidental: boolean;
}

/** Hata etiketi (`error_events`'e yazılacak kısım). */
export interface TaggedError {
  l1_code: string;
  wrong_span: string;
  correction: string;
  source: "distractor" | "llm" | "rule";
  feedback_tr?: string;
}

/** `item_keys.key` (SPEC 5.2 `GeneratedItem.key`). */
export interface ItemKey {
  correct?: string;
  accepted?: string[];
  distractors?: { option: string; code: string; feedback_tr: string }[];
  wrong_patterns?: { answer: string; code: string }[];
  target_words?: string[];
  model_answer_en?: string;
  explanation_short_tr?: string;
  explanation_long_tr?: string;
  hint_tr?: string;
}

export type LocalActivityType = "mcq_read" | "listen_choose" | "gap_fill" | "word_order" | "dictation";

export type LocalResponse =
  | { choice: string }
  | { text: string }
  | { order: string[] };

export interface LocalGradeInput {
  activity_type: LocalActivityType;
  l1_target: string | null;
  key: ItemKey;
  response: LocalResponse;
}

export interface LocalGradeResult {
  is_correct: boolean;
  /** 0..1 */
  score: number;
  /** Doğru cevapta boş. */
  errors: TaggedError[];
}

/** Teşhis için konu üzerindeki tek bir değerlendirilmiş cevap. */
export interface TopicAttempt {
  skill: Skill;
  activity_type: ActivityType;
  is_correct: boolean;
}

export type DiagnosisKind = "skill_gap" | "topic_gap" | "activity_mismatch";

export interface SkillEvidence {
  correct: number;
  n: number;
  score: number;
}

export interface ActivityEvidence {
  skill: Skill;
  correct: number;
  n: number;
}

export interface DiagnosisEvidence {
  skills: Partial<Record<Skill, SkillEvidence>>;
  activities?: Partial<Record<ActivityType, ActivityEvidence>>;
}

/** 4.3 kurallarından çıkan aday (güven eşiği uygulanmadan). */
export interface DiagnosisCandidate {
  topic_id: string;
  kind: DiagnosisKind;
  weak_skill: Skill | null;
  /** `skill_gap`'te güçlü beceri; mesaj şablonu için. */
  strong_skill: Skill | null;
  weak_activity: ActivityType | null;
  strong_activity: ActivityType | null;
  /** 0..1, iki ondalık. */
  confidence: number;
  evidence: DiagnosisEvidence;
}

export type DiagnosisStatus = "active" | "resolved" | "superseded";

/** Veritabanındaki aktif teşhis (`diagnoses`). */
export interface ExistingDiagnosis {
  id: string;
  topic_id: string;
  kind: DiagnosisKind;
  weak_skill: Skill | null;
  weak_activity: ActivityType | null;
  status: DiagnosisStatus;
}

/** Son günlerde yapılan bir hata (`error_events`'in planlayıcının kullandığı kısmı). */
export interface RecentError {
  topic_id: string;
  skill: Skill;
  l1_code: string;
  created_at: Date;
}

export interface ActivityStat {
  activity_type: ActivityType;
  taught_n: number;
  retained_n: number;
}

export interface PlannerSettings {
  tts_enabled: boolean;
  general_content_rate: number;
}

export interface PlannerInput {
  now: Date;
  /** Seçim ve keşif için [0, 1) üreteci; testlerde tohumlu. */
  rng: () => number;
  level_est: Level;
  interests: Interest[];
  topics: EngineTopic[];
  l1_codes: EngineL1Code[];
  mastery: MasteryRow[];
  activity_stats: ActivityStat[];
  active_diagnoses: ExistingDiagnosis[];
  recent_errors: RecentError[];
  /** Bu haftanın okul konusu (`school_topics.topic_id`). */
  school_topic_id: string | null;
  settings: PlannerSettings;
}

export interface PlanSlot {
  position: number;
  topic_id: string;
  skill: Skill;
  activity_type: ActivityType;
  mode: Mode;
  purpose: Purpose;
  l1_target: string | null;
  interest: Interest | null;
  /** `sessions.plan` için gerekçe (hata ayıklama). */
  reason: string;
}

export interface Plan {
  focus_topic_id: string | null;
  slots: PlanSlot[];
  total_seconds: number;
  notes: string[];
}
