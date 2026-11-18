// `SessionStore`'un bellek içi sahte uygulaması: tablolar dizi, kurallar veritabanındakiyle aynı
// (öğrenci başına tek `generating`/`ready`, `(item_id, try_no)` tekil).
import type { LlmClient, StructuredCall, StructuredResult } from "@/lib/ai/client";
import type { GradeResult } from "@/lib/ai/schemas";
import type { ExistingDiagnosis, ItemKey, MasteryRow } from "@/lib/engine/types";
import type { SessionDeps } from "@/lib/session/service";
import type {
  AttemptRow,
  DiagnosisRow,
  EvidenceRow,
  ItemRow,
  Learner,
  ModelSettings,
  NewDiagnosis,
  NewErrorEvent,
  PlacementCompletion,
  SessionRow,
  SessionSettings,
  SessionStore,
  StoredLearnerState,
} from "@/lib/session/types";
import { answerAll, FakeStore, ok, USAGE } from "../ai/fixtures";
import { FakeSpeech, FakeTranscriber, FakeTtsStore } from "../media/fakes";
import { L1_CODES, TOPICS } from "../engine/fixtures";

export const USER = "00000000-0000-4000-8000-00000000000a";
export const OTHER = "00000000-0000-4000-8000-00000000000b";
export const T0 = new Date("2026-12-14T09:00:00.000Z");

let seq = 0;
/** Geçerli biçimli, sıralı sahte UUID. */
export const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

interface StoredDiagnosis extends DiagnosisRow {
  user_id: string;
  weak_skill: ExistingDiagnosis["weak_skill"];
  weak_activity: ExistingDiagnosis["weak_activity"];
  confidence: number;
  shown_at: Date | null;
}

export class FakeSessionStore implements SessionStore {
  sessions: (SessionRow & { plan?: unknown; comment?: string | null })[] = [];
  items: (ItemRow & { credited: boolean; created_at: Date })[] = [];
  keys = new Map<string, ItemKey>();
  attempts: (AttemptRow & {
    time_ms: number;
    created_at: Date;
    pred_p?: number | null;
    evidence_weight?: number | null;
    incidental?: { topic_id: string; correct: boolean }[] | null;
  })[] = [];
  errorEvents: NewErrorEvent[] = [];
  mastery = new Map<string, MasteryRow[]>();
  stats = new Map<string, { activity_type: string; taught_n: number; retained_n: number }[]>();
  diagnoses: StoredDiagnosis[] = [];
  events: { user_id: string; name: string; props?: Record<string, unknown> }[] = [];
  learners = new Map<string, Learner & { display_name?: string }>();
  settings: SessionSettings = { tts_enabled: true, general_content_rate: 0.2, review_sample_rate: 0.15 };
  modelSettings: ModelSettings = {
    placement_model: {},
    learner_model: { version: 1 },
    continuous_gate_p: 0.95,
    retest_after_days: 7,
    grade_samples: 3,
    coverage: { a1: 0.98, a2: 0.95 },
  };
  learnerStates = new Map<string, StoredLearnerState>();
  placementResults = new Map<string, PlacementCompletion>();
  programWeeks = new Map<string, string>();
  schoolTopics = new Map<string, string>();
  clock = { now: new Date(T0) };

  constructor() {
    for (const id of [USER, OTHER]) {
      this.learners.set(id, {
        level_est: "A1",
        level_self: "A1",
        interests: ["football", "music"],
        explain_mode: "short",
        onboarding_step: "placement",
        scope_status: "in_scope",
        study_mode: "school",
        goal: null,
        program_id: null,
        focus_choice: null,
        placement_done_at: null,
      });
    }
  }

  async listOpenSessions(userId: string) {
    return this.sessions.filter(
      (s) => s.user_id === userId && s.kind === "daily" && ["generating", "ready", "active"].includes(s.status),
    );
  }
  async getSession(userId: string, id: string) {
    return this.sessions.find((s) => s.id === id && s.user_id === userId) ?? null;
  }
  async transition(...[id, from, to, patch]: Parameters<SessionStore["transition"]>) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s || !from.includes(s.status)) return false;
    s.status = to;
    if (patch?.started_at) s.started_at = patch.started_at;
    if (patch?.finished_at) s.finished_at = patch.finished_at;
    return true;
  }
  async abandonReady(userId: string) {
    for (const s of this.sessions) if (s.user_id === userId && s.status === "ready") s.status = "abandoned";
  }
  async createGenerating(userId: string) {
    if (this.sessions.some((s) => s.user_id === userId && (s.status === "generating" || s.status === "ready"))) {
      return null;
    }
    const id = uuid();
    this.sessions.push({
      id,
      user_id: userId,
      kind: "daily",
      status: "generating",
      focus_topic_id: null,
      created_at: new Date(this.clock.now),
      started_at: null,
      finished_at: null,
      rating: null,
    });
    return id;
  }
  async findPlacement(userId: string) {
    const rows = this.sessions.filter(
      (s) => s.user_id === userId && s.kind === "placement" && !["abandoned", "failed"].includes(s.status),
    );
    return rows[rows.length - 1] ?? null;
  }
  async createPlacement(userId: string) {
    const id = await this.createGenerating(userId);
    if (id) this.sessions.find((s) => s.id === id)!.kind = "placement";
    return id;
  }
  onboarding = new Map<string, string>();
  async completePlacement(userId: string, result: PlacementCompletion, now: Date) {
    if ((this.onboarding.get(userId) ?? "placement") !== "placement") return false;
    this.onboarding.set(userId, "done");
    this.placementResults.set(userId, result);
    this.learners.set(userId, {
      ...this.learners.get(userId)!,
      level_est: result.level_est,
      scope_status: result.scope_status,
      onboarding_step: "done",
      placement_done_at: now,
    });
    return true;
  }
  async countPlacements(userId: string) {
    return this.sessions.filter((s) => s.user_id === userId && s.kind === "placement" && s.status === "done").length;
  }
  async reopenPlacement(userId: string) {
    const l = this.learners.get(userId)!;
    if ((this.onboarding.get(userId) ?? "placement") !== "done" || l.scope_status !== "above_scope") return false;
    this.onboarding.set(userId, "placement");
    this.learners.set(userId, { ...l, scope_status: "in_scope", onboarding_step: "placement" });
    return true;
  }
  async setPlan(id: string, plan: unknown, focus: string | null) {
    const s = this.sessions.find((x) => x.id === id)!;
    s.plan = plan;
    s.focus_topic_id = focus;
  }
  async setRating(id: string, patch: { rating?: number; comment?: string | null }) {
    const s = this.sessions.find((x) => x.id === id)!;
    if (patch.rating !== undefined) s.rating = patch.rating;
    if (patch.comment !== undefined) s.comment = patch.comment;
  }

  async insertItems(...[sessionId, userId, rows]: Parameters<SessionStore["insertItems"]>) {
    for (const { key, ...row } of rows) {
      if (this.items.some((i) => i.session_id === sessionId && i.position === row.position)) {
        throw new Error("items: 23505");
      }
      const id = uuid();
      this.items.push({
        ...row,
        bank_item_id: row.bank_item_id ?? null,
        id,
        session_id: sessionId,
        user_id: userId,
        credited: false,
        created_at: new Date(this.clock.now),
      });
      this.keys.set(id, key);
    }
  }
  async listItems(sessionId: string) {
    return this.items.filter((i) => i.session_id === sessionId);
  }
  async getItem(userId: string, itemId: string) {
    return this.items.find((i) => i.id === itemId && i.user_id === userId) ?? null;
  }
  async getItemKey(itemId: string) {
    return this.keys.get(itemId) ?? null;
  }

  async listAttempts(itemIds: string[]) {
    return this.attempts.filter((a) => itemIds.includes(a.item_id));
  }
  async getAttempt(userId: string, id: string) {
    return this.attempts.find((a) => a.id === id && a.user_id === userId) ?? null;
  }
  async insertAttempt(row: Parameters<SessionStore["insertAttempt"]>[0]) {
    if (this.attempts.some((a) => a.item_id === row.item_id && a.try_no === row.try_no)) return null;
    const id = uuid();
    this.attempts.push({ ...row, id, explain_opened: false, created_at: new Date(this.clock.now) });
    return id;
  }
  async setExplainOpened(id: string, opened: boolean) {
    this.attempts.find((a) => a.id === id)!.explain_opened = opened;
  }
  async insertErrorEvents(rows: NewErrorEvent[]) {
    this.errorEvents.push(...rows);
  }

  async getLearnerState(userId: string) {
    return this.learnerStates.get(userId) ?? null;
  }
  async saveLearnerState(userId: string, row: StoredLearnerState) {
    this.learnerStates.set(userId, structuredClone(row));
  }
  async listEvidence(userId: string): Promise<EvidenceRow[]> {
    // Konuşmanın 1. denemesi oturum bitince (ya da 2. deneme gelince) sayılır: canlı yolla aynı kural.
    const graded = this.attempts.filter((a) => {
      if (a.user_id !== userId || a.score === null) return false;
      const item = this.items.find((i) => i.id === a.item_id)!;
      const session = this.sessions.find((x) => x.id === item.session_id);
      return !(item.activity_type === "speak_answer" && a.try_no === 1 && session?.status !== "done");
    });
    const last = (itemId: string) => Math.max(...graded.filter((g) => g.item_id === itemId).map((g) => g.try_no));
    return graded
      .filter((a) => a.try_no === last(a.item_id))
      .map((a) => {
        const item = this.items.find((i) => i.id === a.item_id)!;
        return {
          topic_id: item.topic_id,
          skill: item.skill,
          mode: item.mode,
          bank_item_id: item.bank_item_id,
          score: a.score!,
          evidence_weight: a.evidence_weight ?? null,
          hint_used: a.hint_used,
          incidental: a.incidental ?? null,
          created_at: a.created_at,
        };
      });
  }
  async upsertMastery(userId: string, rows: MasteryRow[]) {
    const all = this.mastery.get(userId) ?? [];
    for (const r of rows) {
      const at = all.findIndex((m) => m.topic_id === r.topic_id && m.skill === r.skill);
      if (at >= 0) all[at] = r;
      else all.push(r);
    }
    this.mastery.set(userId, all);
  }
  async listFocusCandidates(userId: string, topicId: string) {
    return this.items
      .filter((i) => i.user_id === userId && i.topic_id === topicId && i.purpose === "focus" && !i.credited)
      .map((i) => ({
        item_id: i.id,
        topic_id: i.topic_id,
        activity_type: i.activity_type,
        purpose: i.purpose,
        credited: i.credited,
        created_at: i.created_at,
      }));
  }
  async applyCredit(...[userId, credit]: Parameters<SessionStore["applyCredit"]>) {
    this.items.find((i) => i.id === credit.focus_item_id)!.credited = true;
    const all = this.stats.get(userId) ?? [];
    let row = all.find((s) => s.activity_type === credit.activity_type);
    if (!row) all.push((row = { activity_type: credit.activity_type, taught_n: 0, retained_n: 0 }));
    row.taught_n += credit.taught_inc;
    row.retained_n += credit.retained_inc;
    this.stats.set(userId, all);
  }

  async listActiveDiagnoses(userId: string): Promise<ExistingDiagnosis[]> {
    return this.diagnoses
      .filter((d) => d.user_id === userId && d.status === "active")
      .map((d) => ({ id: d.id, topic_id: d.topic_id, kind: d.kind, weak_skill: d.weak_skill, weak_activity: d.weak_activity, status: "active" }));
  }
  async listTopicAttempts(userId: string, topicIds: string[]) {
    const graded = this.attempts.filter((a) => a.user_id === userId && a.is_correct !== null);
    const last = (itemId: string) => Math.max(...graded.filter((g) => g.item_id === itemId).map((g) => g.try_no));
    return graded
      .filter((a) => a.try_no === last(a.item_id))
      .flatMap((a) => {
        const item = this.items.find((i) => i.id === a.item_id)!;
        return topicIds.includes(item.topic_id)
          ? [{ topic_id: item.topic_id, skill: item.skill, activity_type: item.activity_type, is_correct: a.is_correct! }]
          : [];
      });
  }
  async insertDiagnosis(userId: string, row: NewDiagnosis) {
    const id = uuid();
    this.diagnoses.push({ ...row, id, user_id: userId, status: "active", user_feedback: null, shown_at: null });
    return id;
  }
  async updateDiagnosisStatus(...[id, status]: Parameters<SessionStore["updateDiagnosisStatus"]>) {
    this.diagnoses.find((d) => d.id === id)!.status = status;
  }
  async markDiagnosisShown(id: string, at: Date) {
    this.diagnoses.find((d) => d.id === id)!.shown_at = at;
  }
  async getDiagnosisShownAt(userId: string, at: Date) {
    return this.diagnoses.find((d) => d.user_id === userId && d.shown_at?.getTime() === at.getTime()) ?? null;
  }
  async getDiagnosis(userId: string, id: string) {
    return this.diagnoses.find((d) => d.id === id && d.user_id === userId) ?? null;
  }
  async setDiagnosisFeedback(id: string, feedback: "agree" | "disagree") {
    this.diagnoses.find((d) => d.id === id)!.user_feedback = feedback;
  }

  async getLearner(userId: string) {
    return this.learners.get(userId)!;
  }
  async updateProfile(...[userId, patch]: Parameters<SessionStore["updateProfile"]>) {
    this.learners.set(userId, { ...this.learners.get(userId)!, ...patch });
  }
  async loadTopics() {
    return TOPICS;
  }
  async loadL1Codes() {
    return L1_CODES;
  }
  async listActivityStats(userId: string) {
    return (this.stats.get(userId) ?? []) as Awaited<ReturnType<SessionStore["listActivityStats"]>>;
  }
  async listRecentErrors() {
    return [];
  }
  async getSchoolTopic(userId: string, weekStart: string) {
    return this.schoolTopics.get(`${userId}|${weekStart}`) ?? null;
  }
  async getProgramTopic(programId: string, weekStart: string) {
    return this.programWeeks.get(`${programId}|${weekStart}`) ?? null;
  }
  async listRecentFocus(userId: string, n: number) {
    const done = this.sessions
      .filter((s) => s.user_id === userId && s.kind === "daily" && s.status === "done")
      .sort((a, b) => b.finished_at!.getTime() - a.finished_at!.getTime());
    return { recent: done.slice(0, n).map((s) => s.focus_topic_id), done: done.length };
  }
  async loadModelSettings() {
    return this.modelSettings;
  }
  async loadSessionSettings() {
    return this.settings;
  }
  async explainStats(userId: string, sessions: number) {
    const ids = this.sessions
      .filter((s) => s.user_id === userId && s.status === "done")
      .sort((a, b) => b.finished_at!.getTime() - a.finished_at!.getTime())
      .slice(0, sessions)
      .map((s) => s.id);
    const itemIds = this.items.filter((i) => ids.includes(i.session_id)).map((i) => i.id);
    const wrong = this.attempts.filter((a) => itemIds.includes(a.item_id) && a.is_correct === false);
    return { wrong: wrong.length, opened: wrong.filter((a) => a.explain_opened).length };
  }

  async insertEvent(...[userId, name, props]: Parameters<SessionStore["insertEvent"]>) {
    this.events.push({ user_id: userId, name, props });
  }
  async hintOpened(userId: string, itemId: string) {
    return this.events.some((e) => e.user_id === userId && e.name === "hint_open" && e.props?.item_id === itemId);
  }
}

export const GRADE_OK: GradeResult = {
  is_correct: true,
  score: 1,
  corrected: "He plays football every day.",
  feedback_short_tr: "Harika, -s ekini unutmadın.",
  explanation_long_tr: "Üçüncü tekil şahısta fiile -s eklenir.",
  errors: [],
  evidence: [{ topic_id: "g.present_simple_3sg", correct: true }],
};

export const GRADE_WRONG: GradeResult = {
  is_correct: false,
  score: 0.4,
  corrected: "He plays football every day.",
  feedback_short_tr: "Doğrusu: He plays. Türkçede fiil özneye göre -s almaz.",
  explanation_long_tr: "He, she, it ile geniş zamanda fiile -s eklenir.",
  errors: [{ span: "play", correction: "plays", l1_code: "L1.3SG_S", topic_id: "g.present_simple_3sg" }],
  evidence: [
    { topic_id: "g.present_simple_3sg", correct: false },
    { topic_id: "g.be_present", correct: true },
  ],
};

export type GradeAnswer = GradeResult | "refusal" | Error;

/** Üretim çağrılarına geçerli etkinlik, değerlendirme çağrılarına `grade` yanıtı veren sahte model. */
export class ScriptedLlm implements LlmClient {
  calls: StructuredCall<unknown>[] = [];
  grade: GradeAnswer = GRADE_OK;
  failGeneration = false;
  async callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    this.calls.push(call as StructuredCall<unknown>);
    if (call.schemaName === "grade_result") {
      if (this.grade instanceof Error) throw this.grade;
      if (this.grade === "refusal") return { kind: "refusal", usage: USAGE } as StructuredResult<T>;
      return ok(this.grade) as StructuredResult<T>;
    }
    if (this.failGeneration) return { kind: "refusal", usage: USAGE } as StructuredResult<T>;
    return answerAll()(call as StructuredCall<unknown>) as StructuredResult<T>;
  }
  get generateCalls() {
    return this.calls.filter((c) => c.schemaName !== "grade_result").length;
  }
  get gradeCalls() {
    return this.calls.filter((c) => c.schemaName === "grade_result").length;
  }
}

export function setup() {
  const store = new FakeSessionStore();
  const aiStore = new FakeStore();
  const llm = new ScriptedLlm();
  const tts = new FakeTtsStore();
  const speech = new FakeSpeech();
  const stt = new FakeTranscriber();
  // Günlük sınır gerçek oturum satırlarından sayılır.
  const countStarted = async (userId: string, since: Date) =>
    store.sessions.filter((s) => s.user_id === userId && s.kind === "daily" && s.started_at && s.started_at >= since).length;
  (aiStore as { sessionsStartedSince: typeof countStarted }).sessionsStartedSince = countStarted;
  const deps: SessionDeps = {
    store,
    ai: { store: aiStore, llm, clock: () => 0 },
    now: () => new Date(store.clock.now),
    rng: () => 0.99,
    media: { tts, speech, stt },
  };
  tts.link(aiStore, () => new Date(store.clock.now));
  const advance = (ms: number) => {
    store.clock.now = new Date(store.clock.now.getTime() + ms);
  };
  return { store, aiStore, llm, deps, advance, tts, speech, stt };
}
