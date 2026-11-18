import "server-only";
import { DEFAULT_LEARNER_MODEL_CONFIG } from "@/lib/engine/learner-model";
import { createClient } from "@/lib/db/server";
import { modelContextFor, restoreState } from "@/lib/session/learner";
import { createSessionStore } from "@/lib/session/store";
import { buildProgress, istanbulWeek, TOP_ERROR_DAYS, type Progress } from "./progress";

/** İlerleme verisi kullanıcının kendi istemcisiyle (RLS) okunur. */
export async function loadProgress(userId: string, now: Date): Promise<Progress> {
  const db = await createClient();
  const week = istanbulWeek(now);
  const since = new Date(now.getTime() - TOP_ERROR_DAYS * 86_400_000).toISOString();
  const [profile, stored, topics, sessions, errors, diagnoses] = await Promise.all([
    db.from("profiles").select("level_est").eq("id", userId).maybeSingle(),
    db.from("learner_state").select("version, state").eq("user_id", userId).maybeSingle(),
    createSessionStore(db).loadTopics(),
    db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "daily")
      .eq("status", "done")
      .gte("finished_at", week.start.toISOString()),
    db.from("error_events").select("l1_code").eq("user_id", userId).gte("created_at", since).limit(2000),
    db.from("diagnoses").select("id, topic_id, message_tr").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(5),
  ]);
  for (const r of [profile, stored, sessions, errors, diagnoses]) {
    if (r.error) throw new Error(`progress: ${r.error.code}`);
  }
  // Ayarlar yalnızca yöneticiye açık; görüntülemede saklanan durumun sürümü kabul edilir.
  const ctx = modelContextFor(topics, { version: stored.data?.version ?? DEFAULT_LEARNER_MODEL_CONFIG.version });
  const state = stored.data ? restoreState(ctx, stored.data.state) : null;
  return buildProgress({
    levelEst: profile.data?.level_est === "A2" ? "A2" : "A1",
    model: state ? { ctx, state } : null,
    weekSessions: sessions.count ?? 0,
    errorCodes: (errors.data ?? []).map((e) => e.l1_code as string),
    diagnoses: (diagnoses.data ?? []) as { id: string; topic_id: string; message_tr: string }[],
  });
}
