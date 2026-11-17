import { describe, expect, it } from "vitest";
import { AiCallError } from "@/lib/ai/client";
import { countWords, isUnclear, transcribe } from "@/lib/stt";
import { buildTranscribeBody, createMaiTranscriber, OPENROUTER_TRANSCRIBE_URL, toOpenRouterSttModel } from "@/lib/stt/mai";
import { FakeStore } from "../ai/fixtures";
import { FakeTranscriber, wavOf } from "../media/fakes";

const NOW = new Date("2026-12-14T09:00:00.000Z");
const ctx = { userId: "u1", sessionId: "s1", now: NOW };

describe("MAI-Transcribe-2 isteği (OpenRouter, PLAN karar 24)", () => {
  it("model eşlemesi", () => {
    expect(toOpenRouterSttModel("MAI-Transcribe-2")).toBe("microsoft/mai-transcribe-2");
    expect(toOpenRouterSttModel("x/y")).toBe("x/y");
    expect(() => toOpenRouterSttModel("whisper")).toThrow();
  });

  it("gövde: WAV base64, `language: en`, veri toplama yok; biçim/temizleme seçeneği gönderilmez (verbatim)", () => {
    const body = buildTranscribeBody(new Uint8Array([1, 2, 3]), "MAI-Transcribe-2");
    expect(body).toEqual({
      model: "microsoft/mai-transcribe-2",
      input_audio: { data: "AQID", format: "wav" },
      language: "en",
      provider: { data_collection: "deny" },
    });
    expect(JSON.stringify(body)).not.toMatch(/transcribeStyle|clean|prompt/i);
  });

  it("yanıttan metin ve süre okunur; HTTP hatası kısa kod", async () => {
    const ok = createMaiTranscriber({
      apiKey: "k",
      fetch: async (url) => {
        expect(url).toBe(OPENROUTER_TRANSCRIBE_URL);
        return Response.json({ text: "She play football.", usage: { seconds: 2.4 } });
      },
    });
    expect(await ok.transcribe({ wav: wavOf(1), model: "MAI-Transcribe-2", timeoutMs: 1000 })).toEqual({
      text: "She play football.",
      seconds: 2.4,
    });
    const bad = createMaiTranscriber({ apiKey: "k", fetch: async () => new Response("{}", { status: 400 }) });
    await expect(bad.transcribe({ wav: wavOf(1), model: "MAI-Transcribe-2", timeoutMs: 1000 })).rejects.toMatchObject({
      code: "http_400",
      retryable: false,
    });
  });
});

describe("transcribe (guard + llm_usage)", () => {
  it("`purpose = transcribe`, `audio_seconds` WAV'dan, maliyet 1,67 $/1000 dk + komisyon; metin satırda yok", async () => {
    const ai = new FakeStore();
    ai.settings.openrouter_fee_rate = 0.055;
    const stt = new FakeTranscriber();
    stt.text = "  She   play football every day. ";
    const out = await transcribe({ ai, stt, clock: () => 0 }, ctx, { wav: wavOf(30), durationSec: 30 });
    expect(out).toEqual({ transcript: "She play football every day.", unclear: false });
    expect(ai.rows).toHaveLength(1);
    const row = ai.rows[0];
    expect(row).toMatchObject({ purpose: "transcribe", provider: "openrouter", model: "MAI-Transcribe-2", audio_seconds: 30, ok: true });
    expect(row.cost_usd).toBeCloseTo(0.5 * 0.00167 * 1.055, 6);
    expect(JSON.stringify(row)).not.toMatch(/play|football/);
  });

  it("acil durdurmada çağrı yok", async () => {
    const ai = new FakeStore();
    ai.settings.kill_switch = true;
    const stt = new FakeTranscriber();
    await expect(transcribe({ ai, stt }, ctx, { wav: wavOf(1), durationSec: 1 })).rejects.toMatchObject({ code: "kill_switch" });
    expect(stt.calls).toHaveLength(0);
  });

  it("zaman aşımı bir kez yeniden denenir, iki satır", async () => {
    const ai = new FakeStore();
    const stt = new FakeTranscriber();
    stt.fail = new AiCallError("timeout", true);
    await expect(transcribe({ ai, stt, clock: () => 0 }, ctx, { wav: wavOf(1), durationSec: 1 })).rejects.toBeInstanceOf(AiCallError);
    expect(stt.calls).toHaveLength(2);
    expect(ai.rows.map((r) => r.error)).toEqual(["timeout", "timeout"]);
  });

  it("anlaşılmayan: < 2 kelime (dolgu sesleri sayılmaz)", () => {
    expect(countWords("Uh, um, I play football.")).toBe(3);
    expect(isUnclear("")).toBe(true);
    expect(isUnclear("Um... yes")).toBe(true);
    expect(isUnclear("I'm fine")).toBe(false);
  });
});
