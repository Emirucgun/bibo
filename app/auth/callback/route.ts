import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/auth/origin";
import { INVITE_COOKIE, isValidInviteCode } from "@/lib/auth/paths";
import { createClient } from "@/lib/db/server";

// GET /auth/callback?code=… (SPEC Bölüm 6): Google dönüşünde kodu oturuma çevirir, çerezi kurar.
// Davet çerezi varsa /davet/<kod>'a (kod dolu gelir), yoksa ana sayfaya; kapı gerisini yönlendirir.
export async function GET(request: NextRequest) {
  const headerList = await headers();
  const origin =
    requestOrigin({
      forwardedHost: headerList.get("x-forwarded-host"),
      forwardedProto: headerList.get("x-forwarded-proto"),
      host: headerList.get("host"),
    }) ?? request.nextUrl.origin;

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/giris?hata=oauth`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error.code ?? error.status ?? error.name);
    return NextResponse.redirect(`${origin}/giris?hata=oauth`);
  }

  const invite = (await cookies()).get(INVITE_COOKIE)?.value;
  const next = isValidInviteCode(invite) ? `/davet/${encodeURIComponent(invite)}` : "/";
  return NextResponse.redirect(`${origin}${next}`);
}
