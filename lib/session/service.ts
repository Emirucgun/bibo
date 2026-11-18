// Oturum akışının kararları (docs/SPEC.md Bölüm 2 "Temel veri akışı", 4, 5.4, 6).
// Veritabanı `SessionStore`, yapay zekâ katmanı `AiDeps` ile enjekte edilir; Route Handler'lar
// yalnızca kimlik doğrular ve bu fonksiyonları çağırır. `item_keys` içeriği hiçbir dönüş
// değerine yazılmaz: yalnızca kısa geri bildirim, doğru biçim, ipucu ve açıklama metinleri çıkar.
import type { z } from "zod";
import { generateSession } from "@/lib/ai/generate-session";
import { gradeFreeAnswer, GRADE_UNAVAILABLE_TR } from "@/lib/ai/grade";
import { assertGuard, GuardError, istanbulDayStart, type AiDeps } from "@/lib/ai/guard";
import { isAcceptedWav, MAX_AUDIO_BYTES, parseWav } from "@/lib/audio/wav";
import { transcribe, type Transcriber } from "@/lib/stt";
import { ensureTtsVoice, getAudioUrl, TtsUnavailableError, ttsAvailable, type TtsStore } from "@/lib/tts/cache";
import type { SpeechClient } from "@/lib/tts/speechify";
import { ApiError } from "@/lib/api/errors";
import { GAP_MARK } from "@/lib/ai/checks";
import { ACTIVITY_TYPE_INFO, SKILL_LABELS_TR } from "@/lib/content/activity-types";
import { L1_CODES } from "@/lib/content/taxonomy";
import { defaultPath, focusChoices, openTopics, schoolSuggestions, solidShare, type CurriculumInput } from "@/lib/engine/curriculum";
import { diagnoseTopic, diagnosisMessage, reconcileDiagnoses } from "@/lib/engine/diagnosis";
import { creditRetest } from "@/lib/engine/effectiveness";
import { gradeLocal } from "@/lib/engine/grade-local";
import { pGlobalAbove, predict, type LearnerModelConfig, type LearnerState, type ModelContext } from "@/lib/engine/learner-model";
import { answersMatch, sameIgnoringCaseAndPunctuation } from "@/lib/engine/normalize";
import type { PlacementLevel } from "@/lib/engine/placement-cat";
import { planSession, RECENT_ERROR_DAYS } from "@/lib/engine/planner";
import { createRng, seedFromString } from "@/lib/engine/random";
import type {
  DiagnosisEvidence,
  EngineTopic,
  ExistingDiagnosis,
  ItemKey,
  LocalActivityType,
  LocalResponse,
  SkillEvidence,
} from "@/lib/engine/types";
import { EXPLAIN_MODE_SESSIONS, nextExplainMode, type ExplainMode } from "./explain-mode";
import {
  applyEvidence,
  evidenceWeight,
  masteryCache,
  modelContextFor,
  rebuildState,
  restoreState,
  serialize,
  type AttemptEvidence,
} from "./learner";
import { bankIrt, nextPlacement, placementCards, placementConfig, placementOutcome, type PlacementCards } from "./placement";
import { splitGeneratedItems, SPOKEN_TEXT_TYPES } from "./save-items";
import {
  AttemptInput,
  DiagnosisFeedbackInput,
  EventInput,
  FinishInput,
  FocusChoiceInput,
  WaitlistInput,
  ProfilePatchInput,
  SpeechMeta,
  Uuid,
  type AttemptResponse,
} from "./schemas";
import type {
  AttemptPublic,
  AttemptRow,
  DiagnosisRow,
  ItemPublic,
  EvidenceRow,
  ItemRow,
  Learner,
  NewErrorEvent,
  SessionRow,
  SessionStatus,
  SessionStore,
} from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Yarıda bırakılan oturum bu süre içinde kaldığı yerden devam eder (PRD F3). */
export const RESUME_WINDOW_MS = DAY_MS;
/** `finish` / `next` en çok 300 sn çalışır; bundan eski `generating` satırı ölü sayılır. */
export const GENERATING_STALE_MS = 6 * 60_000;

export interface SessionDeps {
  store: SessionStore;
  ai: AiDeps;
  /** Zaman dışarıdan gelir; arka plan işi kendi anını ister. */
  now: () => Date;
  /** [0, 1); inceleme örneklemi için. */
  rng: () => number;
  /** Seslendirme (M7) ve transkript (M8). Guard ve `llm_usage` `ai.store` üzerinden. */
  media: MediaDeps;
}

export interface MediaDeps {
  tts: TtsStore;
  speech: SpeechClient;
  stt: Transcriber;
}

export interface Actor {
  userId: string;
}

/**
 * Yeni oturumda dinleme planlanabilir mi? Ses boşsa önce varsayılan ses atanır (karar 37);
 * ses listesi alınamazsa dinleme eskisi gibi metne düşer, oturum kırılmaz.
 */
async function listeningAvailable(media: MediaDeps, now: Date): Promise<boolean> {
  await ensureTtsVoice({ store: media.tts, speech: media.speech }, now).catch((err: unknown) => {
    console.error("[session/tts_voice]", err instanceof Error ? err.message.slice(0, 60) : "unknown");
  });
  return ttsAvailable(media.tts, now);
}

/** Yanıt döndükten sonra `after()` ile çalıştırılacak iş. */
export type Background = () => Promise<void>;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError("invalid_input");
  return result.data;
}

function parseId(id: string): string {
  if (!Uuid.safeParse(id).success) throw new ApiError("not_found");
  return id;
}

function guardToApi(err: unknown): never {
  if (err instanceof GuardError) {
    throw new ApiError(err.code === "daily_limit" ? "daily_limit" : "ai_unavailable");
  }
  throw err;
}

const istanbulWeekStart = (now: Date): string => {
  const day = istanbulDayStart(now);
  // İstanbul gününün yerel tarihi: UTC+3 kaydırılmış anın UTC alanları.
  const local = new Date(day.getTime() + 3 * HOUR_MS);
  const dow = (local.getUTCDay() + 6) % 7; // pazartesi = 0
  return new Date(local.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Öğrenme profili (docs/SPEC.md 4.1)
// ---------------------------------------------------------------------------

export interface LoadedModel {
  ctx: ModelContext;
  state: LearnerState;
  n_obs: number;
  /** Saklanan durum kullanılamadı, `attempts`'ten yeniden kuruldu (kaydedilmiş kanıtlar zaten içinde). */
  rebuilt: boolean;
  topics: EngineTopic[];
  /** Yerleştirme maddelerinin kalibre parametreleri (yerleştirme cevaplarının kanıtı için). */
  calibration: Map<string, { a: number; b: number }>;
}

const toAttemptEvidence = (r: EvidenceRow, calibration: Map<string, { a: number; b: number }>): AttemptEvidence => ({
  topic_id: r.topic_id,
  skill: r.skill,
  mode: r.mode,
  score: r.score,
  evidence_weight: r.evidence_weight,
  hint_used: r.hint_used,
  incidental: r.incidental,
  irt: bankIrt(r.bank_item_id, calibration),
  at: r.created_at,
});

/**
 * Öğrenme profili: `learner_state` önbelleği; yoksa ya da konu listesi / model sürümü değiştiyse
 * `attempts`'ten olay kaynaklı yeniden kurulur. Yeniden kurma canlı yolla aynı kuralı izler: etkinlik
 * başına son değerlendirilmiş deneme; konuşmanın 1. denemesi yalnızca oturumu bitmişse.
 */
export async function loadLearnerModel(store: SessionStore, userId: string, levelSelf: string | null | undefined): Promise<LoadedModel> {
  const [topics, settings, stored, calibration] = await Promise.all([
    store.loadTopics(),
    store.loadModelSettings(),
    store.getLearnerState(userId),
    store.loadItemCalibration(),
  ]);
  const ctx = modelContextFor(topics, settings.learner_model as Partial<LearnerModelConfig>);
  const restored = stored ? restoreState(ctx, stored.state) : null;
  if (restored) return { ctx, state: restored, n_obs: stored!.n_obs, rebuilt: false, topics, calibration };
  const evidence = await store.listEvidence(userId);
  return {
    ctx,
    state: rebuildState(ctx, evidence.map((e) => toAttemptEvidence(e, calibration)), levelSelf),
    n_obs: evidence.length,
    rebuilt: true,
    topics,
    calibration,
  };
}

/**
 * Kanıtları profile işler, `learner_state`'i ve `mastery` önbelleğini yazar. `alreadyIn`: kanıt
 * yeniden kurulmuş durumun içinde zaten var; yalnızca durum ve önbellek yazılır.
 */
async function updateLearner(
  store: SessionStore,
  userId: string,
  model: LoadedModel,
  evidence: AttemptEvidence[],
  now: Date,
  alreadyIn = false,
): Promise<void> {
  const cells = alreadyIn
    ? evidence.map((e) => ({ topic_id: e.topic_id, skill: e.skill }))
    : applyEvidence(model.ctx, model.state, evidence);
  if (!alreadyIn) model.n_obs += evidence.length;
  await Promise.all([
    store.saveLearnerState(userId, { version: model.ctx.config.version, state: serialize(model.state), n_obs: model.n_obs }, now),
    store.upsertMastery(userId, masteryCache(model.ctx, model.state, cells, now), now),
  ]);
}

function attemptEvidence(
  model: LoadedModel,
  item: ItemRow,
  graded: { score: number; incidental: { topic_id: string; correct: boolean }[] },
  hintUsed: boolean,
  at: Date,
  weight: number,
): AttemptEvidence {
  return {
    topic_id: item.topic_id,
    skill: item.skill,
    mode: item.mode,
    score: graded.score,
    evidence_weight: weight,
    hint_used: hintUsed,
    incidental: graded.incidental.length > 0 ? graded.incidental : null,
    irt: bankIrt(item.bank_item_id, model.calibration),
    at,
  };
}

/** Cevaptan önce modelin doğru olasılığı (`attempts.pred_p`; kalibrasyon ve AUC için). */
function predictFor(model: LoadedModel, item: ItemRow): number | null {
  const p = predict(model.ctx, model.state, {
    topic_id: item.topic_id,
    skill: item.skill,
    mode: item.mode,
    ...(bankIrt(item.bank_item_id, model.calibration) ? { irt: bankIrt(item.bank_item_id, model.calibration)! } : {}),
  });
  return p === null ? null : Math.round(p * 10_000) / 10_000;
}

function curriculumInput(model: LoadedModel, learner: Learner, schoolTopicId: string | null, recentFocus: (string | null)[]): CurriculumInput {
  return {
    ctx: model.ctx,
    state: model.state,
    topics: model.topics,
    level_est: learner.level_est,
    study_mode: learner.study_mode ?? "school",
    goal: learner.goal ?? null,
    school_topic_id: schoolTopicId,
    focus_choice: learner.focus_choice ?? null,
    recent_focus: recentFocus,
  };
}

/** Bu haftanın okul konusu: öğrencinin cevabı, yoksa okul programı haritası. "Kendi programım"da yok. */
async function schoolTopicFor(store: SessionStore, userId: string, learner: Learner, now: Date): Promise<string | null> {
  if (learner.study_mode === "self") return null;
  const week = istanbulWeekStart(now);
  const own = await store.getSchoolTopic(userId, week);
  if (own) return own;
  return learner.program_id ? store.getProgramTopic(learner.program_id, week) : null;
}

/** Son oturum odakları (tempo kuralı) ve bitmiş oturum sayısı (dönüşümlü slotlar). */
const RECENT_FOCUS_SESSIONS = 5;

// ---------------------------------------------------------------------------
// Oturum hazırlama
// ---------------------------------------------------------------------------

/**
 * `generating` oturumu planlar, üretir, `items` / `item_keys`'e yazar ve `ready` yapar.
 * Hata olursa oturum `failed` olur; hata fırlatılmaz (arka planda çalışır). Günlük sınır
 * burada denetlenmez (SPEC 5.4 madde 3): acil durdurma ve aylık tavan her çağrıda denetlenir.
 */
export async function prepareSession(deps: SessionDeps, userId: string, sessionId: string): Promise<SessionStatus> {
  const { store } = deps;
  try {
    const now = deps.now();
    const learner = await store.getLearner(userId);
    const [model, l1_codes, activity_stats, active_diagnoses, recent_errors, school_topic_id, focus, settings] =
      await Promise.all([
        loadLearnerModel(store, userId, learner.level_self),
        store.loadL1Codes(),
        store.listActivityStats(userId),
        store.listActiveDiagnoses(userId),
        store.listRecentErrors(userId, new Date(now.getTime() - RECENT_ERROR_DAYS * DAY_MS)),
        schoolTopicFor(store, userId, learner, now),
        store.listRecentFocus(userId, RECENT_FOCUS_SESSIONS),
        store.loadSessionSettings(),
      ]);
    const modelSettings = await store.loadModelSettings();

    const plan = planSession({
      now,
      rng: createRng(seedFromString(sessionId)),
      level_est: learner.level_est,
      interests: learner.interests,
      topics: model.topics,
      l1_codes,
      model: { ctx: model.ctx, state: model.state },
      activity_stats,
      active_diagnoses,
      recent_errors,
      school_topic_id,
      study_mode: learner.study_mode ?? "school",
      goal: learner.goal ?? null,
      focus_choice: learner.focus_choice ?? null,
      recent_focus: focus.recent,
      session_index: focus.done,
      settings: {
        // Kapalı, ses seçilmemiş ya da son 24 saatte 402/429: dinleme metne düşer (SPEC 4.4 adım 8, 5.4).
        tts_enabled: settings.tts_enabled && (await listeningAvailable(deps.media, now)),
        general_content_rate: settings.general_content_rate,
      },
    });
    const slots = plan.slots;
    await store.setPlan(sessionId, plan, plan.focus_topic_id);

    const outcome = await generateSession(
      deps.ai,
      { userId, sessionId, now, prefetch: true },
      { level: learner.level_est, explainMode: learner.explain_mode, varietySeed: sessionId, slots, coverage: modelSettings.coverage },
    );
    await store.insertItems(
      sessionId,
      userId,
      splitGeneratedItems(outcome.items, slots, createRng(seedFromString(`${sessionId}:options`))),
    );
    const ok = await store.transition(sessionId, ["generating"], "ready");
    return ok ? "ready" : "failed";
  } catch (err) {
    // Günlüğe yalnızca hata adı ve kısa kod; içerik yok.
    console.error("[session/prepare]", err instanceof Error ? `${err.name}: ${err.message.slice(0, 120)}` : "unknown");
    await store.transition(sessionId, ["generating"], "failed").catch(() => false);
    return "failed";
  }
}

/**
 * POST /api/sessions/next → `{ sessionId, status }`. Açık oturum (`active`, `ready`,
 * `generating`) varsa onu döner; yoksa guard'dan geçerse `generating` satırı açar ve üretimi
 * `background` olarak verir.
 */
export async function nextSession(
  deps: SessionDeps,
  actor: Actor,
): Promise<{ sessionId: string; status: SessionStatus; background?: Background }> {
  const { store } = deps;
  const now = deps.now();
  const open = await store.listOpenSessions(actor.userId);
  const usable: SessionRow[] = [];
  for (const s of open) {
    if (s.status === "active" && s.started_at && now.getTime() - s.started_at.getTime() > RESUME_WINDOW_MS) {
      await store.transition(s.id, ["active"], "abandoned");
    } else if (s.status === "generating" && now.getTime() - s.created_at.getTime() > GENERATING_STALE_MS) {
      await store.transition(s.id, ["generating"], "failed");
    } else usable.push(s);
  }
  for (const status of ["active", "ready", "generating"] as const) {
    const found = usable.find((s) => s.status === status);
    if (found) return { sessionId: found.id, status };
  }

  // Öğrencinin istediği üretim: acil durdurma, aylık tavan ve günlük sınır (SPEC 5.4).
  try {
    await assertGuard(deps.ai.store, { purpose: "generate", userId: actor.userId, sessionId: null, now });
  } catch (err) {
    if (err instanceof GuardError && err.code === "daily_limit") {
      await store.insertEvent(actor.userId, "limit_hit");
    }
    guardToApi(err);
  }

  const sessionId = await store.createGenerating(actor.userId);
  if (!sessionId) {
    // Yarış: aynı anda başka bir istek açtı.
    const again = (await store.listOpenSessions(actor.userId)).find((s) => s.status !== "active");
    if (!again) throw new ApiError("server_error");
    return { sessionId: again.id, status: again.status };
  }
  return {
    sessionId,
    status: "generating",
    background: async () => {
      await prepareSession(deps, actor.userId, sessionId);
    },
  };
}

/** `finish` sonrası ön üretim: eski `ready` oturum `abandoned`, yenisi hazırlanır. */
export async function prefetchNext(deps: SessionDeps, userId: string): Promise<void> {
  let sessionId: string | null;
  try {
    await deps.store.abandonReady(userId);
    sessionId = await deps.store.createGenerating(userId);
  } catch (err) {
    // `after()` içinde yakalanmamış hata kalmasın; sonraki `POST /api/sessions/next` yeniden dener.
    console.error("[session/prefetch]", err instanceof Error ? `${err.name}: ${err.message.slice(0, 120)}` : "unknown");
    return;
  }
  if (!sessionId) return; // zaten hazırlanıyor
  await prepareSession(deps, userId, sessionId);
}

/**
 * POST /api/placement → `{ sessionId }`. Uyarlamalı yerleştirme oturumu açar ve ilk maddeyi ekler
 * (dil modeli yok); sonraki maddeler her cevaptan sonra eklenir (`advancePlacement`). Öğrencinin
 * açık ya da bitmiş yerleştirme oturumu varsa onu döner (çift dokunuş, sayfa yenileme); yeniden
 * teste açılmış öğrencide (`reopenPlacement`) bitmiş oturum yerine yenisi açılır.
 */
export async function startPlacement(deps: SessionDeps, actor: Actor): Promise<{ sessionId: string }> {
  const { store } = deps;
  const [existing, learner] = await Promise.all([store.findPlacement(actor.userId), store.getLearner(actor.userId)]);
  const retest = existing?.status === "done" && learner.onboarding_step === "placement";
  if (existing && existing.status !== "generating" && !retest) return { sessionId: existing.id };
  if (existing && existing.status === "generating") {
    // Yarıda kalmış kayıt (yazma sırasında hata): kapatılır, yenisi açılır.
    await store.transition(existing.id, ["generating"], "failed");
  }
  const sessionId = await store.createPlacement(actor.userId);
  if (!sessionId) {
    const again = await store.findPlacement(actor.userId);
    if (!again) throw new ApiError("server_error");
    return { sessionId: again.id };
  }
  try {
    const [tts, settings, calibration] = await Promise.all([
      listeningAvailable(deps.media, deps.now()).catch(() => false),
      store.loadModelSettings(),
      store.loadItemCalibration(),
    ]);
    const next = nextPlacement({
      sessionId,
      items: [],
      attempts: [],
      levelSelf: learner.level_self,
      ttsAvailable: tts,
      config: placementConfig(settings.placement_model),
      calibration,
    });
    if (next.kind !== "item") throw new Error("placement: empty bank");
    await store.insertItems(sessionId, actor.userId, [next.row]);
  } catch (err) {
    await store.transition(sessionId, ["generating"], "failed").catch(() => false);
    throw err;
  }
  await store.transition(sessionId, ["generating"], "ready");
  return { sessionId };
}

/** Yerleştirmede cevaptan sonra: sıradaki madde eklendi (`item`) ya da test bitti (`done`). */
export type PlacementProgress = "item" | "done";

/**
 * Yerleştirme oturumuna sıradaki maddeyi ekler. Cevapsız madde varsa bir şey yapmaz. Aynı konuma
 * ikinci ekleme (yarış) benzersizlik kısıtına takılır; ilk yazılan geçerlidir.
 */
async function advancePlacement(deps: SessionDeps, userId: string, sessionId: string): Promise<PlacementProgress> {
  const { store } = deps;
  const items = await store.listItems(sessionId);
  const [attempts, learner, settings, tts, calibration] = await Promise.all([
    store.listAttempts(items.map((i) => i.id)),
    store.getLearner(userId),
    store.loadModelSettings(),
    listeningAvailable(deps.media, deps.now()).catch(() => false),
    store.loadItemCalibration(),
  ]);
  const next = nextPlacement({
    sessionId,
    items,
    attempts,
    levelSelf: learner.level_self,
    ttsAvailable: tts,
    config: placementConfig(settings.placement_model),
    calibration,
  });
  if (next.kind === "complete") return "done";
  if (next.kind === "wait") return "item";
  try {
    await store.insertItems(sessionId, userId, [next.row]);
  } catch (err) {
    // Aynı anda gelen ikinci istek aynı konumu eklemiş olabilir: madde varsa sorun yok.
    const again = await store.listItems(sessionId);
    if (!again.some((i) => i.position === next.row.position)) throw err;
  }
  return "item";
}

/**
 * POST /api/items/:id/skip → `{ placement }`. Yalnızca yerleştirmede, sesi çalınamayan dinleme
 * maddesi: değerlendirilmemiş deneme yazılır (profil güncellenmez), testin geri kalanında dinleme
 * sorulmaz ve sıradaki madde eklenir.
 */
export async function skipPlacementItem(deps: SessionDeps, actor: Actor, itemId: string): Promise<{ placement: PlacementProgress }> {
  const { store } = deps;
  const item = await activeItem(store, actor.userId, itemId);
  const session = await store.getSession(actor.userId, item.session_id);
  if (session?.kind !== "placement" || item.skill !== "listening") throw new ApiError("invalid_input");
  const attempts = await store.listAttempts([item.id]);
  if (!attempts.some((a) => a.try_no === 1)) {
    await store.insertAttempt({
      item_id: item.id,
      user_id: actor.userId,
      try_no: 1,
      response: { skipped: true },
      is_correct: null,
      score: null,
      time_ms: 0,
      hint_used: false,
      graded_by: "local",
      feedback_short_tr: null,
      explanation_long_tr: null,
      correction: null,
    });
  }
  return { placement: await advancePlacement(deps, actor.userId, item.session_id) };
}

// ---------------------------------------------------------------------------
// Görüntüleme ve başlatma
// ---------------------------------------------------------------------------

export interface SessionView {
  session: {
    id: string;
    status: SessionStatus;
    kind: SessionRow["kind"];
    focusTopicId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    estSeconds: number;
  };
  items: ItemPublic[];
  attempts: AttemptPublic[];
}

export function toItemPublic(row: ItemRow): ItemPublic {
  return {
    id: row.id,
    session_id: row.session_id,
    position: row.position,
    topic_id: row.topic_id,
    activity_type: row.activity_type,
    skill: row.skill,
    mode: row.mode,
    purpose: row.purpose,
    interest: row.interest,
    payload: row.payload,
  };
}

export function toAttemptPublic(row: AttemptRow): AttemptPublic {
  return {
    id: row.id,
    item_id: row.item_id,
    try_no: row.try_no,
    response: row.response,
    is_correct: row.is_correct,
    score: row.score,
    hint_used: row.hint_used,
    explain_opened: row.explain_opened,
    feedback_short_tr: row.feedback_short_tr,
    correction: row.correction,
  };
}

async function ownSession(store: SessionStore, userId: string, id: string): Promise<SessionRow> {
  const session = await store.getSession(userId, parseId(id));
  if (!session) throw new ApiError("not_found");
  return session;
}

/** GET /api/sessions/:id → `{ session, items (anahtarsız), attempts }`. */
export async function getSessionView(store: SessionStore, actor: Actor, id: string): Promise<SessionView> {
  const session = await ownSession(store, actor.userId, id);
  const visible = session.status === "ready" || session.status === "active" || session.status === "done";
  const items = visible ? (await store.listItems(session.id)).sort((a, b) => a.position - b.position) : [];
  const attempts = items.length > 0 ? await store.listAttempts(items.map((i) => i.id)) : [];
  return {
    session: {
      id: session.id,
      status: session.status,
      kind: session.kind,
      focusTopicId: session.focus_topic_id,
      startedAt: session.started_at?.toISOString() ?? null,
      finishedAt: session.finished_at?.toISOString() ?? null,
      estSeconds: items.reduce((acc, i) => acc + ACTIVITY_TYPE_INFO[i.activity_type].est_seconds, 0),
    },
    items: items.map(toItemPublic),
    attempts: attempts.map(toAttemptPublic),
  };
}

/** POST /api/sessions/:id/start → `{ ok }`; günlük sınır aşılmışsa 429 + `limit_hit`. */
export async function startSession(deps: SessionDeps, actor: Actor, id: string): Promise<{ ok: true }> {
  const { store } = deps;
  const now = deps.now();
  const session = await ownSession(store, actor.userId, id);
  if (session.status === "active") return { ok: true };
  if (session.status !== "ready") throw new ApiError("session_not_ready");

  if (session.kind === "daily") {
    const settings = await deps.ai.store.loadSettings();
    const started = await deps.ai.store.sessionsStartedSince(actor.userId, istanbulDayStart(now));
    if (started >= settings.daily_session_limit) {
      await store.insertEvent(actor.userId, "limit_hit");
      throw new ApiError("daily_limit");
    }
  }
  const ok = await store.transition(session.id, ["ready"], "active", { started_at: now });
  if (ok) await store.insertEvent(actor.userId, "session_start", { session_id: session.id });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cevap, ipucu, açıklama
// ---------------------------------------------------------------------------

export interface AttemptResult {
  attemptId: string;
  /** `null`: cevap değerlendirilemedi (SPEC 5.1); ustalık güncellenmedi. */
  isCorrect: boolean | null;
  score: number | null;
  feedbackShortTr: string | null;
  correction: string | null;
  /** Hatanın Türkçe adı (`l1_codes.name_tr`); geri bildirim kartının başlığında gösterilir. */
  errorNameTr: string | null;
  /** Yalnızca yerleştirmede: sıradaki madde eklendi mi, test bitti mi. */
  placement?: PlacementProgress;
}

const toAttemptResult = (a: AttemptRow): AttemptResult => ({
  attemptId: a.id,
  isCorrect: a.is_correct,
  score: a.score,
  feedbackShortTr: a.feedback_short_tr,
  correction: a.correction,
  errorNameTr: null, // yinelenen gönderimde hata adı yeniden hesaplanmaz
});

/** Yerleştirmede değerlendirme gösterilmez. */
const hiddenResult = (a: AttemptRow): AttemptResult => ({
  attemptId: a.id,
  isCorrect: null,
  score: null,
  feedbackShortTr: null,
  correction: null,
  errorNameTr: null,
});

/** Öğrenciye bir şey söylemeyen genel kodlar başlıkta gösterilmez. */
const UNNAMED_CODES = new Set(["GEN.OTHER"]);
const L1_NAME_TR = new Map(L1_CODES.map((c) => [c.code, c.name_tr]));

function errorName(errors: readonly { l1_code: string }[]): string | null {
  const code = errors.find((e) => !UNNAMED_CODES.has(e.l1_code))?.l1_code;
  return (code && L1_NAME_TR.get(code)) || null;
}

/** Etkinlik türünün beklediği cevap biçimi. */
const RESPONSE_FIELD = {
  mcq_read: "choice",
  listen_choose: "choice",
  gap_fill: "text",
  dictation: "text",
  word_order: "order",
  translate_tr_en: "text",
  short_write: "text",
} as const;

async function activeItem(store: SessionStore, userId: string, itemId: string): Promise<ItemRow> {
  const item = await store.getItem(userId, parseId(itemId));
  if (!item) throw new ApiError("not_found");
  const session = await store.getSession(userId, item.session_id);
  if (!session) throw new ApiError("not_found");
  if (session.status !== "active") throw new ApiError("session_not_active");
  return item;
}

interface Graded {
  is_correct: boolean | null;
  score: number | null;
  graded_by: "local" | "llm";
  feedback_short_tr: string | null;
  explanation_long_tr: string | null;
  correction: string | null;
  errors: Omit<NewErrorEvent, "attempt_id" | "user_id" | "skill" | "activity_type" | "mode">[];
  incidental: { topic_id: string; correct: boolean }[];
  /** Değerlendirme güveni (örnek uyumu × model güveni); yerel değerlendirmede 1. Kanıt ağırlığına çarpan. */
  confidence: number;
}

function localCorrection(key: ItemKey): string | null {
  return key.correct ?? key.accepted?.[0] ?? null;
}

function gradeLocally(item: ItemRow, key: ItemKey, response: AttemptResponse): Graded {
  const res = gradeLocal({
    activity_type: item.activity_type as LocalActivityType,
    l1_target: item.l1_target,
    key,
    response: response as LocalResponse,
  });
  const distractorFeedback = res.errors.find((e) => e.feedback_tr)?.feedback_tr;
  return {
    is_correct: res.is_correct,
    score: res.score,
    graded_by: "local",
    feedback_short_tr: (res.is_correct ? undefined : distractorFeedback) ?? key.explanation_short_tr ?? null,
    explanation_long_tr: null, // yerel türlerde uzun açıklama `item_keys`'ten okunur
    correction: res.is_correct ? null : localCorrection(key),
    errors: res.errors.map((e) => ({
      topic_id: item.topic_id,
      l1_code: e.l1_code,
      wrong_span: e.wrong_span,
      correction: e.correction,
      source: e.source,
      review_sampled: false,
    })),
    incidental: [],
    confidence: 1,
  };
}

const UNGRADED: Graded = {
  is_correct: null,
  score: null,
  graded_by: "llm",
  feedback_short_tr: GRADE_UNAVAILABLE_TR,
  explanation_long_tr: null,
  correction: null,
  errors: [],
  incidental: [],
  confidence: 0,
};

async function gradeWithLlm(
  deps: SessionDeps,
  item: ItemRow,
  key: ItemKey,
  text: string,
  sampleRate: number,
  override?: { activity_type: "gap_fill"; task: string },
): Promise<Graded> {
  const [learner, modelSettings] = await Promise.all([deps.store.getLearner(item.user_id), deps.store.loadModelSettings()]);
  let outcome;
  try {
    outcome = await gradeFreeAnswer(
      deps.ai,
      {
        userId: item.user_id,
        sessionId: item.session_id,
        now: deps.now(),
        // Yerleştirmedeki tek yapay zekâ çağrısı konuşma sorusu (SPEC 3 `llm_usage.purpose`).
        purpose: item.purpose === "placement" ? "placement" : "grade",
      },
      {
        activity_type: override?.activity_type ?? (item.activity_type as "translate_tr_en" | "short_write"),
        topic_id: item.topic_id,
        level: learner.level_est,
        task: override?.task ?? item.payload.source_tr ?? item.payload.prompt_en ?? "",
        model_answer_en: key.model_answer_en ?? null,
        accepted: key.accepted ?? [],
        student_text: text,
      },
      modelSettings.grade_samples,
    );
  } catch (err) {
    // Guard reddi, zaman aşımı ya da sağlayıcı hatası: oturum kırılmaz, ustalık güncellenmez.
    console.error("[session/grade]", err instanceof Error ? `${err.name}: ${err.message.slice(0, 80)}` : "unknown");
    return UNGRADED;
  }
  if (outcome.kind !== "ok") return UNGRADED;
  const r = outcome.result;
  // Büyük/küçük harf, noktalama ve kesme işareti hata değildir (SPEC 5.3). Model bunu zaman
  // zaman yine de hata sayıyor (ör. cümle başında `she`); bu kural kodla da uygulanır.
  const errors = r.errors.filter((e) => !sameIgnoringCaseAndPunctuation(e.span, e.correction));
  const cosmeticOnly = !r.is_correct && errors.length === 0 && sameIgnoringCaseAndPunctuation(text, r.corrected);
  const isCorrect = r.is_correct || cosmeticOnly;
  return {
    is_correct: isCorrect,
    score: cosmeticOnly ? 1 : r.score,
    graded_by: "llm",
    feedback_short_tr: r.feedback_short_tr,
    explanation_long_tr: r.explanation_long_tr,
    correction: isCorrect ? null : r.corrected,
    errors: errors.map((e) => ({
      topic_id: e.topic_id,
      l1_code: e.l1_code,
      wrong_span: e.span,
      correction: e.correction,
      source: "llm" as const,
      review_sampled: deps.rng() < sampleRate,
    })),
    incidental: r.evidence,
    confidence: outcome.confidence,
  };
}

/** Geçerli ama hedef dışı boşluk cevabında gösterilen mesaj; ustalık güncellenmez. */
export const GAP_VALID_OTHER_TR = "Bu cümle de doğru. Ama bu etkinlikte aradığımız cevap başkaydı.";

/**
 * Boşluk doldurmada anahtarda ve bilinen yanlışlar listesinde OLMAYAN cevap yapay zekâya sorulur
 * (SPEC 4.6 "Boşluk hakemliği", rev. 4; 16.11.2026: "Ella wants ___ piano" → "to play" yanlış sayılmıştı).
 * - Tamamlanan cümle doğruysa: cevap değerlendirilmemiş sayılır (ustalık ve hata yazılmaz).
 * - Yanlışsa: hata etiketleri modelden gelir (`l1_target` varsayımı yerine).
 * - Model yanıt veremezse yerel sonuç geçerli kalır.
 */
async function adjudicateGap(
  deps: SessionDeps,
  item: ItemRow,
  key: ItemKey,
  text: string,
  local: Graded,
  sampleRate: number,
): Promise<Graded> {
  const sentence = item.payload.text_en ?? "";
  const complete = (filler: string) => sentence.split(GAP_MARK).join(filler);
  const accepted = key.accepted ?? [];
  if (!sentence.includes(GAP_MARK) || accepted.length === 0 || text.trim() === "") return local;
  const graded = await gradeWithLlm(
    deps,
    item,
    { model_answer_en: complete(accepted[0]), accepted: accepted.slice(1).map(complete) },
    complete(text),
    sampleRate,
    { activity_type: "gap_fill", task: sentence },
  );
  if (graded.is_correct === null) return local;
  if (graded.is_correct) {
    return {
      ...UNGRADED,
      feedback_short_tr: [GAP_VALID_OTHER_TR, key.explanation_short_tr].filter(Boolean).join(" "),
      correction: accepted[0],
    };
  }
  return { ...graded, score: 0, correction: accepted[0], incidental: [] };
}

/**
 * Değerlendirilmiş cevabın kanıtı: öğrenme profili ve (tekrar etkinliğiyse) etkinlik verimi.
 * Değerlendirilemeyen cevapta (`is_correct = null`) hiçbir şey yazılmaz. `model` cevap yazılmadan
 * önce yüklenmiştir; yeniden kurulduysa ve cevap zaten kaydedilmişse (`persisted`) kanıt yeniden işlenmez.
 */
async function applyGradedEvidence(
  deps: SessionDeps,
  model: LoadedModel,
  item: ItemRow,
  graded: Pick<Graded, "is_correct" | "score" | "incidental"> & { confidence?: number },
  hintUsed: boolean,
  now: Date,
  persisted = false,
  weight?: number | null,
): Promise<void> {
  if (graded.is_correct === null || graded.score === null) return;
  const done = { ...graded, is_correct: graded.is_correct, score: graded.score };
  const writes: Promise<void>[] = [];
  writes.push(
    updateLearner(
      deps.store,
      item.user_id,
      model,
      [attemptEvidence(model, item, done, hintUsed, now, weight ?? evidenceWeight(model.ctx, hintUsed, graded.confidence ?? 1))],
      now,
      persisted && model.rebuilt,
    ),
  );
  if (item.purpose === "retest") {
    writes.push(
      (async () => {
        const credit = creditRetest(
          {
            topic_id: item.topic_id,
            activity_type: item.activity_type,
            purpose: item.purpose,
            is_correct: done.is_correct,
            created_at: now,
          },
          await deps.store.listFocusCandidates(item.user_id, item.topic_id),
        );
        if (credit) await deps.store.applyCredit(item.user_id, credit, now);
      })(),
    );
  }
  await Promise.all(writes);
}

/**
 * POST /api/items/:id/attempt → `{ attemptId, isCorrect, score, feedbackShortTr, correction }`.
 * Sırayla: değerlendirme → `attempts` → `error_events` → `mastery` → (tekrar ise) `activity_stats`.
 * Aynı etkinliğe ikinci gönderim yeni satır yazmaz, ilk sonucu döner.
 */
export async function submitAttempt(
  deps: SessionDeps,
  actor: Actor,
  itemId: string,
  body: unknown,
): Promise<AttemptResult> {
  const { store } = deps;
  const input = parse(AttemptInput, body);
  const item = await activeItem(store, actor.userId, itemId);

  const field = RESPONSE_FIELD[item.activity_type as keyof typeof RESPONSE_FIELD];
  if (!field || !(field in input.response)) throw new ApiError("invalid_input");

  // Bağımsız okumalar tek turda (her biri ayrı bir ağ gidiş-dönüşü).
  const isLocal = ACTIVITY_TYPE_INFO[item.activity_type].grading === "local";
  const [attempts, key, hintOpened, settings] = await Promise.all([
    store.listAttempts([item.id]),
    store.getItemKey(item.id),
    input.hintUsed ? true : store.hintOpened(actor.userId, item.id),
    isLocal && item.activity_type !== "gap_fill" ? null : store.loadSessionSettings(),
  ]);
  const previous = attempts.find((a) => a.try_no === 1);
  if (previous) {
    if (item.purpose !== "placement") return toAttemptResult(previous);
    return { ...hiddenResult(previous), placement: await advancePlacement(deps, actor.userId, item.session_id) };
  }
  if (!key) throw new ApiError("server_error");

  let graded = isLocal
    ? gradeLocally(item, key, input.response)
    : await gradeWithLlm(deps, item, key, (input.response as { text: string }).text, settings!.review_sample_rate);
  // Yerleştirmede boşluk hakemliği yok: test dil modeli çağırmaz (PRD F2, konuşma hariç).
  if (item.activity_type === "gap_fill" && graded.is_correct === false && item.purpose !== "placement") {
    const text = (input.response as { text: string }).text;
    const known = key.wrong_patterns?.some((p) => answersMatch(p.answer, text)) ?? false;
    if (!known) graded = await adjudicateGap(deps, item, key, text, graded, settings!.review_sample_rate);
  }

  const now = deps.now();
  const hintUsed = hintOpened;
  const model = await loadLearnerModel(store, actor.userId, (await store.getLearner(actor.userId)).level_self);
  const attemptId = await store.insertAttempt({
    item_id: item.id,
    user_id: actor.userId,
    try_no: 1,
    response: input.response,
    is_correct: graded.is_correct,
    score: graded.score,
    time_ms: input.timeMs,
    hint_used: hintUsed,
    graded_by: graded.graded_by,
    feedback_short_tr: graded.feedback_short_tr,
    explanation_long_tr: graded.explanation_long_tr,
    correction: graded.correction,
    pred_p: predictFor(model, item),
    evidence_weight: graded.is_correct === null ? null : evidenceWeight(model.ctx, hintUsed, graded.confidence),
    incidental: graded.incidental.length > 0 ? graded.incidental : null,
  });
  if (!attemptId) {
    // Yarış (çift dokunuş): ilk yazılan geçerli.
    const first = (await store.listAttempts([item.id])).find((a) => a.try_no === 1);
    if (!first) throw new ApiError("server_error");
    if (item.purpose !== "placement") return toAttemptResult(first);
    return { ...hiddenResult(first), placement: await advancePlacement(deps, actor.userId, item.session_id) };
  }

  // Hata olayları, ustalık ve etkinlik verimi birbirinden bağımsız: birlikte yazılır.
  const writes: Promise<void>[] = [];
  if (graded.errors.length > 0) {
    writes.push(
      store.insertErrorEvents(
        graded.errors.map((e) => ({
          ...e,
          attempt_id: attemptId,
          user_id: actor.userId,
          skill: item.skill,
          activity_type: item.activity_type,
          mode: item.mode,
        })),
      ),
    );
  }
  writes.push(applyGradedEvidence(deps, model, item, graded, hintUsed, now));
  await Promise.all(writes);

  // Yerleştirmede geri bildirim gösterilmez (ölçme etkisi); sıradaki madde eklenir.
  if (item.purpose === "placement") {
    return {
      attemptId,
      isCorrect: null,
      score: null,
      feedbackShortTr: null,
      correction: null,
      errorNameTr: null,
      placement: await advancePlacement(deps, actor.userId, item.session_id),
    };
  }
  return {
    attemptId,
    isCorrect: graded.is_correct,
    score: graded.score,
    feedbackShortTr: graded.feedback_short_tr,
    correction: graded.correction,
    errorNameTr: graded.is_correct === false ? errorName(graded.errors) : null,
  };
}

/** GET /api/items/:id/hint → `{ hintTr }`; `hint_open` olayı. */
export async function getHint(deps: SessionDeps, actor: Actor, itemId: string): Promise<{ hintTr: string }> {
  const item = await activeItem(deps.store, actor.userId, itemId);
  const key = await deps.store.getItemKey(item.id);
  if (!key?.hint_tr) throw new ApiError("not_found");
  await deps.store.insertEvent(actor.userId, "hint_open", { item_id: item.id });
  return { hintTr: key.hint_tr };
}

// ---------------------------------------------------------------------------
// Dinleme (M7) ve konuşma (M8)
// ---------------------------------------------------------------------------

/**
 * GET /api/items/:id/audio → `{ url }` (1 saatlik imzalı URL). Seslendirilen metin (`item_keys.text_en`)
 * yanıta yazılmaz. Seslendirme kullanılamıyorsa `503 tts_unavailable`: istemci etkinliği nazik bir
 * mesajla atlatır, ustalık güncellenmez (SPEC 5.4).
 */
export async function getItemAudio(deps: SessionDeps, actor: Actor, itemId: string): Promise<{ url: string }> {
  const item = await activeItem(deps.store, actor.userId, itemId);
  if (!SPOKEN_TEXT_TYPES.includes(item.activity_type)) throw new ApiError("not_found");
  const [key, learner] = await Promise.all([deps.store.getItemKey(item.id), deps.store.getLearner(actor.userId)]);
  const text = key?.text_en ?? (item.activity_type === "dictation" ? key?.correct : undefined);
  if (!text) throw new ApiError("server_error");
  try {
    const { url } = await getAudioUrl(
      { store: deps.media.tts, ai: deps.ai.store, speech: deps.media.speech, clock: deps.ai.clock },
      { userId: actor.userId, sessionId: item.session_id, now: deps.now() },
      { text, level: learner.level_est },
    );
    return { url };
  } catch (err) {
    if (err instanceof TtsUnavailableError) {
      console.error("[session/audio]", err.reason);
      throw new ApiError("tts_unavailable");
    }
    throw err;
  }
}

/** Konuşmada en çok iki deneme: ilk kayıt + bir yeniden kayıt (PRD F6). */
export const MAX_SPEECH_TRIES = 2;
/** Anlaşılmayan kayıt (PLAN karar 28): deneme yazılır, ustalık güncellenmez. */
export const UNCLEAR_TR = "Seni net duyamadık. Telefonu biraz yaklaştırıp yeniden kaydet.";

export interface SpeechResult extends AttemptResult {
  transcript: string;
  tryNo: number;
  canRerecord: boolean;
}

export interface SpeechInput {
  /** WAV baytları; yalnızca bellekte, hiçbir yere yazılmaz. */
  audio: Uint8Array | null;
  timeMs: unknown;
  tryNo: unknown;
}

const transcriptOf = (a: AttemptRow): string =>
  typeof (a.response as { transcript?: unknown } | null)?.transcript === "string"
    ? (a.response as { transcript: string }).transcript
    : "";

const toSpeechResult = (a: AttemptRow): SpeechResult => ({
  ...toAttemptResult(a),
  transcript: transcriptOf(a),
  tryNo: a.try_no,
  canRerecord: a.try_no < MAX_SPEECH_TRIES,
});

/** Etkinliğin son değerlendirilmiş denemesi (yoksa son denemesi). */
export function lastGradedAttempt<T extends Pick<AttemptRow, "item_id" | "try_no" | "is_correct">>(
  attempts: readonly T[],
  itemId: string,
): T | null {
  const own = attempts.filter((a) => a.item_id === itemId).sort((a, b) => b.try_no - a.try_no);
  return own.find((a) => a.is_correct !== null) ?? own[0] ?? null;
}

/**
 * POST /api/items/:id/speech (multipart: `audio`, `timeMs`, `tryNo`) →
 * `{ attemptId, transcript, isCorrect, score, feedbackShortTr, correction, errorNameTr, tryNo, canRerecord }`.
 * İki adım (SPEC 5.1): transkript → değerlendirme. PLAN karar 18: iki deneme de değerlendirilir ve
 * hataları yazılır; ustalığa son değerlendirilmiş deneme işlenir (2. deneme gelince hemen, gelmezse
 * 1. deneme `finish`'te).
 */
export async function submitSpeech(
  deps: SessionDeps,
  actor: Actor,
  itemId: string,
  input: SpeechInput,
): Promise<SpeechResult> {
  const { store } = deps;
  const meta = parse(SpeechMeta, { timeMs: input.timeMs, tryNo: input.tryNo });
  const item = await activeItem(store, actor.userId, itemId);
  if (item.activity_type !== "speak_answer") throw new ApiError("invalid_input");

  const audio = input.audio;
  if (!audio || audio.byteLength > MAX_AUDIO_BYTES) throw new ApiError("invalid_input");
  const wav = parseWav(audio);
  if (!isAcceptedWav(wav)) throw new ApiError("invalid_input");

  const [attempts, key, hintOpened, settings] = await Promise.all([
    store.listAttempts([item.id]),
    store.getItemKey(item.id),
    store.hintOpened(actor.userId, item.id),
    store.loadSessionSettings(),
  ]);
  const same = attempts.find((a) => a.try_no === meta.tryNo);
  if (same) return toSpeechResult(same); // çift gönderim
  const first = attempts.find((a) => a.try_no === 1);
  if (meta.tryNo === 2 && !first) throw new ApiError("invalid_input");
  if (!key) throw new ApiError("server_error");

  const now = deps.now();
  let heard;
  try {
    heard = await transcribe(
      { ai: deps.ai.store, stt: deps.media.stt, clock: deps.ai.clock },
      { userId: actor.userId, sessionId: item.session_id, now },
      { wav: audio, durationSec: wav.durationSec },
    );
  } catch (err) {
    // Guard reddi, zaman aşımı ya da sağlayıcı hatası: deneme yazılmaz, hak tüketilmez (PLAN karar 29).
    console.error("[session/speech]", err instanceof Error ? `${err.name}: ${err.message.slice(0, 80)}` : "unknown");
    throw new ApiError("transcribe_unavailable");
  }
  if (meta.tryNo === 2) await store.insertEvent(actor.userId, "rerecord", { item_id: item.id });

  const graded: Graded = heard.unclear
    ? { ...UNGRADED, feedback_short_tr: UNCLEAR_TR }
    : await gradeWithLlm(deps, item, key, heard.transcript, settings.review_sample_rate);
  const model = await loadLearnerModel(store, actor.userId, (await store.getLearner(actor.userId)).level_self);

  const attemptId = await store.insertAttempt({
    item_id: item.id,
    user_id: actor.userId,
    try_no: meta.tryNo,
    response: { transcript: heard.transcript },
    is_correct: graded.is_correct,
    score: graded.score,
    time_ms: meta.timeMs,
    hint_used: hintOpened,
    graded_by: "llm",
    feedback_short_tr: graded.feedback_short_tr,
    explanation_long_tr: graded.explanation_long_tr,
    correction: graded.correction,
    pred_p: predictFor(model, item),
    evidence_weight: graded.is_correct === null ? null : evidenceWeight(model.ctx, hintOpened, graded.confidence),
    incidental: graded.incidental.length > 0 ? graded.incidental : null,
  });
  if (!attemptId) {
    const again = (await store.listAttempts([item.id])).find((a) => a.try_no === meta.tryNo);
    if (!again) throw new ApiError("server_error");
    return toSpeechResult(again);
  }

  const writes: Promise<void>[] = [];
  if (graded.errors.length > 0) {
    writes.push(
      store.insertErrorEvents(
        graded.errors.map((e) => ({
          ...e,
          attempt_id: attemptId,
          user_id: actor.userId,
          skill: item.skill,
          activity_type: item.activity_type,
          mode: item.mode,
        })),
      ),
    );
  }
  if (meta.tryNo === MAX_SPEECH_TRIES) {
    // Son deneme: değerlendirildiyse o, değilse (anlaşılmadı / değerlendirilemedi) 1. deneme işlenir.
    if (graded.is_correct !== null) writes.push(applyGradedEvidence(deps, model, item, graded, hintOpened, now));
    else if (first && first.is_correct !== null) {
      writes.push(applyGradedEvidence(deps, model, item, { ...first, incidental: [] }, first.hint_used, now, true, first.evidence_weight));
    }
  }
  await Promise.all(writes);

  const result: SpeechResult = {
    attemptId,
    isCorrect: graded.is_correct,
    score: graded.score,
    feedbackShortTr: graded.feedback_short_tr,
    correction: graded.correction,
    errorNameTr: graded.is_correct === false ? errorName(graded.errors) : null,
    transcript: heard.transcript,
    tryNo: meta.tryNo,
    canRerecord: meta.tryNo < MAX_SPEECH_TRIES,
  };
  if (item.purpose !== "placement") return result;
  // Yerleştirmede değerlendirme gösterilmez; anlaşılmayan kayıt mesajı kalır (yeniden kayıt için).
  return {
    ...result,
    ...hiddenResult({ id: attemptId } as AttemptRow),
    feedbackShortTr: heard.unclear ? UNCLEAR_TR : null,
    placement: "done",
  };
}

/**
 * `finish`: yeniden kaydedilmemiş konuşma etkinliklerinde 1. denemenin kanıtı (PLAN karar 18).
 * Yan kanıt (`evidence`) saklanmadığı için yalnızca hedef konuya işlenir.
 */
async function applyPendingSpeech(deps: SessionDeps, model: LoadedModel, items: ItemRow[], attempts: AttemptRow[], now: Date): Promise<void> {
  for (const item of items) {
    if (item.activity_type !== "speak_answer") continue;
    const own = attempts.filter((a) => a.item_id === item.id);
    if (own.length !== 1 || own[0].try_no !== 1 || own[0].is_correct === null) continue;
    await applyGradedEvidence(deps, model, item, { ...own[0], incidental: [] }, own[0].hint_used, now, true, own[0].evidence_weight);
  }
}

/**
 * Açıklamanın nasıl istendiği:
 * - `click`: öğrenci "Daha fazla açıkla"ya dokundu → `explain_opened = true` ve `explain_open` olayı.
 * - `auto`: uzun modda yanlış cevapta kendiliğinden gösterildi → `explain_opened = true`, olay yok
 *   (olay yalnızca tıklamayı sayar, PRD F4).
 * - `dismiss`: kendiliğinden gösterilen açıklama "Kısa yeter" ile kapatıldı → `explain_opened = false`;
 *   açıklama modu kuralı bunu "açılmadı" sayar.
 */
export type ExplanationVia = "click" | "auto" | "dismiss";

/** GET /api/attempts/:id/explanation → `{ explanationLongTr }` ve `explain_opened` (`?via=auto|dismiss`). */
export async function getExplanation(
  deps: SessionDeps,
  actor: Actor,
  attemptId: string,
  via: ExplanationVia = "click",
): Promise<{ explanationLongTr: string }> {
  const { store } = deps;
  const attempt = await store.getAttempt(actor.userId, parseId(attemptId));
  if (!attempt) throw new ApiError("not_found");
  const text =
    attempt.explanation_long_tr ?? (await store.getItemKey(attempt.item_id))?.explanation_long_tr ?? null;
  if (!text) throw new ApiError("not_found");
  const opened = via !== "dismiss";
  const wasOpened = attempt.explain_opened;
  if (wasOpened !== opened) await store.setExplainOpened(attempt.id, opened);
  if (via === "click" && !wasOpened) {
    await store.insertEvent(actor.userId, "explain_open", { attempt_id: attempt.id });
  }
  return { explanationLongTr: text };
}

// ---------------------------------------------------------------------------
// Bitiş, özet, teşhis
// ---------------------------------------------------------------------------

export interface SessionSummary {
  correct: number;
  answered: number;
  total: number;
  durationSec: number;
  topics: { id: string; titleTr: string }[];
}

export interface DiagnosisCard {
  id: string;
  status: "active" | "resolved";
  topicTitleTr: string;
  messageTr: string;
  /** Beceri başına doğru/toplam (PRD F8); `resolved` kartında boş olabilir. */
  evidence: { skill: string; correct: number; n: number }[];
  userFeedback: "agree" | "disagree" | null;
}

export interface PlacementResult extends PlacementCards {
  /** Ölçülen sınıf (A1, A2 ya da A2 üstü). */
  level: PlacementLevel;
  /** İçerik seviyesi (kapsam dışıysa da A2). */
  levelEst: "A1" | "A2";
  /** A2 üstü ve P ≥ gate_p: kapsam dışı, bekleme listesi ekranı (PRD F2). */
  gate: boolean;
  /** Karar eşiğe ulaşmadan bitti: seviye "sınırda" diye anlatılır. */
  borderline: boolean;
  /** En olası sınıfın olasılığı (0..1). */
  confidence: number;
  /** Sorulan banka maddesi sayısı. */
  items: number;
}

export interface FinishResult {
  summary: SessionSummary;
  diagnosis?: DiagnosisCard;
  placement?: PlacementResult;
  /** Günlük oturum sonunda sürekli kapı: öğrenci A2'yi tamamladı (kapsam dışına çıktı). */
  graduated?: boolean;
}

function evidenceRows(evidence: unknown): DiagnosisCard["evidence"] {
  const skills = (evidence as DiagnosisEvidence | null)?.skills ?? {};
  return (Object.entries(skills) as [keyof typeof SKILL_LABELS_TR, SkillEvidence][]).map(([skill, e]) => ({
    skill: SKILL_LABELS_TR[skill] ?? skill,
    correct: e.correct,
    n: e.n,
  }));
}

function toCard(row: DiagnosisRow, topics: Map<string, EngineTopic>): DiagnosisCard {
  return {
    id: row.id,
    status: row.status === "resolved" ? "resolved" : "active",
    topicTitleTr: topics.get(row.topic_id)?.title_tr ?? row.topic_id,
    messageTr:
      row.status === "resolved"
        ? `${topics.get(row.topic_id)?.title_tr ?? "Bu konu"}: takıldığın yer artık oturdu. Bu teşhisi kapattık.`
        : row.message_tr,
    evidence: row.status === "resolved" ? [] : evidenceRows(row.evidence),
    userFeedback: row.user_feedback,
  };
}

/** Oturumda dokunulan konularda 4.3 kurallarını çalıştırır; gösterilecek teşhisin kimliğini döner. */
async function runDiagnosis(deps: SessionDeps, model: LoadedModel, userId: string, touched: string[], now: Date): Promise<string | null> {
  const { store } = deps;
  if (touched.length === 0) return null;
  const [attempts, existing] = await Promise.all([store.listTopicAttempts(userId, touched), store.listActiveDiagnoses(userId)]);
  const { ctx, state } = model;
  const titles = new Map(model.topics.map((t) => [t.id, t.title_tr]));
  let best: { id: string; confidence: number } | null = null;
  let resolved: ExistingDiagnosis | null = null;

  for (const topicId of touched) {
    const topicAttempts = attempts.filter((a) => a.topic_id === topicId);
    const candidate = diagnoseTopic(ctx, state, topicId, topicAttempts);
    const result = reconcileDiagnoses({ ctx, state, topic_id: topicId, candidate, existing, attempts: topicAttempts });
    for (const u of result.updates) {
      await store.updateDiagnosisStatus(u.id, u.status);
      if (u.status === "resolved") resolved ??= existing.find((d) => d.id === u.id) ?? null;
    }
    if (result.insert) {
      const c = result.insert;
      const id = await store.insertDiagnosis(userId, {
        topic_id: c.topic_id,
        kind: c.kind,
        weak_skill: c.weak_skill,
        weak_activity: c.weak_activity,
        confidence: c.confidence,
        evidence: c.evidence,
        message_tr: diagnosisMessage(c, titles.get(topicId) ?? topicId),
      });
      if (!best || c.confidence > best.confidence) best = { id, confidence: c.confidence };
    }
  }
  // Önce en yüksek güvenli yeni teşhis; yoksa "çözüldü" kartı.
  const shownId = best?.id ?? resolved?.id ?? null;
  if (shownId) await store.markDiagnosisShown(shownId, now);
  return shownId;
}

/** A2'yi tamamlama oranı: sürekli kapı için A2 konularının bu kadarı sağlam olmalı. */
export const GRADUATE_SOLID_SHARE = 0.9;

/**
 * Sürekli kapı (docs/SPEC.md 4.7): genel seviye A2|B1 kesiminin üstünde (P ≥ continuous_gate_p) ve
 * A2 konularının ≥ %90'ı sağlamsa öğrenci kapsam dışına çıkar (`graduated`).
 */
async function continuousGate(deps: SessionDeps, userId: string, model: LoadedModel, learner: Learner, now: Date): Promise<boolean> {
  if ((learner.scope_status ?? "in_scope") !== "in_scope") return false;
  const settings = await deps.store.loadModelSettings();
  const cut = placementConfig(settings.placement_model).cuts[1];
  if (pGlobalAbove(model.state, cut) < settings.continuous_gate_p) return false;
  if (solidShare(curriculumInput(model, learner, null, []), "A2") < GRADUATE_SOLID_SHARE) return false;
  await deps.store.updateProfile(userId, { scope_status: "graduated" }, now);
  return true;
}

async function finishPlacement(
  deps: SessionDeps,
  actor: Actor,
  args: { first: boolean; items: ItemRow[]; attempts: AttemptRow[]; summary: SessionSummary; now: Date },
): Promise<FinishResult & { background?: Background }> {
  const { store } = deps;
  const { items, attempts, now } = args;
  const [learner, settings] = await Promise.all([store.getLearner(actor.userId), store.loadModelSettings()]);
  const model = await loadLearnerModel(store, actor.userId, learner.level_self);
  if (args.first) await applyPendingSpeech(deps, model, items, attempts, now);
  const outcome = placementOutcome(items, attempts, learner.level_self, placementConfig(settings.placement_model), model.calibration);
  const levelEst: "A1" | "A2" = outcome.level === "A1" ? "A1" : "A2";
  const cards = placementCards({ ctx: model.ctx, state: model.state, topics: model.topics, items, attempts, level: outcome.level });
  const result: PlacementResult = {
    ...cards,
    level: outcome.level,
    levelEst,
    gate: outcome.gate,
    borderline: outcome.borderline,
    confidence: Math.round(Math.max(...outcome.probs) * 100) / 100,
    items: outcome.n,
  };
  const completed = args.first
    ? await store.completePlacement(
        actor.userId,
        {
          level_est: levelEst,
          scope_status: outcome.gate ? "above_scope" : "in_scope",
          // Ölçme kaydı: olasılıklar ve θ; öğrenci metni yok.
          placement_result: {
            level: outcome.level,
            probs: outcome.probs.map((p) => Math.round(p * 1000) / 1000),
            theta_mean: Math.round(outcome.theta_mean * 1000) / 1000,
            theta_sd: Math.round(outcome.theta_sd * 1000) / 1000,
            n: outcome.n,
            gate: outcome.gate,
            borderline: outcome.borderline,
          },
        },
        now,
      )
    : false;
  return {
    summary: args.summary,
    placement: result,
    ...(completed && !outcome.gate ? { background: () => prefetchNext(deps, actor.userId) } : {}),
  };
}

async function updateExplainMode(deps: SessionDeps, userId: string, now: Date): Promise<void> {
  const [learner, stats] = await Promise.all([
    deps.store.getLearner(userId),
    deps.store.explainStats(userId, EXPLAIN_MODE_SESSIONS),
  ]);
  const next: ExplainMode = nextExplainMode(learner.explain_mode, stats);
  if (next !== learner.explain_mode) await deps.store.updateProfile(userId, { explain_mode: next }, now);
}

/**
 * POST /api/sessions/:id/finish → `{ summary, diagnosis? }`. İlk çağrı oturumu kapatır, teşhisi
 * çalıştırır ve sonraki oturumu `background` olarak verir. Bitmiş oturumda yeniden çağrılırsa
 * (puan gönderme, sayfa yenileme) özeti yeniden döner; puan/not varsa kaydeder.
 */
export async function finishSession(
  deps: SessionDeps,
  actor: Actor,
  id: string,
  body: unknown,
): Promise<FinishResult & { background?: Background }> {
  const { store } = deps;
  const input = parse(FinishInput, body ?? {});
  const session = await ownSession(store, actor.userId, id);
  if (session.status !== "active" && session.status !== "done") throw new ApiError("session_not_active");

  const now = deps.now();
  const first = session.status === "active" && (await store.transition(session.id, ["active"], "done", { finished_at: now }));
  // Yalnızca gönderilen alan yazılır: puanı sonradan göndermek notu silmez. Boş not = not yok.
  if (input.rating !== undefined || input.comment !== undefined) {
    await store.setRating(session.id, {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.comment !== undefined ? { comment: input.comment || null } : {}),
    });
  }

  const items = await store.listItems(session.id);
  const attempts = await store.listAttempts(items.map((i) => i.id));
  const topics = new Map((await store.loadTopics()).map((t) => [t.id, t]));
  const graded = new Set(attempts.filter((a) => a.is_correct !== null).map((a) => a.item_id));
  const touched = [...new Set(items.filter((i) => graded.has(i.id)).map((i) => i.topic_id))];

  const finishedAt = first ? now : (session.finished_at ?? now);
  // Konuşmada iki deneme olabilir: özet her etkinliğin son değerlendirilmiş denemesini sayar.
  const finalAttempts = items.flatMap((i) => lastGradedAttempt(attempts, i.id) ?? []);
  const summary: SessionSummary = {
    correct: finalAttempts.filter((a) => a.is_correct === true).length,
    answered: finalAttempts.length,
    total: items.length,
    durationSec: session.started_at ? Math.max(0, Math.round((finishedAt.getTime() - session.started_at.getTime()) / 1000)) : 0,
    topics: [...new Set(items.map((i) => i.topic_id))].map((t) => ({ id: t, titleTr: topics.get(t)?.title_tr ?? t })),
  };

  if (session.kind === "placement") return finishPlacement(deps, actor, { first, items, attempts, summary, now });

  let diagnosis: DiagnosisRow | null = null;
  let graduated = false;
  if (first) {
    const learner = await store.getLearner(actor.userId);
    const model = await loadLearnerModel(store, actor.userId, learner.level_self);
    await applyPendingSpeech(deps, model, items, attempts, now);
    const shownId = await runDiagnosis(deps, model, actor.userId, touched, now);
    if (shownId) diagnosis = await store.getDiagnosis(actor.userId, shownId);
    await updateExplainMode(deps, actor.userId, now);
    // Öğrencinin seçtiği odak bir kez geçerlidir.
    if (learner.focus_choice && learner.focus_choice === session.focus_topic_id) {
      await store.updateProfile(actor.userId, { focus_choice: null }, now);
    }
    graduated = await continuousGate(deps, actor.userId, model, learner, now);
  } else {
    diagnosis = await store.getDiagnosisShownAt(actor.userId, finishedAt);
  }

  return {
    summary,
    ...(diagnosis ? { diagnosis: toCard(diagnosis, topics) } : {}),
    ...(graduated ? { graduated: true } : {}),
    ...(first && session.kind === "daily" && !graduated ? { background: () => prefetchNext(deps, actor.userId) } : {}),
  };
}

/** POST /api/diagnoses/:id/feedback → `{ ok }`; `diag_feedback` olayı. */
export async function submitDiagnosisFeedback(
  deps: SessionDeps,
  actor: Actor,
  id: string,
  body: unknown,
): Promise<{ ok: true }> {
  const { feedback } = parse(DiagnosisFeedbackInput, body);
  const diagnosis = await deps.store.getDiagnosis(actor.userId, parseId(id));
  if (!diagnosis) throw new ApiError("not_found");
  await deps.store.setDiagnosisFeedback(diagnosis.id, feedback);
  await deps.store.insertEvent(actor.userId, "diag_feedback", { diagnosis_id: diagnosis.id, feedback });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profil ve olaylar
// ---------------------------------------------------------------------------

/** PATCH /api/profile → `{ ok }`; `display_name`, `interests`, `explain_mode`, `study_mode`, `goal`. */
export async function patchProfile(
  store: SessionStore,
  actor: Actor,
  body: unknown,
  now: Date,
): Promise<{ ok: true }> {
  const input = parse(ProfilePatchInput, body);
  await store.updateProfile(
    actor.userId,
    {
      ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
      ...(input.interests !== undefined ? { interests: [...new Set(input.interests)] } : {}),
      ...(input.explainMode !== undefined ? { explain_mode: input.explainMode } : {}),
      ...(input.studyMode !== undefined ? { study_mode: input.studyMode } : {}),
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
    },
    now,
  );
  // Müfredatı değiştiren tercih: hazırlanmış (başlamamış) oturum yeniden planlansın.
  if (input.studyMode !== undefined || input.goal !== undefined) await store.abandonReady(actor.userId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Kapsam kapısı, bekleme listesi, yeniden test (docs/SPEC.md 4.7)
// ---------------------------------------------------------------------------

/** Kapsam dışı öğrencinin yeniden test hakkı: toplam en çok bu kadar yerleştirme. */
export const MAX_PLACEMENTS = 2;

export interface ScopeView {
  status: "in_scope" | "above_scope" | "graduated";
  /** "Hazır olunca haber ver" seçildi mi. */
  notified: boolean;
  /** Şu an yeniden test çözebilir mi. */
  canRetest: boolean;
  /** Yeniden test hakkı açılacaksa tarihi (ISO); hak yoksa ya da açıksa `null`. */
  retestAt: string | null;
}

/** GET /api/scope → kapsam durumu ve yeniden test hakkı. */
export async function getScope(deps: SessionDeps, actor: Actor): Promise<ScopeView> {
  const { store } = deps;
  const now = deps.now();
  const [learner, settings, placements] = await Promise.all([
    store.getLearner(actor.userId),
    store.loadModelSettings(),
    store.countPlacements(actor.userId),
  ]);
  const status = learner.scope_status ?? "in_scope";
  let canRetest = false;
  let retestAt: string | null = null;
  if (status === "above_scope" && placements < MAX_PLACEMENTS && learner.placement_done_at) {
    const at = new Date(learner.placement_done_at.getTime() + settings.retest_after_days * DAY_MS);
    canRetest = now >= at;
    retestAt = canRetest ? null : at.toISOString();
  }
  return { status, notified: Boolean(learner.notify_opt_in_at), canRetest, retestAt };
}

/** POST /api/waitlist → `{ ok }`; KVKK: yalnızca "haber ver" tercihi ve zamanı yazılır. */
export async function joinWaitlist(deps: SessionDeps, actor: Actor, body: unknown): Promise<{ ok: true }> {
  parse(WaitlistInput, body);
  const learner = await deps.store.getLearner(actor.userId);
  if ((learner.scope_status ?? "in_scope") === "in_scope") throw new ApiError("invalid_input");
  if (!learner.notify_opt_in_at) {
    await deps.store.updateProfile(actor.userId, { notify_opt_in_at: deps.now() }, deps.now());
  }
  return { ok: true };
}

/** POST /api/placement/retest → `{ ok }`; hak yoksa 409 `retest_unavailable`. */
export async function retestPlacement(deps: SessionDeps, actor: Actor): Promise<{ ok: true }> {
  const scope = await getScope(deps, actor);
  if (!scope.canRetest) throw new ApiError("retest_unavailable");
  const ok = await deps.store.reopenPlacement(actor.userId, deps.now());
  if (!ok) throw new ApiError("retest_unavailable");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ana sayfa: "Bugün ne çalışalım?" ve haftalık okul sorusu (docs/arastirma/mufredat-onerisi.md)
// ---------------------------------------------------------------------------

export interface HomeOptions {
  /** En iyi 2–3 aday; öğrenci seçerse sonraki oturumun odağı olur. */
  focusChoices: { topicId: string; titleTr: string; status: "learning" | "ready" }[];
  /** Öğrencinin şu anki seçimi. */
  focusChoice: string | null;
  /** Haftalık okul sorusu: kendi programında, okul programı haritalıysa ya da bu hafta cevaplandıysa `null`. */
  school: { suggestions: { topicId: string; titleTr: string }[]; topics: { topicId: string; titleTr: string }[] } | null;
}

/** Ana sayfadaki seçenek sayısı. */
export const HOME_FOCUS_CHOICES = 3;

/** GET /api/home → odak seçenekleri ve (gerekirse) okul sorusu. */
export async function getHomeOptions(deps: SessionDeps, actor: Actor): Promise<HomeOptions> {
  const { store } = deps;
  const now = deps.now();
  const learner = await store.getLearner(actor.userId);
  const [model, focus, answered] = await Promise.all([
    loadLearnerModel(store, actor.userId, learner.level_self),
    store.listRecentFocus(actor.userId, RECENT_FOCUS_SESSIONS),
    learner.study_mode === "self" || learner.program_id ? Promise.resolve(true) : store.hasSchoolTopicAnswer(actor.userId, istanbulWeekStart(now)),
  ]);
  const input = curriculumInput(model, learner, null, focus.recent);
  const choices = focusChoices(input, HOME_FOCUS_CHOICES)
    .filter((c) => c.status === "learning" || c.status === "ready")
    .map((c) => ({ topicId: c.topic.id, titleTr: c.topic.title_tr, status: c.status as "learning" | "ready" }));
  const open = openTopics(input);
  return {
    focusChoices: choices,
    focusChoice: learner.focus_choice ?? null,
    school: answered
      ? null
      : {
          suggestions: schoolSuggestions({ ...input, topics: open }, 3).map((t) => ({ topicId: t.id, titleTr: t.title_tr })),
          topics: defaultPath(open).map((t) => ({ topicId: t.id, titleTr: t.title_tr })),
        },
  };
}

/**
 * POST /api/focus-choice → `{ ok }`. Seçim yalnızca şu anki seçeneklerden biri olabilir; hazırlanmış
 * (başlamamış) oturum bırakılır, sonraki oturum seçilen konuyla planlanır.
 */
export async function setFocusChoice(deps: SessionDeps, actor: Actor, body: unknown): Promise<{ ok: true }> {
  const { topicId } = parse(FocusChoiceInput, body);
  if (topicId !== null) {
    const options = await getHomeOptions(deps, actor);
    if (!options.focusChoices.some((c) => c.topicId === topicId)) throw new ApiError("invalid_input");
  }
  await deps.store.updateProfile(actor.userId, { focus_choice: topicId }, deps.now());
  await deps.store.abandonReady(actor.userId);
  return { ok: true };
}

/** POST /api/events → `{ ok }`; ad listeden, `props` ≤ 1 KB ve kısa değerler. */
export async function recordEvent(store: SessionStore, actor: Actor, body: unknown): Promise<{ ok: true }> {
  const input = parse(EventInput, body);
  await store.insertEvent(actor.userId, input.name, input.props);
  return { ok: true };
}
