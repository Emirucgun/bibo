// Seslendirme ve transkript için bellek içi sahteler (M7–M8).
import { AiCallError } from "@/lib/ai/client";
import type { LlmUsageRow } from "@/lib/ai/store";
import { encodeWav, TARGET_SAMPLE_RATE } from "@/lib/audio/wav";
import type { Transcriber } from "@/lib/stt";
import type { TtsCacheRow, TtsSettings, TtsStore } from "@/lib/tts/cache";
import type { SpeechClient, SpeechRequest } from "@/lib/tts/speechify";
import type { Voice } from "@/lib/tts/voices";

export class FakeTtsStore implements TtsStore {
  settings: TtsSettings = {
    tts_enabled: true,
    tts_model: "simba-3.5",
    tts_voice: "voice-1",
    tts_monthly_char_alert: 400_000,
  };
  cache = new Map<string, TtsCacheRow & { last_used_at: Date }>();
  objects = new Map<string, Uint8Array>();
  /** `llm_usage` satırları ve yazıldıkları an (`link` ile sahte `AiStore`'a bağlanır). */
  usage: { row: LlmUsageRow; at: Date }[] = [];

  /** Sahte `AiStore`'un `insertUsage`'ını sarar; satırlara zaman damgası ekler. */
  link(ai: { insertUsage(row: LlmUsageRow): Promise<void> }, now: () => Date): void {
    const inner = ai.insertUsage.bind(ai);
    ai.insertUsage = async (row) => {
      this.usage.push({ row, at: now() });
      await inner(row);
    };
  }

  async loadTtsSettings() {
    return this.settings;
  }
  async getCache(hash: string) {
    return this.cache.get(hash) ?? null;
  }
  async upsertCache(row: TtsCacheRow, now: Date) {
    this.cache.set(row.hash, { ...row, last_used_at: now });
  }
  async touchCache(hash: string, now: Date) {
    const row = this.cache.get(hash);
    if (row) row.last_used_at = now;
  }
  async upload(path: string, audio: Uint8Array) {
    this.objects.set(path, audio);
  }
  async signedUrl(path: string, seconds: number) {
    return `https://storage.test/tts/${path}?ttl=${seconds}`;
  }
  async lastTtsCall(since: Date) {
    const last = this.usage.filter((u) => u.row.purpose === "tts" && u.at >= since).at(-1);
    return last ? { ok: last.row.ok, error: last.row.error, created_at: last.at } : null;
  }
  async charsSince() {
    return this.usage.filter((u) => u.row.purpose === "tts").reduce((a, u) => a + (u.row.tts_chars ?? 0), 0);
  }
  async assignVoice(voiceId: string) {
    this.settings = { ...this.settings, tts_voice: voiceId };
  }
}

export class FakeSpeech implements SpeechClient {
  calls: SpeechRequest[] = [];
  /** Verilirse bu HTTP durumuyla başarısız olur. */
  failStatus: number | null = null;
  async synthesize(req: SpeechRequest) {
    this.calls.push(req);
    if (this.failStatus) throw new AiCallError(`http_${this.failStatus}`, this.failStatus >= 500);
    return { audio: new Uint8Array([0xff, 0xfb, 0x90, 0x00]), billableChars: req.text.length };
  }
  /** Varsayılan: anahtarsız gibi boş liste. */
  voices: Voice[] = [];
  voicesError: Error | null = null;
  voiceListCalls = 0;
  async listVoices() {
    this.voiceListCalls++;
    if (this.voicesError) throw this.voicesError;
    return this.voices;
  }
}

export class FakeTranscriber implements Transcriber {
  calls: { bytes: number; model: string }[] = [];
  text = "My friend plays football on weekends.";
  fail: Error | null = null;
  async transcribe(req: { wav: Uint8Array; model: string; timeoutMs: number }) {
    this.calls.push({ bytes: req.wav.byteLength, model: req.model });
    if (this.fail) throw this.fail;
    return { text: this.text, seconds: null };
  }
}

/** `sec` saniyelik sessiz 16 kHz mono WAV. */
export function wavOf(sec: number, rate = TARGET_SAMPLE_RATE): Uint8Array {
  return encodeWav(new Float32Array(Math.round(sec * rate)), rate);
}
