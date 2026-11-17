// Önbellekli seslendirme (docs/SPEC.md 2 "Temel veri akışı" 4, 3 `tts_cache`, 5.4, 10).
// Akış: önbellekte varsa imzalı URL → yoksa guard → Speechify → `tts/` kovası → `tts_cache` →
// `llm_usage` (`purpose = tts`, `tts_chars`) → imzalı URL. Aynı metin ikinci kez seslendirilmez.
import { createHash } from "node:crypto";
import { AiCallError } from "@/lib/ai/client";
import { GuardError, utcMonthStart, withAiCall, type CallContext } from "@/lib/ai/guard";
import type { AiStore } from "@/lib/ai/store";
import type { Level } from "@/lib/engine/types";
import type { SpeechClient } from "./speechify";

/** `app_settings`'in seslendirme kısmı. `tts_voice` P9'da seçilene kadar `null`. */
export interface TtsSettings {
  tts_enabled: boolean;
  tts_model: string;
  tts_voice: string | null;
  tts_monthly_char_alert: number;
}

export interface TtsCacheRow {
  hash: string;
  voice: string;
  rate: number;
  storage_path: string;
  chars: number;
}

/** Son seslendirme çağrısının sonucu (yalnızca durum ve kısa kod). */
export interface TtsLastCall {
  ok: boolean;
  error: string | null;
  created_at: Date;
}

export interface TtsStore {
  loadTtsSettings(): Promise<TtsSettings>;
  getCache(hash: string): Promise<TtsCacheRow | null>;
  /** Aynı anahtar zaten varsa üzerine yazar (yarışta iki istek aynı sesi üretmiş olabilir). */
  upsertCache(row: TtsCacheRow, now: Date): Promise<void>;
  touchCache(hash: string, now: Date): Promise<void>;
  /** Kova içi yol (`<hash>.mp3`). */
  upload(objectPath: string, audio: Uint8Array): Promise<void>;
  signedUrl(objectPath: string, seconds: number): Promise<string>;
  /** `since`'ten bu yana son `purpose = tts` satırı. */
  lastTtsCall(since: Date): Promise<TtsLastCall | null>;
  charsSince(since: Date): Promise<number>;
}

export interface TtsDeps {
  store: TtsStore;
  /** Guard ve `llm_usage` için (yapay zekâ katmanıyla aynı). */
  ai: AiStore;
  speech: SpeechClient;
  clock?: () => number;
}

export const TTS_BUCKET = "tts";
/** SPEC 6: 1 saatlik imzalı URL. */
export const SIGNED_URL_SECONDS = 3600;
/** 402/429 sonrası dinlemenin kapalı kaldığı süre (PLAN karar 25); sonra kendiliğinden denenir. */
export const TTS_BLOCK_MS = 24 * 3_600_000;
const BLOCKING_ERRORS = new Set(["http_402", "http_429"]);
export const TTS_PROVIDER = "speechify";

/** A1 0,9 (SSML `-10%`), A2 1,0 (SPEC 10). */
export function ttsRate(level: Level): number {
  return level === "A1" ? 0.9 : 1;
}

export function ttsHash(model: string, voice: string, rate: number, text: string): string {
  return createHash("sha256").update(`${model}|${voice}|${rate}|${text}`).digest("hex");
}

export const objectPathFor = (hash: string) => `${hash}.mp3`;
/** `tts_cache.storage_path` (SPEC 3: `tts/<hash>.mp3`). */
export const storagePathFor = (hash: string) => `${TTS_BUCKET}/${objectPathFor(hash)}`;

/** Seslendirme kullanılamıyor: kapalı, ses seçilmemiş, kota/sınır, guard reddi ya da sağlayıcı hatası. */
export class TtsUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "TtsUnavailableError";
  }
}

/**
 * Yeni oturumda dinleme slotları planlanabilir mi (SPEC 4.4 adım 8, 5.4; PLAN karar 25–26)?
 * Kapalı: `tts_enabled = false`, `tts_voice` boş ya da son 24 saatteki son çağrı 402/429.
 */
export async function ttsAvailable(store: TtsStore, now: Date): Promise<boolean> {
  const s = await store.loadTtsSettings();
  if (!s.tts_enabled || !s.tts_voice) return false;
  const last = await store.lastTtsCall(new Date(now.getTime() - TTS_BLOCK_MS));
  return !(last && !last.ok && last.error && BLOCKING_ERRORS.has(last.error));
}

/** Uyarı eşiği bu çağrıyla geçildi mi (önceki < eşik ≤ sonraki). */
export function crossedCharAlert(before: number, added: number, threshold: number): boolean {
  return before < threshold && before + added >= threshold;
}

export interface AudioRequest {
  text: string;
  level: Level;
}

/**
 * Metnin sesine 1 saatlik imzalı URL. Kullanılamıyorsa `TtsUnavailableError`.
 * `ctx.purpose` her zaman `tts`.
 */
export async function getAudioUrl(
  deps: TtsDeps,
  ctx: Omit<CallContext, "purpose">,
  req: AudioRequest,
): Promise<{ url: string; cached: boolean }> {
  const settings = await deps.store.loadTtsSettings();
  if (!settings.tts_enabled) throw new TtsUnavailableError("disabled");
  const voice = settings.tts_voice;
  if (!voice) throw new TtsUnavailableError("no_voice");

  const rate = ttsRate(req.level);
  const hash = ttsHash(settings.tts_model, voice, rate, req.text);
  const objectPath = objectPathFor(hash);

  const hit = await deps.store.getCache(hash);
  if (hit) {
    await deps.store.touchCache(hash, ctx.now);
    return { url: await deps.store.signedUrl(objectPath, SIGNED_URL_SECONDS), cached: true };
  }

  const monthStart = utcMonthStart(ctx.now);
  let chars: number;
  try {
    chars = await withAiCall(
      deps.ai,
      { ...ctx, purpose: "tts" },
      {
        provider: TTS_PROVIDER,
        model: () => settings.tts_model,
        run: async () => {
          const res = await deps.speech.synthesize({ text: req.text, rate, voiceId: voice, model: settings.tts_model });
          // Kovaya yazılamazsa çağrı yine ücretlendi; satır `ok = false` ile yazılır.
          await deps.store.upload(objectPath, res.audio);
          return {
            value: res.billableChars,
            metrics: { tts_chars: res.billableChars, cost_usd: 0, ok: true }, // PLAN karar 27
          };
        },
      },
      { clock: deps.clock },
    );
  } catch (err) {
    if (err instanceof GuardError) throw new TtsUnavailableError(err.code);
    if (err instanceof AiCallError) throw new TtsUnavailableError(err.code);
    throw new TtsUnavailableError("exception");
  }

  await deps.store.upsertCache(
    { hash, voice, rate, storage_path: storagePathFor(hash), chars: req.text.length },
    ctx.now,
  );

  // Aylık karakter uyarısı (SPEC 5.4): yalnızca sayı; panel M10'da aynı sayıyı gösterir.
  try {
    const total = await deps.store.charsSince(monthStart);
    if (crossedCharAlert(total - chars, chars, settings.tts_monthly_char_alert)) {
      console.warn("[tts] monthly_char_alert", total, settings.tts_monthly_char_alert);
    }
  } catch {
    /* uyarı yalnızca bilgi; ses yine döner */
  }

  return { url: await deps.store.signedUrl(objectPath, SIGNED_URL_SECONDS), cached: false };
}
