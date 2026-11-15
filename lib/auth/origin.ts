// OAuth dönüş adresinin kökü (SPEC Bölüm 9 `APP_URL`). Saf.
// Canlıda APP_URL; önizleme ve yerelde isteğin kendi adresi: önizleme adresleri her dağıtımda
// değişir ve PKCE doğrulayıcı çerezi girişin başladığı alan adına yazılır.

export interface OriginInput {
  appUrl: string | undefined;
  /** Vercel'in `VERCEL_ENV` değeri: `production` | `preview` | `development` | tanımsız (yerel). */
  vercelEnv: string | undefined;
  forwardedHost: string | null;
  forwardedProto: string | null;
  host: string | null;
}

function clean(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function requestOrigin(input: Pick<OriginInput, "forwardedHost" | "forwardedProto" | "host">): string | null {
  const host = (input.forwardedHost ?? input.host)?.split(",")[0]?.trim();
  if (!host) return null;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = input.forwardedProto?.split(",")[0]?.trim() || (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export function resolveAppOrigin(input: OriginInput): string {
  const appUrl = input.appUrl ? clean(input.appUrl) : null;
  if (input.vercelEnv === "production" && appUrl) return appUrl;
  const fromRequest = requestOrigin(input);
  if (fromRequest) return fromRequest;
  if (appUrl) return appUrl;
  throw new Error("APP_URL tanımlı değil ve isteğin adresi okunamadı");
}
