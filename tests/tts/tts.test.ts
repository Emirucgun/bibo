import { describe, expect, it } from "vitest";
import { AiCallError } from "@/lib/ai/client";
import {
  crossedCharAlert,
  getAudioUrl,
  storagePathFor,
  TTS_BLOCK_MS,
  ttsAvailable,
  ttsHash,
  ttsRate,
  TtsUnavailableError,
} from "@/lib/tts/cache";
import { buildInput, buildSpeechBody, createSpeechifyClient, escapeXml, SPEECHIFY_URL } from "@/lib/tts/speechify";
import { parseTtsSettings } from "@/lib/tts/store";
import { FakeStore } from "../ai/fixtures";
import { FakeSpeech, FakeTtsStore } from "../media/fakes";

const NOW = new Date("2026-12-14T09:00:00.000Z");

function env() {
  const ai = new FakeStore();
  const store = new FakeTtsStore();
  const speech = new FakeSpeech();
  let now = NOW;
  store.link(ai, () => now);
  const deps = { store, ai, speech, clock: () => 0 };
  const ctx = (at = now) => ({ userId: "u1", sessionId: "s1", now: at });
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { ai, store, speech, deps, ctx, advance, now: () => now };
}

describe("Speechify isteği (SPEC 10)", () => {
  it("A1: SSML prosody -10%; A2: düz metin", () => {
    expect(ttsRate("A1")).toBe(0.9);
    expect(ttsRate("A2")).toBe(1);
    expect(buildInput("She plays football.", 0.9)).toBe(
      '<speak><prosody rate="-10%">She plays football.</prosody></speak>',
    );
    expect(buildInput("She plays football.", 1)).toBe("She plays football.");
  });

  it("`&` içeren metin SSML'e kaçışla girer (geçerli XML)", () => {
    expect(escapeXml(`Tom & Jerry <3 "hi" it's`)).toBe("Tom &amp; Jerry &lt;3 &quot;hi&quot; it&apos;s");
    const input = buildInput("Fish & chips", 0.9);
    expect(input).toBe('<speak><prosody rate="-10%">Fish &amp; chips</prosody></speak>');
    expect(input.replace(/&(amp|lt|gt|quot|apos);/g, "")).not.toMatch(/[&]/);
  });

  it("gövde: model, ses, mp3, en-US; öğrenci kimliği yok", () => {
    const body = buildSpeechBody({ text: "Hi.", rate: 1, voiceId: "v", model: "simba-3.5" });
    expect(body).toEqual({ input: "Hi.", voice_id: "v", model: "simba-3.5", audio_format: "mp3", language: "en-US" });
  });

  it("base64 ses çözülür; `billable_characters_count` okunur", async () => {
    let seen: RequestInit | undefined;
    const client = createSpeechifyClient({
      apiKey: "k",
      fetch: async (url, init) => {
        expect(url).toBe(SPEECHIFY_URL);
        seen = init;
        return Response.json({ audio_data: Buffer.from([1, 2, 3]).toString("base64"), billable_characters_count: 19 });
      },
    });
    const res = await client.synthesize({ text: "Fish & chips", rate: 0.9, voiceId: "v", model: "simba-3.5" });
    expect([...res.audio]).toEqual([1, 2, 3]);
    expect(res.billableChars).toBe(19);
    expect((seen!.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(seen!.body as string).input).toContain("Fish &amp; chips");
  });

  it("402 ve 429 yeniden denenmez; 5xx denenir", async () => {
    for (const [status, retryable] of [[402, false], [429, false], [503, true]] as const) {
      const client = createSpeechifyClient({ apiKey: "k", fetch: async () => new Response("{}", { status }) });
      const err = await client.synthesize({ text: "x", rate: 1, voiceId: "v", model: "m" }).catch((e) => e);
      expect(err).toBeInstanceOf(AiCallError);
      expect(err).toMatchObject({ code: `http_${status}`, retryable });
    }
  });
});

describe("önbellekli seslendirme (M7 Bitti testi 1)", () => {
  it("aynı metin ikinci kez istendiğinde Speechify çağrılmaz; `llm_usage`'da tek `tts` satırı", async () => {
    const e = env();
    const first = await getAudioUrl(e.deps, e.ctx(), { text: "She plays football.", level: "A1" });
    const second = await getAudioUrl(e.deps, e.ctx(), { text: "She plays football.", level: "A1" });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.url).toBe(first.url);
    expect(e.speech.calls).toHaveLength(1);
    const rows = e.ai.rows.filter((r) => r.purpose === "tts");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "speechify", model: "simba-3.5", tts_chars: 19, cost_usd: 0, ok: true, session_id: "s1" });
  });

  it("anahtar sha256(model|voice|rate|text): hız farklıysa ayrı ses", async () => {
    const e = env();
    await getAudioUrl(e.deps, e.ctx(), { text: "Hello.", level: "A1" });
    await getAudioUrl(e.deps, e.ctx(), { text: "Hello.", level: "A2" });
    expect(e.speech.calls.map((c) => c.rate)).toEqual([0.9, 1]);
    const hash = ttsHash("simba-3.5", "voice-1", 0.9, "Hello.");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.store.cache.get(hash)).toMatchObject({ voice: "voice-1", rate: 0.9, storage_path: storagePathFor(hash) });
    expect(storagePathFor(hash)).toBe(`tts/${hash}.mp3`);
    expect(e.store.objects.has(`${hash}.mp3`)).toBe(true);
  });

  it("imzalı URL 1 saatlik; metin URL'de yok", async () => {
    const e = env();
    const { url } = await getAudioUrl(e.deps, e.ctx(), { text: "She plays football.", level: "A2" });
    expect(url).toContain("ttl=3600");
    expect(url).not.toMatch(/plays|football/i);
  });

  it("ses seçilmemiş ya da kapalı: çağrı yok, `TtsUnavailableError`", async () => {
    const e = env();
    e.store.settings.tts_voice = null;
    await expect(getAudioUrl(e.deps, e.ctx(), { text: "x", level: "A1" })).rejects.toMatchObject({ reason: "no_voice" });
    e.store.settings = { ...e.store.settings, tts_voice: "v", tts_enabled: false };
    await expect(getAudioUrl(e.deps, e.ctx(), { text: "x", level: "A1" })).rejects.toBeInstanceOf(TtsUnavailableError);
    expect(e.speech.calls).toHaveLength(0);
  });

  it("acil durdurma ve tavan: guard reddi, çağrı yok", async () => {
    const e = env();
    e.ai.settings.kill_switch = true;
    await expect(getAudioUrl(e.deps, e.ctx(), { text: "x", level: "A1" })).rejects.toMatchObject({ reason: "kill_switch" });
    e.ai.settings.kill_switch = false;
    e.ai.monthCost = 40;
    await expect(getAudioUrl(e.deps, e.ctx(), { text: "x", level: "A1" })).rejects.toMatchObject({ reason: "budget" });
    expect(e.speech.calls).toHaveLength(0);
  });
});

describe("402/429 → dinleme kapalı (SPEC 5.4, PLAN karar 25)", () => {
  it("402 sonrası `ttsAvailable` false; 24 saat sonra yeniden açık", async () => {
    const e = env();
    expect(await ttsAvailable(e.store, e.now())).toBe(true);
    e.speech.failStatus = 402;
    await expect(getAudioUrl(e.deps, e.ctx(), { text: "x", level: "A1" })).rejects.toMatchObject({ reason: "http_402" });
    // Yeniden denenmedi: tek satır, ok = false.
    expect(e.ai.rows.filter((r) => r.purpose === "tts")).toMatchObject([{ ok: false, error: "http_402", cost_usd: 0 }]);
    expect(await ttsAvailable(e.store, e.now())).toBe(false);
    e.advance(TTS_BLOCK_MS + 1);
    expect(await ttsAvailable(e.store, e.now())).toBe(true);
  });

  it("429 de kapatır; sonraki başarılı çağrı durumu sıfırlar; 5xx kapatmaz", async () => {
    const e = env();
    e.speech.failStatus = 429;
    await getAudioUrl(e.deps, e.ctx(), { text: "a", level: "A1" }).catch(() => undefined);
    expect(await ttsAvailable(e.store, e.now())).toBe(false);
    e.speech.failStatus = null;
    await getAudioUrl(e.deps, e.ctx(), { text: "b", level: "A1" });
    expect(await ttsAvailable(e.store, e.now())).toBe(true);
    e.speech.failStatus = 503;
    await getAudioUrl(e.deps, e.ctx(), { text: "c", level: "A1" }).catch(() => undefined);
    expect(e.speech.calls.filter((c) => c.text === "c")).toHaveLength(2); // bir kez yeniden denendi
    expect(await ttsAvailable(e.store, e.now())).toBe(true);
  });
});

describe("aylık karakter uyarısı", () => {
  it("eşik bu çağrıyla geçilince bir kez", () => {
    expect(crossedCharAlert(399_990, 20, 400_000)).toBe(true);
    expect(crossedCharAlert(400_010, 20, 400_000)).toBe(false);
    expect(crossedCharAlert(100, 20, 400_000)).toBe(false);
  });
});

describe("parseTtsSettings", () => {
  const rows = [
    { key: "tts_enabled", value: true },
    { key: "tts_model", value: "simba-3.5" },
    { key: "tts_voice", value: null },
    { key: "tts_monthly_char_alert", value: 400000 },
  ];
  it("göçteki varsayılanlar okunur; boş ses `null`", () => {
    expect(parseTtsSettings(rows)).toEqual({ tts_enabled: true, tts_model: "simba-3.5", tts_voice: null, tts_monthly_char_alert: 400000 });
    const withVoice = rows.map((r) => (r.key === "tts_voice" ? { ...r, value: " v1 " } : r));
    expect(parseTtsSettings(withVoice).tts_voice).toBe("v1");
  });
  it("eksik anahtar hata verir", () => {
    expect(() => parseTtsSettings(rows.filter((r) => r.key !== "tts_enabled"))).toThrow(/tts_enabled/);
  });
});
