// `TtsStore`'un Supabase uygulaması. Servis istemcisiyle çağrılır: `tts_cache`, `llm_usage` ve
// `tts` kovası öğrenciye kapalıdır (SPEC 3 RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { TTS_BUCKET, type TtsSettings, type TtsStore } from "./cache";

const fail = (what: string, error: { code?: string; message?: string } | null): never => {
  throw new Error(`${what}: ${error?.code ?? error?.message?.slice(0, 60) ?? "unknown"}`);
};

export function parseTtsSettings(rows: { key: string; value: unknown }[]): TtsSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = map.get("tts_enabled");
  const model = map.get("tts_model");
  const voice = map.get("tts_voice");
  const alert = map.get("tts_monthly_char_alert");
  // Eksik ya da geçersiz ayar sessizce varsayılana düşmez. `tts_voice` boş olabilir (P9).
  if (
    typeof enabled !== "boolean" ||
    typeof model !== "string" ||
    model === "" ||
    !(voice === null || voice === undefined || typeof voice === "string") ||
    typeof alert !== "number"
  ) {
    throw new Error("app_settings eksik ya da geçersiz: tts_enabled, tts_model, tts_voice, tts_monthly_char_alert");
  }
  return {
    tts_enabled: enabled,
    tts_model: model,
    tts_voice: typeof voice === "string" && voice.trim() !== "" ? voice.trim() : null,
    tts_monthly_char_alert: alert,
  };
}

export function createSupabaseTtsStore(db: SupabaseClient): TtsStore {
  return {
    async loadTtsSettings() {
      const { data, error } = await db
        .from("app_settings")
        .select("key, value")
        .in("key", ["tts_enabled", "tts_model", "tts_voice", "tts_monthly_char_alert"]);
      if (error) fail("app_settings", error);
      return parseTtsSettings(data ?? []);
    },

    async getCache(hash) {
      const { data, error } = await db
        .from("tts_cache")
        .select("hash, voice, rate, storage_path, chars")
        .eq("hash", hash)
        .maybeSingle();
      if (error) fail("tts_cache", error);
      return data ? { ...data, rate: Number(data.rate) } : null;
    },

    async upsertCache(row, now) {
      const at = now.toISOString();
      const { error } = await db.from("tts_cache").upsert({ ...row, created_at: at, last_used_at: at });
      if (error) fail("tts_cache.upsert", error);
    },

    async touchCache(hash, now) {
      const { error } = await db.from("tts_cache").update({ last_used_at: now.toISOString() }).eq("hash", hash);
      if (error) fail("tts_cache.touch", error);
    },

    async upload(objectPath, audio) {
      const { error } = await db.storage
        .from(TTS_BUCKET)
        .upload(objectPath, audio, { contentType: "audio/mpeg", upsert: true });
      if (error) fail("storage.upload", { message: error.message });
    },

    async signedUrl(objectPath, seconds) {
      const { data, error } = await db.storage.from(TTS_BUCKET).createSignedUrl(objectPath, seconds);
      if (error || !data) fail("storage.sign", { message: error?.message });
      return data!.signedUrl;
    },

    async lastTtsCall(since) {
      const { data, error } = await db
        .from("llm_usage")
        .select("ok, error, created_at")
        .eq("purpose", "tts")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("llm_usage.tts", error);
      return data ? { ok: Boolean(data.ok), error: (data.error as string | null) ?? null, created_at: new Date(data.created_at) } : null;
    },

    async charsSince(since) {
      const { data, error } = await db.rpc("tts_chars_since", { since: since.toISOString() });
      if (error) fail("tts_chars_since", error);
      return Number(data ?? 0);
    },

    async assignVoice(voiceId, now) {
      const { error } = await db
        .from("app_settings")
        .update({ value: voiceId, updated_at: now.toISOString() })
        .eq("key", "tts_voice");
      if (error) fail("app_settings.tts_voice", error);
    },
  };
}
