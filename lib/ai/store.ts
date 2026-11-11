// Yapay zekâ katmanının veritabanı arayüzü. Guard ve üretim akışı bu arayüze bağlıdır;
// testler bellek içi sahte uygulama kullanır. Supabase uygulaması servis istemcisini
// parametre olarak alır (Route Handler'da `createAdminClient()`, betiklerde env'den).
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_SETTING_KEYS, parseAiSettings, type AiSettings } from "./settings";

export const USAGE_PURPOSES = ["generate", "grade", "transcribe", "tts", "placement"] as const;
export type UsagePurpose = (typeof USAGE_PURPOSES)[number];

/**
 * `llm_usage` satırı. Yalnızca kimlikler ve sayılar: komut, öğrenci metni, transkript
 * ya da model çıktısı buraya YAZILMAZ (SPEC 3, 11). `error` kısa bir koddur.
 */
export interface LlmUsageRow {
  user_id: string | null;
  session_id: string | null;
  purpose: UsagePurpose;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number;
  cache_write_tokens: number;
  audio_seconds: number | null;
  tts_chars: number | null;
  cost_usd: number;
  latency_ms: number;
  ok: boolean;
  error: string | null;
}

export interface AiStore {
  loadSettings(): Promise<AiSettings>;
  /** `since`'ten bu yana `sum(llm_usage.cost_usd)`. */
  costSince(since: Date): Promise<number>;
  /** Öğrencinin `since`'ten bu yana başlattığı (`started_at`) günlük oturum sayısı. */
  sessionsStartedSince(userId: string, since: Date): Promise<number>;
  insertUsage(row: LlmUsageRow): Promise<void>;
  addSessionCost(sessionId: string, usd: number): Promise<void>;
}

export function createSupabaseAiStore(db: SupabaseClient): AiStore {
  return {
    async loadSettings() {
      const { data, error } = await db
        .from("app_settings")
        .select("key, value")
        .in("key", AI_SETTING_KEYS);
      if (error) throw new Error(`app_settings okunamadı: ${error.code}`);
      return parseAiSettings(data ?? []);
    },

    async costSince(since) {
      const { data, error } = await db.rpc("llm_cost_since", { since: since.toISOString() });
      if (error) throw new Error(`llm_cost_since: ${error.code}`);
      return Number(data ?? 0);
    },

    async sessionsStartedSince(userId, since) {
      const { count, error } = await db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "daily")
        .gte("started_at", since.toISOString());
      if (error) throw new Error(`sessions sayılamadı: ${error.code}`);
      return count ?? 0;
    },

    async insertUsage(row) {
      const { error } = await db.from("llm_usage").insert(row);
      if (error) throw new Error(`llm_usage yazılamadı: ${error.code}`);
    },

    async addSessionCost(sessionId, usd) {
      const { error } = await db.rpc("add_session_cost", { p_session_id: sessionId, p_usd: usd });
      if (error) throw new Error(`add_session_cost: ${error.code}`);
    },
  };
}
