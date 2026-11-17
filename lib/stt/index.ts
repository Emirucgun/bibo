// Transkript arayüzü (docs/SPEC.md 5.1 "Transkript", 10). Tüm transkript çağrıları buradan geçer
// ki sağlayıcı değişebilsin (MAI-Transcribe-2 önizlemede; sadakat < %85 olursa yedek sağlayıcı).
// guard → çağrı → `llm_usage` (`purpose = transcribe`, `audio_seconds`, maliyet). Transkript metni
// `llm_usage`'a ya da günlüğe yazılmaz.
import { transcribeCostUsd, withFee } from "@/lib/ai/cost";
import { LLM_PROVIDER, withAiCall, type CallContext } from "@/lib/ai/guard";
import type { AiStore } from "@/lib/ai/store";

export interface Transcriber {
  transcribe(req: { wav: Uint8Array; model: string; timeoutMs: number }): Promise<{
    text: string;
    /** Sağlayıcının saydığı süre; yoksa WAV başlığından. */
    seconds: number | null;
  }>;
}

export interface SttDeps {
  ai: AiStore;
  stt: Transcriber;
  clock?: () => number;
}

/** SPEC 5.1: transkript zaman aşımı 15 sn, bir kez yeniden deneme (`withAiCall`). */
export const TRANSCRIBE_TIMEOUT_MS = 15_000;
/** Bundan az kelime "anlaşılmadı" sayılır (SPEC 5.1 `unclear`, PLAN karar 28). */
export const MIN_CLEAR_WORDS = 2;

/** Dolgu sesleri kelime sayılmaz. */
const FILLERS = new Set(["uh", "um", "erm", "er", "hmm", "mm", "ah", "eh"]);

export function countWords(text: string): number {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w && !FILLERS.has(w)).length;
}

export function isUnclear(text: string): boolean {
  return countWords(text) < MIN_CLEAR_WORDS;
}

export interface TranscriptOutcome {
  transcript: string;
  unclear: boolean;
}

export async function transcribe(
  deps: SttDeps,
  ctx: Omit<CallContext, "purpose">,
  audio: { wav: Uint8Array; durationSec: number },
): Promise<TranscriptOutcome> {
  const text = await withAiCall(
    deps.ai,
    { ...ctx, purpose: "transcribe" },
    {
      provider: LLM_PROVIDER, // OpenRouter (SPEC 3 `llm_usage.provider`)
      model: (s) => s.model_transcribe,
      run: async (settings) => {
        const res = await deps.stt.transcribe({
          wav: audio.wav,
          model: settings.model_transcribe,
          timeoutMs: TRANSCRIBE_TIMEOUT_MS,
        });
        const seconds = Math.round((res.seconds ?? audio.durationSec) * 100) / 100;
        return {
          value: res.text,
          metrics: {
            audio_seconds: seconds,
            cost_usd: withFee(transcribeCostUsd(seconds), settings.openrouter_fee_rate),
            ok: true,
          },
        };
      },
    },
    { clock: deps.clock },
  );
  const transcript = text.replace(/\s+/g, " ").trim();
  return { transcript, unclear: isUnclear(transcript) };
}
