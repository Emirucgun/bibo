// `SessionStore`'un Supabase uygulaması. Yazan yollar servis istemcisini (`createAdminClient()`,
// `requireOnboarded()` sonrası) verir ve her sorgu `user_id` ile süzülür; yalnızca okuyan
// `GET /api/sessions/:id` kullanıcının kendi istemcisini (RLS) verir.
// IMPORTANT: `items` hiçbir yerde `select *` ile okunmaz; `item_keys` yalnızca `getItemKey`'de.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isActivityType, type ActivityType, type Mode, type Purpose, type Skill } from "@/lib/content/activity-types";
import { isInterest } from "@/lib/content/interests";
import type { EngineL1Code, EngineTopic, ItemKey } from "@/lib/engine/types";
import type {
  AttemptRow,
  DiagnosisRow,
  ItemPayload,
  ItemRow,
  SessionRow,
  SessionStatus,
  SessionStore,
} from "./types";

const SESSION_COLS = "id, user_id, kind, status, focus_topic_id, created_at, started_at, finished_at, rating";
const ITEM_COLS =
  "id, session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, interest, l1_target, payload";
const ATTEMPT_COLS =
  "id, item_id, user_id, try_no, response, is_correct, score, hint_used, explain_opened, graded_by, feedback_short_tr, explanation_long_tr, correction";
const DIAGNOSIS_COLS = "id, topic_id, kind, status, message_tr, evidence, user_feedback";

const UNIQUE_VIOLATION = "23505";

type Row = Record<string, unknown>;

const date = (v: unknown): Date | null => (typeof v === "string" ? new Date(v) : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function fail(what: string, error: { code?: string } | null): never {
  throw new Error(`${what}: ${error?.code ?? "unknown"}`);
}

function toSession(r: Row): SessionRow {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    kind: r.kind as SessionRow["kind"],
    status: r.status as SessionStatus,
    focus_topic_id: (r.focus_topic_id as string | null) ?? null,
    created_at: date(r.created_at)!,
    started_at: date(r.started_at),
    finished_at: date(r.finished_at),
    rating: num(r.rating),
  };
}

function toItem(r: Row): ItemRow {
  return {
    id: r.id as string,
    session_id: r.session_id as string,
    user_id: r.user_id as string,
    position: Number(r.position),
    topic_id: r.topic_id as string,
    activity_type: r.activity_type as ActivityType,
    skill: r.skill as Skill,
    mode: r.mode as Mode,
    purpose: r.purpose as Purpose,
    interest: (r.interest as string | null) ?? null,
    l1_target: (r.l1_target as string | null) ?? null,
    payload: r.payload as ItemPayload,
  };
}

function toAttempt(r: Row): AttemptRow {
  return {
    id: r.id as string,
    item_id: r.item_id as string,
    user_id: r.user_id as string,
    try_no: Number(r.try_no),
    response: r.response,
    is_correct: (r.is_correct as boolean | null) ?? null,
    score: num(r.score),
    hint_used: Boolean(r.hint_used),
    explain_opened: Boolean(r.explain_opened),
    graded_by: (r.graded_by as AttemptRow["graded_by"]) ?? null,
    feedback_short_tr: (r.feedback_short_tr as string | null) ?? null,
    explanation_long_tr: (r.explanation_long_tr as string | null) ?? null,
    correction: (r.correction as string | null) ?? null,
  };
}

const toDiagnosis = (r: Row): DiagnosisRow => ({
  id: r.id as string,
  topic_id: r.topic_id as string,
  kind: r.kind as DiagnosisRow["kind"],
  status: r.status as DiagnosisRow["status"],
  message_tr: r.message_tr as string,
  evidence: r.evidence,
  user_feedback: (r.user_feedback as DiagnosisRow["user_feedback"]) ?? null,
});

/** `topics` ve `l1_codes` seed verisidir; her cevapta yeniden okunmasın diye kısa süre bellekte tutulur. */
const TAXONOMY_TTL_MS = 10 * 60_000;
let topicsCache: { at: number; rows: EngineTopic[] } | null = null;
let codesCache: { at: number; rows: EngineL1Code[] } | null = null;

export function createSessionStore(db: SupabaseClient): SessionStore {
  return {
    // --- sessions ---
    async listOpenSessions(userId) {
      const { data, error } = await db
        .from("sessions")
        .select(SESSION_COLS)
        .eq("user_id", userId)
        .eq("kind", "daily")
        .in("status", ["generating", "ready", "active"])
        .order("created_at", { ascending: false });
      if (error) fail("sessions", error);
      return (data ?? []).map(toSession);
    },

    async getSession(userId, sessionId) {
      const { data, error } = await db
        .from("sessions")
        .select(SESSION_COLS)
        .eq("id", sessionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("sessions", error);
      return data ? toSession(data) : null;
    },

    async transition(sessionId, from, to, patch) {
      const { data, error } = await db
        .from("sessions")
        .update({
          status: to,
          ...(patch?.started_at ? { started_at: patch.started_at.toISOString() } : {}),
          ...(patch?.finished_at ? { finished_at: patch.finished_at.toISOString() } : {}),
        })
        .eq("id", sessionId)
        .in("status", from)
        .select("id");
      if (error) fail("sessions.transition", error);
      return (data?.length ?? 0) > 0;
    },

    async abandonReady(userId) {
      const { error } = await db
        .from("sessions")
        .update({ status: "abandoned" })
        .eq("user_id", userId)
        .eq("status", "ready");
      if (error) fail("sessions.abandon", error);
    },

    async createGenerating(userId) {
      const { data, error } = await db
        .from("sessions")
        .insert({ user_id: userId, kind: "daily", status: "generating" })
        .select("id")
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error || !data) fail("sessions.insert", error);
      return data.id as string;
    },

    async setPlan(sessionId, plan, focusTopicId) {
      const { error } = await db.from("sessions").update({ plan, focus_topic_id: focusTopicId }).eq("id", sessionId);
      if (error) fail("sessions.plan", error);
    },

    async setRating(sessionId, patch) {
      const { error } = await db.from("sessions").update(patch).eq("id", sessionId);
      if (error) fail("sessions.rating", error);
    },

    // --- items ---
    async insertItems(sessionId, userId, rows) {
      const { data, error } = await db
        .from("items")
        .insert(
          rows.map((r) => ({
            session_id: sessionId,
            user_id: userId,
            position: r.position,
            topic_id: r.topic_id,
            activity_type: r.activity_type,
            skill: r.skill,
            mode: r.mode,
            purpose: r.purpose,
            interest: r.interest,
            l1_target: r.l1_target,
            payload: r.payload,
          })),
        )
        .select("id, position");
      if (error || !data) fail("items.insert", error);
      const idByPos = new Map(data.map((d) => [Number(d.position), d.id as string]));
      const keys = rows.map((r) => ({ item_id: idByPos.get(r.position)!, key: r.key }));
      const { error: keyError } = await db.from("item_keys").insert(keys);
      if (keyError) fail("item_keys.insert", keyError);
    },

    async listItems(sessionId) {
      const { data, error } = await db.from("items").select(ITEM_COLS).eq("session_id", sessionId).order("position");
      if (error) fail("items", error);
      return (data ?? []).map(toItem);
    },

    async getItem(userId, itemId) {
      const { data, error } = await db
        .from("items")
        .select(ITEM_COLS)
        .eq("id", itemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("items", error);
      return data ? toItem(data) : null;
    },

    async getItemKey(itemId) {
      const { data, error } = await db.from("item_keys").select("key").eq("item_id", itemId).maybeSingle();
      if (error) fail("item_keys", error);
      return data ? (data.key as ItemKey) : null;
    },

    // --- attempts ---
    async listAttempts(itemIds) {
      if (itemIds.length === 0) return [];
      const { data, error } = await db.from("attempts").select(ATTEMPT_COLS).in("item_id", itemIds).order("created_at");
      if (error) fail("attempts", error);
      return (data ?? []).map(toAttempt);
    },

    async getAttempt(userId, attemptId) {
      const { data, error } = await db
        .from("attempts")
        .select(ATTEMPT_COLS)
        .eq("id", attemptId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("attempts", error);
      return data ? toAttempt(data) : null;
    },

    async insertAttempt(row) {
      const { data, error } = await db.from("attempts").insert(row).select("id").single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error || !data) fail("attempts.insert", error);
      return data.id as string;
    },

    async setExplainOpened(attemptId, opened) {
      const { error } = await db.from("attempts").update({ explain_opened: opened }).eq("id", attemptId);
      if (error) fail("attempts.explain", error);
    },

    async insertErrorEvents(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("error_events").insert(rows);
      if (error) fail("error_events.insert", error);
    },

    // --- mastery ve etkinlik verimi ---
    async listMastery(userId, topicIds) {
      let q = db
        .from("mastery")
        .select("topic_id, skill, score, n, correct, last_seen_at, next_review_at")
        .eq("user_id", userId);
      if (topicIds) q = q.in("topic_id", topicIds);
      const { data, error } = await q;
      if (error) fail("mastery", error);
      return (data ?? []).map((r) => ({
        topic_id: r.topic_id as string,
        skill: r.skill as Skill,
        score: Number(r.score),
        n: Number(r.n),
        correct: Number(r.correct),
        last_seen_at: date(r.last_seen_at),
        next_review_at: date(r.next_review_at),
      }));
    },

    async upsertMastery(userId, rows, now) {
      if (rows.length === 0) return;
      const { error } = await db.from("mastery").upsert(
        rows.map((r) => ({
          user_id: userId,
          topic_id: r.topic_id,
          skill: r.skill,
          score: r.score,
          n: r.n,
          correct: r.correct,
          last_seen_at: r.last_seen_at?.toISOString() ?? null,
          next_review_at: r.next_review_at?.toISOString() ?? null,
          updated_at: now.toISOString(),
        })),
        { onConflict: "user_id,topic_id,skill" },
      );
      if (error) fail("mastery.upsert", error);
    },

    async listFocusCandidates(userId, topicId) {
      const { data, error } = await db
        .from("items")
        .select("id, topic_id, activity_type, purpose, credited, created_at")
        .eq("user_id", userId)
        .eq("topic_id", topicId)
        .eq("purpose", "focus")
        .eq("credited", false);
      if (error) fail("items.focus", error);
      return (data ?? []).map((r) => ({
        item_id: r.id as string,
        topic_id: r.topic_id as string,
        activity_type: r.activity_type as ActivityType,
        purpose: r.purpose as Purpose,
        credited: Boolean(r.credited),
        created_at: date(r.created_at)!,
      }));
    },

    async applyCredit(userId, credit, now) {
      // Önce etkinlik işaretlenir; satır zaten işaretliyse (yarış) sayaç artırılmaz.
      const { data: marked, error: markError } = await db
        .from("items")
        .update({ credited: true })
        .eq("id", credit.focus_item_id)
        .eq("credited", false)
        .select("id");
      if (markError) fail("items.credit", markError);
      if ((marked?.length ?? 0) === 0) return;
      const { data: stat, error: statError } = await db
        .from("activity_stats")
        .select("taught_n, retained_n")
        .eq("user_id", userId)
        .eq("activity_type", credit.activity_type)
        .maybeSingle();
      if (statError) fail("activity_stats", statError);
      const { error } = await db.from("activity_stats").upsert(
        {
          user_id: userId,
          activity_type: credit.activity_type,
          taught_n: Number(stat?.taught_n ?? 0) + credit.taught_inc,
          retained_n: Number(stat?.retained_n ?? 0) + credit.retained_inc,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id,activity_type" },
      );
      if (error) fail("activity_stats.upsert", error);
    },

    // --- teşhis ---
    async listActiveDiagnoses(userId) {
      const { data, error } = await db
        .from("diagnoses")
        .select("id, topic_id, kind, weak_skill, weak_activity, status")
        .eq("user_id", userId)
        .eq("status", "active");
      if (error) fail("diagnoses", error);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        topic_id: r.topic_id as string,
        kind: r.kind as DiagnosisRow["kind"],
        weak_skill: (r.weak_skill as Skill | null) ?? null,
        weak_activity: (r.weak_activity as ActivityType | null) ?? null,
        status: "active" as const,
      }));
    },

    async listTopicAttempts(userId, topicIds) {
      if (topicIds.length === 0) return [];
      const { data, error } = await db
        .from("attempts")
        .select("is_correct, items!inner(topic_id, skill, activity_type)")
        .eq("user_id", userId)
        .not("is_correct", "is", null)
        .in("items.topic_id", topicIds);
      if (error) fail("attempts.topic", error);
      return (data ?? []).flatMap((r) => {
        const item = (Array.isArray(r.items) ? r.items[0] : r.items) as Row | undefined;
        if (!item || !isActivityType(String(item.activity_type))) return [];
        return [
          {
            topic_id: item.topic_id as string,
            skill: item.skill as Skill,
            activity_type: item.activity_type as ActivityType,
            is_correct: Boolean(r.is_correct),
          },
        ];
      });
    },

    async insertDiagnosis(userId, row) {
      const { data, error } = await db
        .from("diagnoses")
        .insert({ ...row, user_id: userId, status: "active" })
        .select("id")
        .single();
      if (error || !data) fail("diagnoses.insert", error);
      return data.id as string;
    },

    async updateDiagnosisStatus(id, status) {
      const { error } = await db.from("diagnoses").update({ status }).eq("id", id);
      if (error) fail("diagnoses.status", error);
    },

    async markDiagnosisShown(id, at) {
      const { error } = await db.from("diagnoses").update({ shown_at: at.toISOString() }).eq("id", id);
      if (error) fail("diagnoses.shown", error);
    },

    async getDiagnosisShownAt(userId, at) {
      const { data, error } = await db
        .from("diagnoses")
        .select(DIAGNOSIS_COLS)
        .eq("user_id", userId)
        .eq("shown_at", at.toISOString())
        .limit(1)
        .maybeSingle();
      if (error) fail("diagnoses", error);
      return data ? toDiagnosis(data) : null;
    },

    async getDiagnosis(userId, id) {
      const { data, error } = await db
        .from("diagnoses")
        .select(DIAGNOSIS_COLS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("diagnoses", error);
      return data ? toDiagnosis(data) : null;
    },

    async setDiagnosisFeedback(id, feedback) {
      const { error } = await db.from("diagnoses").update({ user_feedback: feedback }).eq("id", id);
      if (error) fail("diagnoses.feedback", error);
    },

    // --- profil ve planlayıcı girdileri ---
    async getLearner(userId) {
      const { data, error } = await db
        .from("profiles")
        .select("level_est, interests, explain_mode")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) fail("profiles", error);
      return {
        level_est: data.level_est === "A2" ? "A2" : "A1",
        interests: ((data.interests as string[] | null) ?? []).filter(isInterest),
        explain_mode: data.explain_mode === "long" ? "long" : "short",
      };
    },

    async updateProfile(userId, patch, now) {
      const { error } = await db
        .from("profiles")
        .update({ ...patch, updated_at: now.toISOString() })
        .eq("id", userId);
      if (error) fail("profiles.update", error);
    },

    async loadTopics() {
      if (topicsCache && performance.now() - topicsCache.at < TAXONOMY_TTL_MS) return topicsCache.rows;
      const { data, error } = await db
        .from("topics")
        .select("id, level, kind, title_tr, l1_risk, prereqs, sort, active");
      if (error) fail("topics", error);
      const rows = (data ?? []).map((r) => ({
        id: r.id as string,
        level: r.level as "A1" | "A2",
        kind: r.kind as "grammar" | "pron",
        title_tr: r.title_tr as string,
        l1_risk: Number(r.l1_risk) as 0 | 1 | 2,
        prereqs: (r.prereqs as string[] | null) ?? [],
        sort: Number(r.sort),
        active: Boolean(r.active),
      }));
      if (rows.length > 0) topicsCache = { at: performance.now(), rows };
      return rows;
    },

    async loadL1Codes() {
      if (codesCache && performance.now() - codesCache.at < TAXONOMY_TTL_MS) return codesCache.rows;
      const { data, error } = await db.from("l1_codes").select("code, topic_id");
      if (error) fail("l1_codes", error);
      const rows = (data ?? []).map((r) => ({ code: r.code as string, topic_id: (r.topic_id as string | null) ?? null }));
      if (rows.length > 0) codesCache = { at: performance.now(), rows };
      return rows;
    },

    async listActivityStats(userId) {
      const { data, error } = await db
        .from("activity_stats")
        .select("activity_type, taught_n, retained_n")
        .eq("user_id", userId);
      if (error) fail("activity_stats", error);
      return (data ?? []).map((r) => ({
        activity_type: r.activity_type as ActivityType,
        taught_n: Number(r.taught_n),
        retained_n: Number(r.retained_n),
      }));
    },

    async listRecentErrors(userId, since) {
      const { data, error } = await db
        .from("error_events")
        .select("topic_id, skill, l1_code, created_at")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .not("topic_id", "is", null);
      if (error) fail("error_events", error);
      return (data ?? []).map((r) => ({
        topic_id: r.topic_id as string,
        skill: r.skill as Skill,
        l1_code: r.l1_code as string,
        created_at: date(r.created_at)!,
      }));
    },

    async getSchoolTopic(userId, weekStart) {
      const { data, error } = await db
        .from("school_topics")
        .select("topic_id")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) fail("school_topics", error);
      return (data?.topic_id as string | null) ?? null;
    },

    async loadSessionSettings() {
      const keys = ["tts_enabled", "general_content_rate", "review_sample_rate"];
      const { data, error } = await db.from("app_settings").select("key, value").in("key", keys);
      if (error) fail("app_settings", error);
      const map = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]));
      const tts = map.get("tts_enabled");
      const general = map.get("general_content_rate");
      const sample = map.get("review_sample_rate");
      // Eksik ya da geçersiz ayar sessizce varsayılana düşmez.
      if (typeof tts !== "boolean" || typeof general !== "number" || typeof sample !== "number") {
        throw new Error("app_settings eksik ya da geçersiz: tts_enabled, general_content_rate, review_sample_rate");
      }
      return { tts_enabled: tts, general_content_rate: general, review_sample_rate: sample };
    },

    async explainStats(userId, sessions) {
      const { data: recent, error: sessionError } = await db
        .from("sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "daily")
        .eq("status", "done")
        .order("finished_at", { ascending: false })
        .limit(sessions);
      if (sessionError) fail("sessions.recent", sessionError);
      const ids = (recent ?? []).map((r) => r.id as string);
      if (ids.length === 0) return { wrong: 0, opened: 0 };
      const { data, error } = await db
        .from("attempts")
        .select("explain_opened, items!inner(session_id)")
        .eq("user_id", userId)
        .eq("is_correct", false)
        .in("items.session_id", ids);
      if (error) fail("attempts.explain_stats", error);
      const rows = data ?? [];
      return { wrong: rows.length, opened: rows.filter((r) => r.explain_opened).length };
    },

    // --- olaylar ---
    async insertEvent(userId, name, props) {
      const { error } = await db.from("events").insert({ user_id: userId, name, props: props ?? null });
      if (error) fail("events.insert", error);
    },

    async hintOpened(userId, itemId) {
      const { count, error } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("name", "hint_open")
        .eq("props->>item_id", itemId);
      if (error) fail("events.hint", error);
      return (count ?? 0) > 0;
    },
  };
}
