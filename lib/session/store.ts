// `SessionStore`'un Supabase uygulaması. Yazan yollar servis istemcisini (`createAdminClient()`,
// `requireOnboarded()` sonrası) verir ve her sorgu `user_id` ile süzülür; yalnızca okuyan
// `GET /api/sessions/:id` kullanıcının kendi istemcisini (RLS) verir.
// IMPORTANT: `items` hiçbir yerde `select *` ile okunmaz; `item_keys` yalnızca `getItemKey`'de.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isActivityType, type ActivityType, type Mode, type Purpose, type Skill } from "@/lib/content/activity-types";
import { isInterest } from "@/lib/content/interests";
import type { EngineL1Code, EngineTopic, Goal, ItemKey, StudyMode, TopicKind, TopicLevel } from "@/lib/engine/types";
import type {
  AttemptRow,
  DiagnosisRow,
  EvidenceRow,
  ScopeStatus,
  ItemPayload,
  ItemRow,
  SessionRow,
  SessionStatus,
  SessionStore,
} from "./types";

const SESSION_COLS = "id, user_id, kind, status, focus_topic_id, created_at, started_at, finished_at, rating";
const ITEM_COLS =
  "id, session_id, user_id, position, topic_id, activity_type, skill, mode, purpose, interest, l1_target, payload, bank_item_id";
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
    bank_item_id: (r.bank_item_id as string | null) ?? null,
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

    async findPlacement(userId) {
      const { data, error } = await db
        .from("sessions")
        .select(SESSION_COLS)
        .eq("user_id", userId)
        .eq("kind", "placement")
        .in("status", ["generating", "ready", "active", "done"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) fail("sessions.placement", error);
      return data && data[0] ? toSession(data[0]) : null;
    },

    async createPlacement(userId) {
      const { data, error } = await db
        .from("sessions")
        .insert({ user_id: userId, kind: "placement", status: "generating" })
        .select("id")
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error || !data) fail("sessions.insert", error);
      return data.id as string;
    },

    async completePlacement(userId, result, now) {
      const { data, error } = await db
        .from("profiles")
        .update({
          level_est: result.level_est,
          scope_status: result.scope_status,
          placement_result: result.placement_result as never,
          placement_done_at: now.toISOString(),
          onboarding_step: "done",
          updated_at: now.toISOString(),
        })
        .eq("id", userId)
        .eq("onboarding_step", "placement")
        .select("id");
      if (error) fail("profiles.placement", error);
      return (data?.length ?? 0) > 0;
    },

    async countPlacements(userId) {
      const { count, error } = await db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "placement")
        .eq("status", "done");
      if (error) fail("sessions.placement_count", error);
      return count ?? 0;
    },

    async reopenPlacement(userId, now) {
      const { data, error } = await db
        .from("profiles")
        .update({ onboarding_step: "placement", scope_status: "in_scope", updated_at: now.toISOString() })
        .eq("id", userId)
        .eq("onboarding_step", "done")
        .eq("scope_status", "above_scope")
        .select("id");
      if (error) fail("profiles.reopen", error);
      return (data?.length ?? 0) > 0;
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
            bank_item_id: r.bank_item_id ?? null,
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

    // --- öğrenme profili, mastery önbelleği ve etkinlik verimi ---
    async getLearnerState(userId) {
      const { data, error } = await db
        .from("learner_state")
        .select("version, state, n_obs")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("learner_state", error);
      return data ? { version: Number(data.version), state: data.state, n_obs: Number(data.n_obs) } : null;
    },

    async saveLearnerState(userId, row, now) {
      const { error } = await db.from("learner_state").upsert(
        {
          user_id: userId,
          version: row.version,
          state: row.state as never,
          n_obs: row.n_obs,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) fail("learner_state.upsert", error);
    },

    async listEvidence(userId) {
      const out: (EvidenceRow & { item_id: string; try_no: number })[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("attempts")
          .select(
            "item_id, try_no, score, hint_used, evidence_weight, incidental, created_at, items!inner(topic_id, skill, mode, bank_item_id, activity_type, sessions!inner(status))",
          )
          .eq("user_id", userId)
          .not("score", "is", null)
          .order("created_at")
          .range(from, from + PAGE - 1);
        if (error) fail("attempts.evidence", error);
        const rows = data ?? [];
        // Konuşmada iki deneme olabilir: etkinlik başına son değerlendirilmiş deneme (PLAN karar 18).
        for (const r of rows) {
          const item = (Array.isArray(r.items) ? r.items[0] : r.items) as Row | undefined;
          if (!item) continue;
          const session = (Array.isArray(item.sessions) ? item.sessions[0] : item.sessions) as Row | undefined;
          // Canlı yolla aynı kural: konuşmanın 1. denemesi oturum bitince (ya da 2. deneme gelince) sayılır.
          if (item.activity_type === "speak_answer" && Number(r.try_no) === 1 && session?.status !== "done") continue;
          out.push({
            item_id: r.item_id as string,
            try_no: Number(r.try_no),
            topic_id: item.topic_id as string,
            skill: item.skill as Skill,
            mode: item.mode as Mode,
            bank_item_id: (item.bank_item_id as string | null) ?? null,
            score: Number(r.score),
            evidence_weight: num(r.evidence_weight),
            hint_used: Boolean(r.hint_used),
            incidental: (r.incidental as EvidenceRow["incidental"]) ?? null,
            created_at: date(r.created_at)!,
          });
        }
        if (rows.length < PAGE) break;
      }
      const last = new Map<string, number>();
      for (const r of out) last.set(r.item_id, Math.max(last.get(r.item_id) ?? 0, r.try_no));
      return out
        .filter((r) => r.try_no === last.get(r.item_id))
        .map((r) => ({
          topic_id: r.topic_id,
          skill: r.skill,
          mode: r.mode,
          bank_item_id: r.bank_item_id,
          score: r.score,
          evidence_weight: r.evidence_weight,
          hint_used: r.hint_used,
          incidental: r.incidental,
          created_at: r.created_at,
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
        .select("item_id, try_no, is_correct, items!inner(topic_id, skill, activity_type)")
        .eq("user_id", userId)
        .not("is_correct", "is", null)
        .in("items.topic_id", topicIds);
      if (error) fail("attempts.topic", error);
      // Konuşmada iki deneme olabilir: etkinlik başına son değerlendirilmiş deneme (PLAN karar 18).
      const last = new Map<string, number>();
      for (const r of data ?? []) {
        last.set(r.item_id as string, Math.max(last.get(r.item_id as string) ?? 0, Number(r.try_no)));
      }
      return (data ?? []).filter((r) => Number(r.try_no) === last.get(r.item_id as string)).flatMap((r) => {
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
        .select(
          "level_est, level_self, interests, explain_mode, onboarding_step, scope_status, study_mode, goal, program_id, focus_choice, placement_done_at",
        )
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) fail("profiles", error);
      return {
        level_est: data.level_est === "A2" ? "A2" : "A1",
        level_self: (data.level_self as string | null) ?? null,
        interests: ((data.interests as string[] | null) ?? []).filter(isInterest),
        explain_mode: data.explain_mode === "long" ? "long" : "short",
        onboarding_step: data.onboarding_step as string,
        scope_status: (data.scope_status as ScopeStatus | null) ?? "in_scope",
        study_mode: (data.study_mode as StudyMode | null) ?? null,
        goal: (data.goal as Goal | null) ?? null,
        program_id: (data.program_id as string | null) ?? null,
        focus_choice: (data.focus_choice as string | null) ?? null,
        placement_done_at: date(data.placement_done_at),
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
        .select("id, level, kind, title_tr, l1_risk, prereqs, sort, active, irt_b, unit, value, exam_weight, confusables, goal_tags");
      if (error) fail("topics", error);
      const rows: EngineTopic[] = (data ?? []).map((r) => ({
        id: r.id as string,
        level: r.level as TopicLevel,
        kind: r.kind as TopicKind,
        title_tr: r.title_tr as string,
        l1_risk: Number(r.l1_risk) as 0 | 1 | 2,
        prereqs: (r.prereqs as string[] | null) ?? [],
        sort: Number(r.sort),
        active: Boolean(r.active),
        irt_b: num(r.irt_b),
        unit: Number(r.unit ?? 0),
        value: Number(r.value ?? 2),
        exam_weight: Number(r.exam_weight ?? 1),
        confusables: (r.confusables as string[] | null) ?? [],
        goal_tags: ((r.goal_tags as string[] | null) ?? []) as Goal[],
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

    async getProgramTopic(programId, weekStart) {
      const { data, error } = await db
        .from("program_weeks")
        .select("topic_id")
        .eq("program_id", programId)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) fail("program_weeks", error);
      return (data?.topic_id as string | null) ?? null;
    },

    async listRecentFocus(userId, n) {
      const { data, error, count } = await db
        .from("sessions")
        .select("focus_topic_id", { count: "exact" })
        .eq("user_id", userId)
        .eq("kind", "daily")
        .eq("status", "done")
        .order("finished_at", { ascending: false })
        .limit(n);
      if (error) fail("sessions.recent_focus", error);
      return { recent: (data ?? []).map((r) => (r.focus_topic_id as string | null) ?? null), done: count ?? 0 };
    },

    async loadModelSettings() {
      const keys = ["placement_model", "learner_model", "continuous_gate_p", "retest_after_days", "grade_samples", "curriculum"];
      const { data, error } = await db.from("app_settings").select("key, value").in("key", keys);
      if (error) fail("app_settings", error);
      const map = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]));
      const obj = (k: string) => {
        const v = map.get(k);
        return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      };
      const placement = obj("placement_model");
      const learner = obj("learner_model");
      const curriculum = obj("curriculum");
      const gate = map.get("continuous_gate_p");
      const retest = map.get("retest_after_days");
      const samples = map.get("grade_samples");
      if (
        !placement ||
        !learner ||
        typeof learner.version !== "number" ||
        !curriculum ||
        typeof curriculum.coverage_a1 !== "number" ||
        typeof curriculum.coverage_a2 !== "number" ||
        typeof gate !== "number" ||
        typeof retest !== "number" ||
        typeof samples !== "number"
      ) {
        throw new Error(`app_settings eksik ya da geçersiz: ${keys.join(", ")}`);
      }
      return {
        placement_model: placement,
        learner_model: learner,
        continuous_gate_p: gate,
        retest_after_days: retest,
        grade_samples: samples,
        coverage: { a1: curriculum.coverage_a1, a2: curriculum.coverage_a2 },
      };
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
