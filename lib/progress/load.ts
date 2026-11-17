import "server-only";
import { createClient } from "@/lib/db/server";
import { buildProgress, istanbulWeek, TOP_ERROR_DAYS, type Progress } from "./progress";

/** İlerleme verisi kullanıcının kendi istemcisiyle (RLS) okunur. */
export async function loadProgress(userId: string, now: Date): Promise<Progress> {
  const db = await createClient();
  const week = istanbulWeek(now);
  const since = new Date(now.getTime() - TOP_ERROR_DAYS * 86_400_000).toISOString();
  const [profile, mastery, sessions, errors, diagnoses] = await Promise.all([
    db.from("profiles").select("level_est").eq("id", userId).maybeSingle(),
    db.from("mastery").select("topic_id, skill, score, n").eq("user_id", userId),
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
  for (const r of [profile, mastery, sessions, errors, diagnoses]) {
    if (r.error) throw new Error(`progress: ${r.error.code}`);
  }
  return buildProgress({
    levelEst: profile.data?.level_est === "A2" ? "A2" : "A1",
    mastery: (mastery.data ?? []).map((m) => ({ topic_id: m.topic_id, skill: m.skill, score: Number(m.score), n: Number(m.n) })),
    weekSessions: sessions.count ?? 0,
    errorCodes: (errors.data ?? []).map((e) => e.l1_code as string),
    diagnoses: (diagnoses.data ?? []) as { id: string; topic_id: string; message_tr: string }[],
  });
}

/** Bu haftanın okul konusu sorusu cevaplandı mı (`null` = hatırlamıyor / atladı da cevaptır). */
export async function schoolTopicAnswered(userId: string, now: Date): Promise<boolean> {
  const db = await createClient();
  const { data, error } = await db
    .from("school_topics")
    .select("user_id")
    .eq("user_id", userId)
    .eq("week_start", istanbulWeek(now).date)
    .maybeSingle();
  if (error) return true; // soru gösterilmesin; ana sayfa kırılmasın
  return data !== null;
}
