import "server-only";
// Günlük bakım işi (SPEC 6 "Günlük cron işi", 13). Yalnızca sayılar döner ve günlüğe yazılır.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TTS_BUCKET } from "@/lib/tts/cache";
import { listVoices, pickDefaultVoice } from "@/lib/tts/voices";
import { cronAuthorized, CRON_LIMITS } from "./auth";

export { cronAuthorized };

const iso = (d: Date) => d.toISOString();

export async function runDailyCron(db: SupabaseClient, now: Date, opts: { speechifyKey?: string } = {}) {
  const t = now.getTime();
  const out: Record<string, number | string | null> = {};

  // 1) 72 saatten eski `ready` oturumlar bırakılır: sonraki `next` güncel ustalıkla yeniden planlar.
  const ready = await db
    .from("sessions")
    .update({ status: "abandoned" })
    .eq("status", "ready")
    .lt("created_at", iso(new Date(t - CRON_LIMITS.readyMs)))
    .select("id");
  if (ready.error) throw new Error(`cron.ready: ${ready.error.code}`);
  out.ready_abandoned = ready.data?.length ?? 0;

  // 2) 24 saatten eski `active` oturumlar `abandoned`.
  const active = await db
    .from("sessions")
    .update({ status: "abandoned" })
    .eq("status", "active")
    .lt("started_at", iso(new Date(t - CRON_LIMITS.activeMs)))
    .select("id");
  if (active.error) throw new Error(`cron.active: ${active.error.code}`);
  out.active_abandoned = active.data?.length ?? 0;

  // 3) Takılı kalmış üretimler.
  const stuck = await db
    .from("sessions")
    .update({ status: "failed" })
    .eq("status", "generating")
    .lt("created_at", iso(new Date(t - CRON_LIMITS.generatingMs)))
    .select("id");
  if (stuck.error) throw new Error(`cron.generating: ${stuck.error.code}`);
  out.generating_failed = stuck.data?.length ?? 0;

  // 4) 21 gündür kullanılmayan seslendirme dosyaları.
  const old = await db
    .from("tts_cache")
    .select("hash, storage_path")
    .lt("last_used_at", iso(new Date(t - CRON_LIMITS.ttsUnusedMs)))
    .limit(1000);
  if (old.error) throw new Error(`cron.tts: ${old.error.code}`);
  const rows = old.data ?? [];
  if (rows.length > 0) {
    const paths = rows.map((r) => String(r.storage_path).replace(`${TTS_BUCKET}/`, ""));
    const removed = await db.storage.from(TTS_BUCKET).remove(paths);
    if (removed.error) throw new Error(`cron.tts.remove: ${removed.error.message.slice(0, 60)}`);
    const del = await db.from("tts_cache").delete().in("hash", rows.map((r) => r.hash as string));
    if (del.error) throw new Error(`cron.tts.delete: ${del.error.code}`);
  }
  out.tts_deleted = rows.length;

  // 5) Ses seçilmemişse varsayılan ses (PLAN karar 37).
  out.tts_voice_set = null;
  if (opts.speechifyKey) {
    try {
      const { data } = await db.from("app_settings").select("key, value").in("key", ["tts_voice", "tts_model"]);
      const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
      if (!map.get("tts_voice") && typeof map.get("tts_model") === "string") {
        const voice = pickDefaultVoice(await listVoices(opts.speechifyKey), map.get("tts_model") as string);
        if (voice) {
          await db.from("app_settings").update({ value: voice.id, updated_at: iso(now) }).eq("key", "tts_voice");
          out.tts_voice_set = voice.id;
        }
      }
    } catch (err) {
      out.tts_voice_error = err instanceof Error ? err.message.slice(0, 60) : "unknown";
    }
  }

  // 6) Dünün maliyet özeti (yalnızca sayı).
  const day = await db.rpc("llm_cost_since", { since: iso(new Date(t - 86_400_000)) });
  out.cost_last_24h_usd = day.error ? null : Number(day.data ?? 0);
  return out;
}
