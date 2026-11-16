import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  decideRoute,
  inviteCodeFromPath,
} from "@/lib/auth/paths";
import { supabasePublicEnv } from "@/lib/db/env";

// Next 16'da middleware'in adı (SPEC Bölüm 7): her istekte oturumu yeniler,
// giriş yapmamış kullanıcıyı /giris'e yönlendirir ve /davet/[code] kodunu çereze yazar.
// Başlangıç kapısı (onboarding_step) burada değil, (app) düzeninde.
export async function proxy(request: NextRequest) {
  const { url, publishableKey } = supabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Oturum çerezi yazan yanıt CDN'de önbelleğe alınmamalı.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims JWT'yi doğrular ve süresi dolmak üzereyse oturumu yeniler (çerezler setAll ile yazılır).
  // Bu çağrı ile yanıt arasına başka kod konmaz.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const decision = decideRoute({ pathname, signedIn });

  if (decision.kind === "redirect") {
    const target = request.nextUrl.clone();
    target.pathname = decision.to;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    // Yenilenen oturum çerezleri yönlendirme yanıtına da taşınır.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  const inviteCode = inviteCodeFromPath(pathname);
  if (inviteCode) {
    response.cookies.set(INVITE_COOKIE, inviteCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: INVITE_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Statik dosyalar ve görseller dışındaki her şey.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
