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
  Goal,
  ItemKey,
  Level,
  MasteryRow,
  StudyMode,
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
  /** Yerleştirme bankası maddesinin kimliği (`placement_bank.json`); diğer etkinliklerde `null`. */
  bank_item_id: string | null;
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
  bank_item_id?: string | null;
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
  /** Kanıt ağırlığı (ipucu × değerlendirme güveni); `finish`'te işlenen konuşma denemesi için. */
  evidence_weight?: number | null;
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
  /** Cevaptan önce modelin doğru olasılığı tahmini (kalibrasyon ve AUC). */
  pred_p?: number | null;
  /** Kanıt ağırlığı (ipucu, değerlendirme güveni); yeniden kurmada aynı ağırlık kullanılır. */
  evidence_weight?: number | null;
  /** Serbest cevaptaki hedef dışı kanıt. */
  incidental?: { topic_id: string; correct: boolean }[] | null;
}

/** Öğrenme profilini yeniden kurmak için değerlendirilmiş cevap (etkinlik başına son değerlendirilmiş deneme). */
export interface EvidenceRow {
  topic_id: string;
  skill: Skill;
  mode: Mode;
  bank_item_id: string | null;
  score: number;
  evidence_weight: number | null;
  hint_used: boolean;
  incidental: { topic_id: string; correct: boolean }[] | null;
  created_at: Date;
}

export interface StoredLearnerState {
  version: number;
  state: unknown;
  n_obs: number;
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

export type ScopeStatus = "in_scope" | "above_scope" | "graduated";

/** `profiles`'ın oturum akışında kullanılan kısmı. */
export interface Learner {
  level_est: Level;
  /** Seviye beyanı (`A1`, `A2`, `unsure`); yerleştirme ve öğrenme profilinin önseli. */
  level_self?: string | null;
  interests: Interest[];
  explain_mode: ExplainMode;
  onboarding_step?: string;
  scope_status?: ScopeStatus;
  study_mode?: StudyMode | null;
  goal?: Goal | null;
  program_id?: string | null;
  focus_choice?: string | null;
  placement_done_at?: Date | null;
  notify_opt_in_at?: Date | null;
}

export interface ProfilePatch {
  display_name?: string;
  interests?: Interest[];
  explain_mode?: ExplainMode;
  study_mode?: StudyMode;
  goal?: Goal;
  focus_choice?: string | null;
  scope_status?: ScopeStatus;
  notify_opt_in_at?: Date;
}

/** Yerleştirme sonunda profile yazılanlar. */
export interface PlacementCompletion {
  level_est: Level;
  scope_status: ScopeStatus;
  placement_result: unknown;
}

/** v2 ayarları (`app_settings`): ölçme, öğrenme profili, müfredat. */
export interface ModelSettings {
  /** `placement_model`: motor ayarlarının üzerine yazılan alanlar. */
  placement_model: Record<string, unknown>;
  /** `learner_model`: en az `version`. */
  learner_model: Record<string, unknown>;
  /** Sürekli kapı: P(θ ≥ A2|B1) eşiği. */
  continuous_gate_p: number;
  retest_after_days: number;
  grade_samples: number;
  coverage: { a1: number; a2: number };
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
  /** Öğrencinin en son yerleştirme oturumu (`abandoned` / `failed` hariç). */
  findPlacement(userId: string): Promise<SessionRow | null>;
  /** `kind = placement`, `generating` satırı açar; bekleyen oturum varsa `null`. */
  createPlacement(userId: string): Promise<string | null>;
  /** Yalnızca `onboarding_step = 'placement'` iken: seviye, kapsam ve sonuç yazılır, adım `done` olur. */
  completePlacement(userId: string, result: PlacementCompletion, now: Date): Promise<boolean>;
  /** Öğrencinin bitmiş yerleştirme oturumu sayısı (yeniden test hakkı). */
  countPlacements(userId: string): Promise<number>;
  /** Kapsam dışı öğrenci yeniden teste girer: adım `placement`, kapsam `in_scope`. */
  reopenPlacement(userId: string, now: Date): Promise<boolean>;
  /** Yalnızca verilen alanları yazar. */
  setRating(sessionId: string, patch: { rating?: number; comment?: string | null }): Promise<void>;

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

  // --- öğrenme profili, mastery önbelleği ve etkinlik verimi ---
  getLearnerState(userId: string): Promise<StoredLearnerState | null>;
  /** Yerleştirme maddelerinin veriden güncellenmiş parametreleri (`item_calibration`). */
  loadItemCalibration(): Promise<Map<string, { a: number; b: number }>>;
  saveLearnerState(userId: string, row: StoredLearnerState, now: Date): Promise<void>;
  /** Tüm değerlendirilmiş cevaplar, zaman sırasıyla (profilin yeniden kurulması). */
  listEvidence(userId: string): Promise<EvidenceRow[]>;
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
  /** Bu hafta okul sorusu cevaplandı mı (`null` konu = "hatırlamıyorum" da cevaptır). */
  hasSchoolTopicAnswer(userId: string, weekStart: string): Promise<boolean>;
  /** Okul programı haritasındaki haftanın konusu. */
  getProgramTopic(programId: string, weekStart: string): Promise<string | null>;
  /** Son bitmiş günlük oturumların odak konuları (en yeni önce) ve toplam bitmiş günlük oturum sayısı. */
  listRecentFocus(userId: string, n: number): Promise<{ recent: (string | null)[]; done: number }>;
  loadSessionSettings(): Promise<SessionSettings>;
  loadModelSettings(): Promise<ModelSettings>;
  /** Öğrencinin son `sessions` bitmiş oturumundaki yanlış cevaplar ve açılan uzun açıklamalar. */
  explainStats(userId: string, sessions: number): Promise<ExplainStats>;

  // --- olaylar ---
  insertEvent(userId: string, name: EventName, props?: Record<string, unknown>): Promise<void>;
  hintOpened(userId: string, itemId: string): Promise<boolean>;
}
