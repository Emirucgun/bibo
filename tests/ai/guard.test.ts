import { describe, expect, it } from "vitest";
import { AiCallError } from "@/lib/ai/client";
import {
  evaluateGuard,
  GuardError,
  guardedLlmCall,
  istanbulDayStart,
  utcMonthStart,
  withAiCall,
  type CallContext,
} from "@/lib/ai/guard";
import { SessionGen } from "@/lib/ai/schemas";
import { FakeLlm, FakeStore, ok, SETTINGS, USAGE } from "./fixtures";

const NOW = new Date("2026-11-11T10:00:00Z");
const GEN: CallContext = { purpose: "generate", userId: "u1", sessionId: "s1", now: NOW };
const GRADE: CallContext = { ...GEN, purpose: "grade" };

function spec(onRun: () => void) {
  return {
    provider: "openrouter",
    model: () => "claude-haiku-5-5",
    run: async () => {
      onRun();
      return { value: "x", metrics: { input_tokens: 10, output_tokens: 20, cost_usd: 0.001, ok: true } };
    },
  };
}

describe("evaluateGuard (SPEC 5.4 sırası)", () => {
  const state = { settings: SETTINGS, monthCostUsd: 0, sessionsStartedToday: 0 };

  it("her şey normalse geçer", () => {
    expect(evaluateGuard(state, "generate")).toEqual({ ok: true });
  });

  it("acil durdurma her şeyden önce gelir", () => {
    const s = { ...state, settings: { ...SETTINGS, kill_switch: true }, monthCostUsd: 999, sessionsStartedToday: 9 };
    expect(evaluateGuard(s, "grade")).toEqual({ ok: false, code: "kill_switch" });
  });

  it("ay içi maliyet + plan ücreti tavana EŞİT → red", () => {
    const s = { ...state, settings: { ...SETTINGS, tts_plan_usd: 10 }, monthCostUsd: 30 };
    expect(evaluateGuard(s, "grade")).toEqual({ ok: false, code: "budget" });
    expect(evaluateGuard({ ...s, monthCostUsd: 29.99 }, "grade")).toEqual({ ok: true });
  });

  it("günlük sınır yalnızca üretimi durdurur", () => {
    const s = { ...state, sessionsStartedToday: 2 };
    expect(evaluateGuard(s, "generate")).toEqual({ ok: false, code: "daily_limit" });
    expect(evaluateGuard({ ...s, sessionsStartedToday: null }, "grade")).toEqual({ ok: true });
    expect(evaluateGuard({ ...s, sessionsStartedToday: 1 }, "generate")).toEqual({ ok: true });
  });
});

describe("withAiCall", () => {
  it("kill_switch = true → çağrı yok, satır yok", async () => {
    const store = new FakeStore();
    store.settings.kill_switch = true;
    let ran = 0;
    await expect(withAiCall(store, GRADE, spec(() => ran++))).rejects.toEqual(new GuardError("kill_switch"));
    expect(ran).toBe(0);
    expect(store.rows).toHaveLength(0);
  });

  it("ay içi maliyet + plan ücreti tavana eşit → çağrı yok", async () => {
    const store = new FakeStore();
    store.settings.tts_plan_usd = 10;
    store.monthCost = 30;
    let ran = 0;
    await expect(withAiCall(store, GRADE, spec(() => ran++))).rejects.toMatchObject({ code: "budget" });
    expect(ran).toBe(0);
  });

  it("günlük sınır aşılınca üretim yok (değerlendirme sürer)", async () => {
    const store = new FakeStore();
    store.startedToday = 2;
    let ran = 0;
    await expect(withAiCall(store, GEN, spec(() => ran++))).rejects.toMatchObject({ code: "daily_limit" });
    expect(ran).toBe(0);
    await withAiCall(store, GRADE, spec(() => ran++));
    expect(ran).toBe(1);
  });

  it("başarılı çağrı yalnızca sayısal/kimlik alanlı bir llm_usage satırı yazar ve oturum maliyetini artırır", async () => {
    const store = new FakeStore();
    await withAiCall(store, GEN, spec(() => {}), { clock: (() => { let t = 0; return () => (t += 50); })() });
    expect(store.rows).toHaveLength(1);
    const row = store.rows[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "audio_seconds", "cache_read_tokens", "cache_write_tokens", "cost_usd", "error", "input_tokens",
        "latency_ms", "model", "ok", "output_tokens", "provider", "purpose", "session_id", "tts_chars", "user_id",
      ].sort(),
    );
    expect(row).toMatchObject({ purpose: "generate", provider: "openrouter", model: "claude-haiku-5-5", ok: true, latency_ms: 50 });
    expect(store.sessionCost.get("s1")).toBe(0.001);
  });

  it("yeniden denenebilir hata: bir kez daha dener, iki satır yazar", async () => {
    const store = new FakeStore();
    let n = 0;
    const value = await withAiCall(store, GRADE, {
      provider: "openrouter",
      model: () => "claude-haiku-5-5",
      run: async () => {
        if (n++ === 0) throw new AiCallError("http_529", true);
        return { value: 7, metrics: { cost_usd: 0, ok: true } };
      },
    });
    expect(value).toBe(7);
    expect(store.rows.map((r) => [r.ok, r.error])).toEqual([[false, "http_529"], [true, null]]);
  });

  it("yeniden denenemeyen hata tekrar edilmez", async () => {
    const store = new FakeStore();
    let n = 0;
    await expect(
      withAiCall(store, GRADE, {
        provider: "openrouter",
        model: () => "m",
        run: async () => {
          n++;
          throw new AiCallError("http_400", false);
        },
      }),
    ).rejects.toThrow("http_400");
    expect(n).toBe(1);
    expect(store.rows).toHaveLength(1);
  });
});

describe("guardedLlmCall", () => {
  it("OpenRouter komisyonu maliyete eklenir (openrouter_fee_rate)", async () => {
    const store = new FakeStore();
    store.settings.openrouter_fee_rate = 0.055;
    const llm = new FakeLlm([{ kind: "refusal", usage: USAGE }]);
    await guardedLlmCall({ store, llm }, GEN, (s) => s.model_generate, (s, model) => ({
      model, effort: s.effort_generate, thinking: "adaptive", system: "", user: "", schema: SessionGen([1]),
      schemaName: "x", maxTokens: 1, timeoutMs: 1,
    }));
    // 0,00113 $ × 1,055 = 0,00119215 → 6 ondalık
    expect(store.rows[0].cost_usd).toBe(0.001192);
    expect(store.sessionCost.get("s1")).toBe(0.001192); // oturum maliyeti de komisyonlu
  });

  it("llm_usage satırında komut ya da model çıktısı yok; maliyet cost.ts'ten", async () => {
    const store = new FakeStore();
    const secret = "STUDENT_SECRET_TEXT";
    const llm = new FakeLlm([ok({ slot_1: {}, note: secret })]);
    await guardedLlmCall({ store, llm }, GEN, (s) => s.model_generate, (s, model) => ({
      model,
      effort: s.effort_generate,
      thinking: "adaptive",
      system: "SYSTEM",
      user: secret,
      schema: SessionGen([1]),
      schemaName: "x",
      maxTokens: 10,
      timeoutMs: 10,
    }));
    const row = store.rows[0];
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain("SYSTEM");
    // 1000×0,10 + 2000×0,50 + 3000×0,01 = 1130 / 1e6
    expect(row.cost_usd).toBe(0.00113);
    expect(row).toMatchObject({ ...USAGE, ok: true });
  });

  it("çağrıya model ve effort ayardan gider", async () => {
    const store = new FakeStore();
    store.settings.model_generate = "claude-haiku-5-5";
    store.settings.effort_generate = "high";
    const llm = new FakeLlm([{ kind: "refusal", usage: USAGE }]);
    const res = await guardedLlmCall({ store, llm }, GEN, (s) => s.model_generate, (s, model) => ({
      model, effort: s.effort_generate, thinking: "adaptive", system: "", user: "", schema: SessionGen([1]),
      schemaName: "x", maxTokens: 1, timeoutMs: 1,
    }));
    expect(res.kind).toBe("refusal");
    expect(llm.calls[0]).toMatchObject({ model: "claude-haiku-5-5", effort: "high" });
    expect(store.rows[0]).toMatchObject({ ok: false, error: "refusal" });
  });
});

describe("zaman sınırları", () => {
  it("İstanbul günü UTC+3'te başlar", () => {
    expect(istanbulDayStart(new Date("2026-11-11T10:00:00Z")).toISOString()).toBe("2026-11-10T21:00:00.000Z");
    expect(istanbulDayStart(new Date("2026-11-11T20:59:59Z")).toISOString()).toBe("2026-11-10T21:00:00.000Z");
    expect(istanbulDayStart(new Date("2026-11-11T21:00:00Z")).toISOString()).toBe("2026-11-11T21:00:00.000Z");
  });

  it("faturalama ayı UTC", () => {
    expect(utcMonthStart(new Date("2026-11-30T23:59:59Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
