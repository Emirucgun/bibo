// Oturum akışının satır türleri ve veritabanı arayüzü (docs/SPEC.md Bölüm 3, 6).
// Servis (`service.ts`) yalnızca bu arayüze bağlıdır; testler bellek içi sahte uygulama kullanır.
import type { ActivityType, Mode, Purpose, Skill } from "@/lib/content/activity-types";
import type { Credit, FocusCandidate } from "@/lib/engine/effectiveness";
import type {
  ActivityStat,
  DiagnosisKind,
  DiagnosisStatus,
  EngineL1Code,
  EngineTopic,
  ExistingDiagnosis,
  Interest,
  ItemKey,
  Level,
  MasteryRow,
  RecentError,
  TopicAttempt,
} from "@/lib/engine/types";
import type { ExplainMode, ExplainStats } from "./explain-mode";
import type { EventName } from "./schemas";

export type SessionStatus = "generating" | "ready" | "active" | "done" | "abandoned" | "failed";

export interface SessionRow {
  id: string;
  user_id: string;
  kind: "placement" | "daily";
  status: SessionStatus;
  focus_topic_id: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  rating: number | null;
}

/** `items.payload` (SPEC 5.2). Cevap anahtarı içermez. */
export interface ItemPayload {
  instruction_tr: string;
  text_en?: string;
  question_en?: string;
  options?: string[];
  tokens?: string[];
  source_tr?: string;
  prompt_en?: string;
}

/** İstemciye giden etkinlik: `item_keys` ve `l1_target` yok. */
export interface ItemPublic {
  id: string;
  session_id: string;
  position: number;
  topic_id: string;
  activity_type: ActivityType;
  skill: Skill;
  mode: Mode;
  purpose: Purpose;
  interest: string | null;
  payload: ItemPayload;
}

export interface ItemRow extends ItemPublic {
  user_id: string;
  l1_target: string | null;
}

export interface NewItem {
  position: number;
  topic_id: string;
  activity_type: ActivityType;
  skill: Skill;
  mode: Mode;
  purpose: Purpose;
  interest: Interest | null;
  l1_target: string | null;
  payload: ItemPayload;
  key: ItemKey;
}

/** İstemciye giden cevap. */
export interface AttemptPublic {
  id: string;
  item_id: string;
  try_no: number;
  response: unknown;
  is_correct: boolean | null;
  score: number | null;
  hint_used: boolean;
  explain_opened: boolean;
  feedback_short_tr: string | null;
  correction: string | null;
}

export interface AttemptRow extends AttemptPublic {
  user_id: string;
  graded_by: "local" | "llm" | null;
  explanation_long_tr: string | null;
}

export interface NewAttempt {
  item_id: string;
  user_id: string;
  try_no: number;
  response: unknown;
  is_correct: boolean | null;
  score: number | null;
  time_ms: number;
  hint_used: boolean;
  graded_by: "local" | "llm";
  feedback_short_tr: string | null;
  explanation_long_tr: string | null;
  correction: string | null;
}

export interface NewErrorEvent {
  attempt_id: string;
  user_id: string;
  topic_id: string | null;
  skill: Skill;
  activity_type: ActivityType;
  mode: Mode;
  l1_code: string;
  wrong_span: string | null;
  correction: string | null;
  source: "distractor" | "llm" | "rule";
  review_sampled: boolean;
}

export interface NewDiagnosis {
  topic_id: string;
  kind: DiagnosisKind;
  weak_skill: Skill | null;
  weak_activity: ActivityType | null;
  confidence: number;
  evidence: unknown;
  message_tr: string;
}

export interface DiagnosisRow {
  id: string;
  topic_id: string;
  kind: DiagnosisKind;
  status: DiagnosisStatus;
  message_tr: string;
  evidence: unknown;
  user_feedback: "agree" | "disagree" | null;
}

/** `profiles`'ın oturum akışında kullanılan kısmı. */
export interface Learner {
  level_est: Level;
  interests: Interest[];
  explain_mode: ExplainMode;
}

export interface ProfilePatch {
  display_name?: string;
  interests?: Interest[];
  explain_mode?: ExplainMode;
}

/** `app_settings`'in oturum akışında kullanılan kısmı (guard ayarları `AiStore`'da). */
export interface SessionSettings {
  tts_enabled: boolean;
  general_content_rate: number;
  review_sample_rate: number;
}

export interface SessionStore {
  // --- sessions ---
  /** Öğrencinin `generating` / `ready` / `active` günlük oturumları. */
  listOpenSessions(userId: string): Promise<SessionRow[]>;
  getSession(userId: string, sessionId: string): Promise<SessionRow | null>;
  /** Koşullu durum geçişi; satır `from` durumlarından birindeyse yazar ve `true` döner. */
  transition(
    sessionId: string,
    from: SessionStatus[],
    to: SessionStatus,
    patch?: { started_at?: Date; finished_at?: Date },
  ): Promise<boolean>;
  /** Öğrencinin `ready` oturumlarını `abandoned` yapar (yeni oturum hazırlanırken). */
  abandonReady(userId: string): Promise<void>;
  /** `generating` satırı açar; öğrencinin zaten `generating`/`ready` oturumu varsa `null`. */
  createGenerating(userId: string): Promise<string | null>;
  setPlan(sessionId: string, plan: unknown, focusTopicId: string | null): Promise<void>;
  setRating(sessionId: string, rating: number | null, comment: string | null): Promise<void>;

  // --- items ---
  insertItems(sessionId: string, userId: string, rows: NewItem[]): Promise<void>;
  listItems(sessionId: string): Promise<ItemRow[]>;
  getItem(userId: string, itemId: string): Promise<ItemRow | null>;
  /** Yalnızca servis istemcisiyle okunur; yanıta yazılmaz. */
  getItemKey(itemId: string): Promise<ItemKey | null>;

  // --- attempts ---
  listAttempts(itemIds: string[]): Promise<AttemptRow[]>;
  getAttempt(userId: string, attemptId: string): Promise<AttemptRow | null>;
  /** `(item_id, try_no)` zaten varsa `null`. */
  insertAttempt(row: NewAttempt): Promise<string | null>;
  setExplainOpened(attemptId: string, opened: boolean): Promise<void>;
  insertErrorEvents(rows: NewErrorEvent[]): Promise<void>;

  // --- mastery ve etkinlik verimi ---
  listMastery(userId: string, topicIds?: string[]): Promise<MasteryRow[]>;
  upsertMastery(userId: string, rows: MasteryRow[], now: Date): Promise<void>;
  listFocusCandidates(userId: string, topicId: string): Promise<FocusCandidate[]>;
  applyCredit(userId: string, credit: Credit, now: Date): Promise<void>;

  // --- teşhis ---
  listActiveDiagnoses(userId: string): Promise<ExistingDiagnosis[]>;
  /** Öğrencinin bu konulardaki tüm değerlendirilmiş cevapları. */
  listTopicAttempts(userId: string, topicIds: string[]): Promise<(TopicAttempt & { topic_id: string })[]>;
  insertDiagnosis(userId: string, row: NewDiagnosis): Promise<string>;
  updateDiagnosisStatus(id: string, status: DiagnosisStatus): Promise<void>;
  markDiagnosisShown(id: string, at: Date): Promise<void>;
  /** Bu anda gösterilmiş teşhis (bitmiş oturumun özeti yeniden açıldığında). */
  getDiagnosisShownAt(userId: string, at: Date): Promise<DiagnosisRow | null>;
  getDiagnosis(userId: string, id: string): Promise<DiagnosisRow | null>;
  setDiagnosisFeedback(id: string, feedback: "agree" | "disagree"): Promise<void>;

  // --- profil ve planlayıcı girdileri ---
  getLearner(userId: string): Promise<Learner>;
  updateProfile(userId: string, patch: ProfilePatch, now: Date): Promise<void>;
  loadTopics(): Promise<EngineTopic[]>;
  loadL1Codes(): Promise<EngineL1Code[]>;
  listActivityStats(userId: string): Promise<ActivityStat[]>;
  listRecentErrors(userId: string, since: Date): Promise<RecentError[]>;
  /** `weekStart`: pazartesi, `YYYY-MM-DD`. */
  getSchoolTopic(userId: string, weekStart: string): Promise<string | null>;
  loadSessionSettings(): Promise<SessionSettings>;
  /** Öğrencinin son `sessions` bitmiş oturumundaki yanlış cevaplar ve açılan uzun açıklamalar. */
  explainStats(userId: string, sessions: number): Promise<ExplainStats>;

  // --- olaylar ---
  insertEvent(userId: string, name: EventName, props?: Record<string, unknown>): Promise<void>;
  hintOpened(userId: string, itemId: string): Promise<boolean>;
}
