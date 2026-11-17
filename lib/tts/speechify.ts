// Speechify Simba 3.5 seslendirme isteği (docs/SPEC.md 10, .claude/rules/ai-katmani.md).
// Bu dosya tek bir HTTP isteği yapar; guard, önbellek ve `llm_usage` `cache.ts`'te.
// Speechify'a yalnızca sistemin ürettiği İngilizce alıştırma metni gider; öğrenci kimliği gitmez.
import { AiCallError } from "@/lib/ai/client";

export const SPEECHIFY_URL = "https://api.speechify.ai/v1/audio/speech";
/** Zaman aşımı: dinleme etkinliği açılırken beklenir; kısa cümle için yeterli. */
export const TTS_TIMEOUT_MS = 15_000;

/** XML kaçışı: SSML'e gömülen metin (`&`, `<`, `>`, tırnaklar). */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Hız (`rate`, 1 = normal) → Speechify `input`. 1'den farklıysa SSML `prosody`:
 * 0,9 → `rate="-10%"`. Yanlış yazılmış `rate` sessizce yok sayıldığı için biçim sabittir.
 * Normal hızda düz metin gider (SPEC 10: "A2 için düz metin").
 */
export function buildInput(text: string, rate: number): string {
  if (rate === 1) return text;
  const pct = Math.round((rate - 1) * 100);
  const sign = pct > 0 ? "+" : "";
  return `<speak><prosody rate="${sign}${pct}%">${escapeXml(text)}</prosody></speak>`;
}

export interface SpeechRequest {
  text: string;
  rate: number;
  voiceId: string;
  model: string;
}

export interface SpeechResult {
  audio: Uint8Array;
  /** Speechify `billable_characters_count` → `llm_usage.tts_chars`. */
  billableChars: number;
}

export function buildSpeechBody(req: SpeechRequest): Record<string, unknown> {
  return {
    input: buildInput(req.text, req.rate),
    voice_id: req.voiceId,
    model: req.model,
    audio_format: "mp3",
    language: "en-US",
  };
}

export interface SpeechClient {
  synthesize(req: SpeechRequest): Promise<SpeechResult>;
}

/**
 * 402 (kota/ödeme) ve 429 (sınır) yeniden denenmez: `tts_unavailable` olarak ele alınır
 * (SPEC 5.4). 5xx, ağ hatası ve zaman aşımı bir kez yeniden denenir (`withAiCall`).
 */
export function speechifyHttpError(status: number): AiCallError {
  return new AiCallError(`http_${status}`, status >= 500);
}

export function createSpeechifyClient(opts: { apiKey?: string; fetch?: typeof fetch } = {}): SpeechClient {
  const doFetch = opts.fetch ?? fetch;
  return {
    async synthesize(req) {
      const apiKey = opts.apiKey ?? process.env.SPEECHIFY_API_KEY;
      if (!apiKey) throw new AiCallError("missing_api_key", false);
      let res: Response;
      try {
        res = await doFetch(SPEECHIFY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(buildSpeechBody(req)),
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        });
      } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new AiCallError(timeout ? "timeout" : "network", true);
      }
      if (!res.ok) throw speechifyHttpError(res.status);
      const data = (await res.json()) as { audio_data?: string; billable_characters_count?: number };
      if (!data.audio_data) throw new AiCallError("no_audio", false);
      const audio = Uint8Array.from(Buffer.from(data.audio_data, "base64"));
      if (audio.length === 0) throw new AiCallError("no_audio", false);
      return { audio, billableChars: Math.max(0, Math.round(data.billable_characters_count ?? 0)) };
    },
  };
}
