import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Servis istemcisi: RLS'i atlar. Yalnızca Route Handler'larda,
// requireUser() / requireRole() sonrası yazmalar için kullanılır (M2'den itibaren).
let client: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SECRET_KEY tanımlı olmalı",
    );
  }

  client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
