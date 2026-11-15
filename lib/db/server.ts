import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublicEnv } from "@/lib/db/env";
import type { Database } from "@/lib/db/types";

// Kullanıcı istemcisi: oturum çerezlerini okur, RLS etkin. Okumalar bununla yapılır.
// Her istekte yeniden oluşturulur (istekler arasında paylaşılmaz).
export async function createClient() {
  // Oturum her zaman istek anında okunur: Cache Components'in çerezli ön-render'ına
  // (kısmi ön getirme) girmez. Böylece kapı kararı önbelleğe alınmaz ve auth-js'in
  // token süresi kontrolü (Date.now()) ön-render sırasında çalışmaz.
  await connection();

  const { url, publishableKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component'te çerez yazılamaz; oturumu proxy.ts yeniler.
        }
      },
    },
  });
}
