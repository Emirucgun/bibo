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
import { getAudioUrl, TtsUnavailableError, ttsAvailable, type TtsStore } from "@/lib/tts/cache";
import type { SpeechClient } from "@/lib/tts/speechify";
import { ApiError } from "@/lib/api/errors";
import { GAP_MARK } from "@/lib/ai/checks";
import { ACTIVITY_TYPE_INFO, SKILL_LABELS_TR } from "@/lib/content/activity-types";
import { L1_CODES } from "@/lib/content/taxonomy";
import { diagnoseTopic, diagnosisMessage, reconcileDiagnoses, type MasteryBySkill } from "@/lib/engine/diagnosis";
import { creditRetest } from "@/lib/engine/effectiveness";
import { gradeLocal } from "@/lib/engine/grade-local";
import { answersMatch, sameIgnoringCaseAndPunctuation } from "@/lib/engine/normalize";
import { applyEvidence, emptyMastery, evidenceFromAttempt } from "@/lib/engine/mastery";
import { planSession, RECENT_ERROR_DAYS } from "@/lib/engine/planner";
import { createRng, seedFromString } from "@/lib/engine/random";
import type {
  DiagnosisEvidence,
  EngineTopic,
  ExistingDiagnosis,
  ItemKey,
  LocalActivityType,
  LocalResponse,
  MasteryRow,
  SkillEvidence,
} from "@/lib/engine/types";
import { EXPLAIN_MODE_SESSIONS, nextExplainMode, type ExplainMode } from "./explain-mode";
import { splitGeneratedItems, SPOKEN_TEXT_TYPES } from "./save-items";
import {
  AttemptInput,
  DiagnosisFeedbackInput,
  EventInput,
  FinishInput,
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
  ItemRow,
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
    const [learner, topics, l1_codes, mastery, activity_stats, active_diagnoses, recent_errors, school_topic_id, settings] =
      await Promise.all([
        store.getLearner(userId),
        store.loadTopics(),
        store.loadL1Codes(),
        store.listMastery(userId),
        store.listActivityStats(userId),
        store.listActiveDiagnoses(userId),
        store.listRecentErrors(userId, new Date(now.getTime() - RECENT_ERROR_DAYS * DAY_MS)),
        store.getSchoolTopic(userId, istanbulWeekStart(now)),
        store.loadSessionSettings(),
      ]);

    const plan = planSession({
      now,
      rng: createRng(seedFromString(sessionId)),
      level_est: learner.level_est,
      interests: learner.interests,
      topics,
      l1_codes,
      mastery,
      activity_stats,
      active_diagnoses,
      recent_errors,
      school_topic_id,
      settings: {
        // Kapalı, ses seçilmemiş ya da son 24 saatte 402/429: dinleme metne düşer (SPEC 4.4 adım 8, 5.4).
        tts_enabled: settings.tts_enabled && (await ttsAvailable(deps.media.tts, now)),
        general_content_rate: settings.general_content_rate,
      },
    });
    const slots = plan.slots;
    await store.setPlan(sessionId, plan, plan.focus_topic_id);

    const outcome = await generateSession(
      deps.ai,
      { userId, sessionId, now, prefetch: true },
      { level: learner.level_est, explainMode: learner.explain_mode, varietySeed: sessionId, slots },
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
}

const toAttemptResult = (a: AttemptRow): AttemptResult => ({
  attemptId: a.id,
  isCorrect: a.is_correct,
  score: a.score,
  feedbackShortTr: a.feedback_short_tr,
  correction: a.correction,
  errorNameTr: null, // yinelenen gönderimde hata adı yeniden hesaplanmaz
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
};

async function gradeWithLlm(
  deps: SessionDeps,
  item: ItemRow,
  key: ItemKey,
  text: string,
  sampleRate: number,
  override?: { activity_type: "gap_fill"; task: string },
): Promise<Graded> {
  const learner = await deps.store.getLearner(item.user_id);
  let outcome;
  try {
    outcome = await gradeFreeAnswer(
      deps.ai,
      { userId: item.user_id, sessionId: item.session_id, now: deps.now() },
      {
        activity_type: override?.activity_type ?? (item.activity_type as "translate_tr_en" | "short_write"),
        topic_id: item.topic_id,
        level: learner.level_est,
        task: override?.task ?? item.payload.source_tr ?? item.payload.prompt_en ?? "",
        model_answer_en: key.model_answer_en ?? null,
        accepted: key.accepted ?? [],
        student_text: text,
      },
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

async function updateMastery(
  deps: SessionDeps,
  item: ItemRow,
  graded: Pick<Graded, "incidental"> & { is_correct: boolean; score: number },
  hintUsed: boolean,
  now: Date,
): Promise<void> {
  const evidence = evidenceFromAttempt({
    topic_id: item.topic_id,
    skill: item.skill,
    mode: item.mode,
    score: graded.score,
    is_correct: graded.is_correct,
    hint_used: hintUsed,
    incidental: graded.incidental,
  });
  const topicIds = [...new Set(evidence.map((e) => e.topic_id))];
  const [rows, topics] = await Promise.all([
    deps.store.listMastery(item.user_id, topicIds),
    deps.store.loadTopics(),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const updated: MasteryRow[] = [];
  for (const ev of evidence) {
    const topic = topicById.get(ev.topic_id);
    if (!topic) continue;
    const current =
      updated.find((r) => r.topic_id === ev.topic_id && r.skill === ev.skill) ??
      rows.find((r) => r.topic_id === ev.topic_id && r.skill === ev.skill) ??
      emptyMastery(topic);
    const next = { ...applyEvidence(current, ev, now), topic_id: ev.topic_id, skill: ev.skill };
    const at = updated.findIndex((r) => r.topic_id === ev.topic_id && r.skill === ev.skill);
    if (at >= 0) updated[at] = next;
    else updated.push(next);
  }
  await deps.store.upsertMastery(item.user_id, updated, now);
}

/**
 * Değerlendirilmiş cevabın kanıtı: ustalık ve (tekrar etkinliğiyse) etkinlik verimi.
 * Değerlendirilemeyen cevapta (`is_correct = null`) hiçbir şey yazılmaz.
 */
async function applyGradedEvidence(
  deps: SessionDeps,
  item: ItemRow,
  graded: Pick<Graded, "is_correct" | "score" | "incidental">,
  hintUsed: boolean,
  now: Date,
): Promise<void> {
  if (graded.is_correct === null || graded.score === null) return;
  const done = { ...graded, is_correct: graded.is_correct, score: graded.score };
  const writes: Promise<void>[] = [updateMastery(deps, item, done, hintUsed, now)];
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
  if (previous) return toAttemptResult(previous);
  if (!key) throw new ApiError("server_error");

  let graded = isLocal
    ? gradeLocally(item, key, input.response)
    : await gradeWithLlm(deps, item, key, (input.response as { text: string }).text, settings!.review_sample_rate);
  if (item.activity_type === "gap_fill" && graded.is_correct === false) {
    const text = (input.response as { text: string }).text;
    const known = key.wrong_patterns?.some((p) => answersMatch(p.answer, text)) ?? false;
    if (!known) graded = await adjudicateGap(deps, item, key, text, graded, settings!.review_sample_rate);
  }

  const now = deps.now();
  const hintUsed = hintOpened;
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
  });
  if (!attemptId) {
    // Yarış (çift dokunuş): ilk yazılan geçerli.
    const first = (await store.listAttempts([item.id])).find((a) => a.try_no === 1);
    if (!first) throw new ApiError("server_error");
    return toAttemptResult(first);
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
  writes.push(applyGradedEvidence(deps, item, graded, hintUsed, now));
  await Promise.all(writes);

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
    if (graded.is_correct !== null) writes.push(applyGradedEvidence(deps, item, graded, hintOpened, now));
    else if (first && first.is_correct !== null) {
      writes.push(applyGradedEvidence(deps, item, { ...first, incidental: [] }, first.hint_used, now));
    }
  }
  await Promise.all(writes);

  return {
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
}

/**
 * `finish`: yeniden kaydedilmemiş konuşma etkinliklerinde 1. denemenin kanıtı (PLAN karar 18).
 * Yan kanıt (`evidence`) saklanmadığı için yalnızca hedef konuya işlenir.
 */
async function applyPendingSpeech(deps: SessionDeps, items: ItemRow[], attempts: AttemptRow[], now: Date): Promise<void> {
  for (const item of items) {
    if (item.activity_type !== "speak_answer") continue;
    const own = attempts.filter((a) => a.item_id === item.id);
    if (own.length !== 1 || own[0].try_no !== 1 || own[0].is_correct === null) continue;
    await applyGradedEvidence(deps, item, { ...own[0], incidental: [] }, own[0].hint_used, now);
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

export interface FinishResult {
  summary: SessionSummary;
  diagnosis?: DiagnosisCard;
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
async function runDiagnosis(deps: SessionDeps, userId: string, touched: string[], now: Date): Promise<string | null> {
  const { store } = deps;
  if (touched.length === 0) return null;
  const [mastery, attempts, existing, topics] = await Promise.all([
    store.listMastery(userId, touched),
    store.listTopicAttempts(userId, touched),
    store.listActiveDiagnoses(userId),
    store.loadTopics(),
  ]);
  const titles = new Map(topics.map((t) => [t.id, t.title_tr]));
  let best: { id: string; confidence: number } | null = null;
  let resolved: ExistingDiagnosis | null = null;

  for (const topicId of touched) {
    const bySkill: MasteryBySkill = {};
    for (const m of mastery) if (m.topic_id === topicId) bySkill[m.skill] = m;
    const topicAttempts = attempts.filter((a) => a.topic_id === topicId);
    const candidate = diagnoseTopic(topicId, bySkill, topicAttempts);
    const result = reconcileDiagnoses({ topic_id: topicId, candidate, existing, mastery: bySkill, attempts: topicAttempts });
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
  let diagnosis: DiagnosisRow | null = null;
  if (first) {
    await applyPendingSpeech(deps, items, attempts, now);
    const shownId = await runDiagnosis(deps, actor.userId, touched, now);
    if (shownId) diagnosis = await store.getDiagnosis(actor.userId, shownId);
    await updateExplainMode(deps, actor.userId, now);
  } else {
    diagnosis = await store.getDiagnosisShownAt(actor.userId, finishedAt);
  }

  // Konuşmada iki deneme olabilir: özet her etkinliğin son değerlendirilmiş denemesini sayar.
  const finalAttempts = items.flatMap((i) => lastGradedAttempt(attempts, i.id) ?? []);
  const summary: SessionSummary = {
    correct: finalAttempts.filter((a) => a.is_correct === true).length,
    answered: finalAttempts.length,
    total: items.length,
    durationSec: session.started_at ? Math.max(0, Math.round((finishedAt.getTime() - session.started_at.getTime()) / 1000)) : 0,
    topics: [...new Set(items.map((i) => i.topic_id))].map((t) => ({ id: t, titleTr: topics.get(t)?.title_tr ?? t })),
  };

  return {
    summary,
    ...(diagnosis ? { diagnosis: toCard(diagnosis, topics) } : {}),
    ...(first && session.kind === "daily" ? { background: () => prefetchNext(deps, actor.userId) } : {}),
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

/** PATCH /api/profile → `{ ok }`; yalnızca `display_name`, `interests`, `explain_mode`. */
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
    },
    now,
  );
  return { ok: true };
}

/** POST /api/events → `{ ok }`; ad listeden, `props` ≤ 1 KB ve kısa değerler. */
export async function recordEvent(store: SessionStore, actor: Actor, body: unknown): Promise<{ ok: true }> {
  const input = parse(EventInput, body);
  await store.insertEvent(actor.userId, input.name, input.props);
  return { ok: true };
}
