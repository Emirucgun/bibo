import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Verimi indir (PRD F13, SPEC 6 `GET /api/account/export`). Öğrencinin tüm tablolardaki kayıtları.
// `item_keys` öğrenci verisi değildir (cevap anahtarı) ve dışa aktarılmaz.
export const EXPORT_TABLES: { table: string; cols: string; key: "user_id" | "id" }[] = [
  { table: "profiles", cols: "id, display_name, role, cohort_id, level_self, level_est, interests, explain_mode, adult_confirmed_at, consent_version, consent_at, onboarding_step, created_at, updated_at", key: "id" },
  { table: "sessions", cols: "id, kind, status, focus_topic_id, created_at, started_at, finished_at, rating, comment, cost_usd", key: "user_id" },
  { table: "items", cols: "id, session_id, position, topic_id, activity_type, skill, mode, purpose, interest, payload, created_at", key: "user_id" },
  { table: "attempts", cols: "id, item_id, try_no, response, is_correct, score, time_ms, hint_used, explain_opened, graded_by, feedback_short_tr, explanation_long_tr, correction, created_at", key: "user_id" },
  { table: "error_events", cols: "id, attempt_id, topic_id, skill, activity_type, mode, l1_code, wrong_span, correction, source, created_at", key: "user_id" },
  { table: "mastery", cols: "topic_id, skill, score, n, correct, last_seen_at, next_review_at, updated_at", key: "user_id" },
  { table: "activity_stats", cols: "activity_type, taught_n, retained_n, updated_at", key: "user_id" },
  { table: "diagnoses", cols: "id, topic_id, kind, weak_skill, weak_activity, confidence, evidence, message_tr, status, shown_at, user_feedback, created_at", key: "user_id" },
  { table: "school_topics", cols: "week_start, topic_id, created_at", key: "user_id" },
  { table: "events", cols: "id, name, props, created_at", key: "user_id" },
  { table: "llm_usage", cols: "id, session_id, purpose, provider, model, input_tokens, output_tokens, audio_seconds, tts_chars, cost_usd, latency_ms, ok, created_at", key: "user_id" },
];

const PAGE = 1000;

/** Her tabloyu sayfalayarak okur. `db` servis istemcisidir; her sorgu kullanıcının kimliğiyle süzülür. */
export async function exportUserData(db: SupabaseClient, userId: string, now: Date): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { exported_at: now.toISOString(), user_id: userId };
  for (const { table, cols, key } of EXPORT_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(table).select(cols).eq(key, userId).range(from, from + PAGE - 1);
      if (error) throw new Error(`export ${table}: ${error.code}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    out[table] = rows;
  }
  return out;
}
