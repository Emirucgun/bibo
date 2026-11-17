// MAI-Transcribe-2 transkript isteği — OpenRouter üzerinden (SCOPE günlüğü 11.11.2026, PLAN karar 24).
// Doğrudan Azure'a dönülürse (SPEC 10'daki Fast Transcription isteği) yalnızca bu dosya değişir.
// - `language: "en"`: aksanlı İngilizcenin Türkçe algılanmasını önleyen güçlü ipucu.
// - `transcribeStyle` / biçim seçeneği GÖNDERİLMEZ: varsayılan kelimesi kelimesine (`verbatim`),
//   öğrencinin dilbilgisi hatasını düzeltmez.
// - Ses bellekte kalır; diske ya da Storage'a yazılmaz.
import { AiCallError } from "@/lib/ai/client";
import type { Transcriber } from "./index";

export const OPENROUTER_TRANSCRIBE_URL = "https://openrouter.ai/api/v1/audio/transcriptions";

/** `MAI-Transcribe-2` → `microsoft/mai-transcribe-2`; `/` içeren kimlik olduğu gibi. */
export function toOpenRouterSttModel(model: string): string {
  if (model.includes("/")) return model;
  if (/^MAI-Transcribe-\d+$/i.test(model)) return `microsoft/${model.toLowerCase()}`;
  throw new Error(`OpenRouter transkript kimliğine çevrilemedi: ${model}`);
}

export function buildTranscribeBody(wav: Uint8Array, model: string): Record<string, unknown> {
  return {
    model: toOpenRouterSttModel(model),
    input_audio: { data: Buffer.from(wav).toString("base64"), format: "wav" },
    language: "en",
    provider: { data_collection: "deny" },
  };
}

export function createMaiTranscriber(opts: { apiKey?: string; fetch?: typeof fetch } = {}): Transcriber {
  const doFetch = opts.fetch ?? fetch;
  return {
    async transcribe({ wav, model, timeoutMs }) {
      const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new AiCallError("missing_api_key", false);
      let res: Response;
      try {
        res = await doFetch(OPENROUTER_TRANSCRIBE_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(buildTranscribeBody(wav, model)),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new AiCallError(timeout ? "timeout" : "network", true);
      }
      if (!res.ok) throw new AiCallError(`http_${res.status}`, res.status === 429 || res.status >= 500);
      const data = (await res.json()) as { text?: unknown; usage?: { seconds?: unknown } };
      if (typeof data.text !== "string") throw new AiCallError("no_text", false);
      const seconds = typeof data.usage?.seconds === "number" ? data.usage.seconds : null;
      return { text: data.text, seconds };
    },
  };
}
