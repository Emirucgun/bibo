// eval betiklerinin ortak kurulumu: argümanlar, depo ve istemci.
// Gerçek API çağırır: çalıştırmadan önce tahmini maliyetle onay alın (CLAUDE.md).
import { createClient } from "@supabase/supabase-js";
import { createLlmClient } from "@/lib/ai/client";
import { createSupabaseAiStore, type AiStore } from "@/lib/ai/store";
import { MemoryAiStore, MIGRATION_DEFAULTS, RecordingStore } from "./eval";

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * `--no-db`: llm_usage satırları yalnızca bellekte, ayarlar göç varsayılanları.
 * Aksi hâlde dev veritabanı (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).
 */
export function setupDeps(): { store: RecordingStore; llm: ReturnType<typeof createLlmClient>; db: boolean } {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY tanımlı değil (--env-file)");
  let inner: AiStore;
  const noDb = flag("no-db");
  if (noDb) {
    inner = new MemoryAiStore(MIGRATION_DEFAULTS);
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Supabase değişkenleri yok; --no-db ile çalıştırabilirsin");
    inner = createSupabaseAiStore(
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  }
  return { store: new RecordingStore(inner), llm: createLlmClient(), db: !noDb };
}

export const fmtUsd = (x: number) => `${x.toFixed(5)} $`;
export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)} sn`;
