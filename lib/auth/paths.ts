// proxy.ts'in yönlendirme kararı ve davet çerezi (SPEC Bölüm 7). Saf: Next ya da Supabase yok.

export const INVITE_COOKIE = "invite_code";
/** Davet linki açıldıktan sonra kodun çerezde kalma süresi (saniye): 7 gün. */
export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const INVITE_CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function isValidInviteCode(code: unknown): code is string {
  return typeof code === "string" && INVITE_CODE_RE.test(code);
}

/** `/davet/<kod>` yolundaki kod; yol başka bir şeyse ya da kod biçimi bozuksa `null`. */
export function inviteCodeFromPath(pathname: string): string | null {
  const match = /^\/davet\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let code: string;
  try {
    code = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isValidInviteCode(code) ? code : null;
}

/**
 * Tanıtım sayfasının iç yolu. Girişsiz ziyaretçi `/` adresinde bunu görür (rewrite, bibolearn.com
 * kökü); bu yolun kendisi dışarıdan açılmaz, `/`'e yönlenir. Tek adres: `/`.
 */
export const LANDING_PATH = "/tanitim";

const PUBLIC_PAGES = ["/giris", "/davet", "/gizlilik", "/auth/callback"];

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Giriş yapmadan açılabilen sayfalar. */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((base) => matches(pathname, base));
}

/** API yolları yönlendirilmez: Route Handler kendi 401 yanıtını döner. */
export function isApiPath(pathname: string): boolean {
  return matches(pathname, "/api");
}

export type RouteDecision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "rewrite"; to: string };

/**
 * Girişsiz ziyaretçi `/` adresinde tanıtım sayfasını görür (adres değişmez), diğer korumalı
 * sayfalardan `/giris`'e gider. Giriş yapmış kullanıcı `/giris`'ten ana sayfaya.
 */
export function decideRoute(input: { pathname: string; signedIn: boolean }): RouteDecision {
  const { pathname, signedIn } = input;
  if (isApiPath(pathname)) return { kind: "next" };
  if (matches(pathname, LANDING_PATH)) return { kind: "redirect", to: "/" };
  if (!signedIn) {
    if (pathname === "/") return { kind: "rewrite", to: LANDING_PATH };
    return isPublicPage(pathname) ? { kind: "next" } : { kind: "redirect", to: "/giris" };
  }
  if (matches(pathname, "/giris")) return { kind: "redirect", to: "/" };
  return { kind: "next" };
}
