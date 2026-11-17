import "server-only";
import { ApiError, apiErrorBody } from "@/lib/api/errors";

/** İstek gövdesini JSON olarak okur; okunamıyorsa `invalid_input`. Doğrulama çağıranda (Zod). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("invalid_input");
  }
}

/** Gövdesi isteğe bağlı uç noktalar için: boş gövde `{}`, bozuk JSON `invalid_input`. */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_input");
  }
}

/**
 * Route Handler sarmalayıcısı: `ApiError` → `{ error: { code, message_tr } }`,
 * beklenmeyen hata → 500. Günlüğe yalnızca hata adı ve kısa mesaj yazılır; istek gövdesi yazılmaz.
 */
export async function withApi(label: string, handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof ApiError) {
      return Response.json(apiErrorBody(err.code), { status: err.status });
    }
    console.error(`[${label}]`, err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
    return Response.json(apiErrorBody("server_error"), { status: 500 });
  }
}
