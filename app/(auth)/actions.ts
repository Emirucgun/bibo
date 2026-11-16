"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAppOrigin } from "@/lib/auth/origin";
import { createClient } from "@/lib/db/server";

// Google ile giriş (SPEC Bölüm 7): yalnızca Google OAuth; kapsamlar openid, email, profile.
// PKCE doğrulayıcısı çereze yazıldığı için Server Function'da başlatılır.
export async function signInWithGoogle() {
  const headerList = await headers();
  const origin = resolveAppOrigin({
    appUrl: process.env.APP_URL,
    vercelEnv: process.env.VERCEL_ENV,
    forwardedHost: headerList.get("x-forwarded-host"),
    forwardedProto: headerList.get("x-forwarded-proto"),
    host: headerList.get("host"),
  });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) {
    console.error("[giris] oauth start failed:", error?.code ?? error?.status ?? "no url");
    redirect("/giris?hata=oauth");
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/giris");
}
