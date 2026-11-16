import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLlmClient } from "@/lib/ai/client";
import { createSupabaseAiStore } from "@/lib/ai/store";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import type { SessionDeps } from "./service";
import { createSessionStore } from "./store";
import type { SessionStore } from "./types";

/** Yazan uç noktalar için: servis istemcisi. Yalnızca `requireOnboarded()` sonrası çağrılır. */
export function createSessionDeps(): SessionDeps {
  const admin = createAdminClient();
  return {
    store: createSessionStore(admin),
    ai: { store: createSupabaseAiStore(admin), llm: createLlmClient() },
    now: () => new Date(),
    rng: Math.random,
  };
}

/** Yalnızca okuyan uç noktalar için: kullanıcının kendi istemcisi (RLS). */
export async function createReadStore(): Promise<SessionStore> {
  return createSessionStore((await createClient()) as unknown as SupabaseClient);
}
