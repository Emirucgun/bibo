// Speechify ses listesi (P9 yardımcısı ve yönetim paneli). Ses listesi istemek seslendirme değildir:
// karakter harcamaz, içerik göndermez; bu yüzden guard / `llm_usage` dışında.
export interface Voice {
  id: string;
  display_name?: string;
  gender?: string;
  tags?: string[];
  models?: { name?: string; languages?: { locale?: string }[] }[];
}

export const VOICES_URL = "https://api.speechify.ai/v1/voices";

export function supportsModelEnUs(v: Voice, model: string): boolean {
  return (v.models ?? []).some(
    (m) => m.name === model && (m.languages ?? []).some((l) => l.locale?.toLowerCase() === "en-us"),
  );
}

export async function listVoices(key: string, doFetch: typeof fetch = fetch): Promise<Voice[]> {
  const out: Voice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(VOICES_URL);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`speechify voices HTTP ${res.status}`);
    const body = (await res.json()) as { voices?: Voice[]; next_cursor?: string; has_more?: boolean } | Voice[];
    if (Array.isArray(body)) return body;
    out.push(...(body.voices ?? []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return out;
}

/**
 * Varsayılan ses (PLAN karar 37, pedagoji kararı): `tts_voice` boşken modelin en-US seslerinden
 * kadın, "conversational"/"narration" etiketli olan; yoksa ilk kadın; yoksa ilk ses. Gerekçe: A1–A2
 * dinleyicisi için sakin, net anlatım; yönetim panelinden değiştirilebilir.
 */
export function pickDefaultVoice(voices: Voice[], model: string): Voice | null {
  const en = voices.filter((v) => supportsModelEnUs(v, model));
  const female = en.filter((v) => v.gender?.toLowerCase() === "female");
  const calm = female.find((v) => (v.tags ?? []).some((t) => /narrat|conversation|calm|clear/i.test(t)));
  return calm ?? female[0] ?? en[0] ?? null;
}
