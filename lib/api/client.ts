// Tarayıcıdan API çağrısı: hata yanıtındaki `message_tr`'yi okur (SPEC Bölüm 6).
const FALLBACK = "Bir şeyler ters gitti. Biraz sonra yeniden dene.";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function callApi<T>(
  path: string,
  init: { method: "POST" | "PATCH" | "DELETE"; body: unknown },
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(init.body),
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: json as T };
    const error = (json as { error?: { code?: unknown; message_tr?: unknown } } | null)?.error;
    return {
      ok: false,
      code: typeof error?.code === "string" ? error.code : "server_error",
      message: typeof error?.message_tr === "string" ? error.message_tr : FALLBACK,
    };
  } catch {
    return { ok: false, code: "network", message: "Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene." };
  }
}
