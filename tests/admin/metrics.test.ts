// M10: yönetim ölçütleri, uyarılar, inceleme uyumu, ayar doğrulama, cron kimlik doğrulaması.
import { describe, expect, it } from "vitest";
import { alerts, costSummary, engagement, reviewAgreement } from "@/lib/admin/metrics";
import { EDITABLE_KEYS, parseSettingValue } from "@/lib/admin/settings";
import { cronAuthorized } from "@/lib/cron/auth";
import { pickDefaultVoice } from "@/lib/tts/voices";

const NOW = new Date("2026-12-31T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("engagement", () => {
  it("aktif, haftada ≥ 4 oturum oranı ve W4", () => {
    const students = [
      { id: "a", created_at: ago(40) },
      { id: "b", created_at: ago(30) },
      { id: "c", created_at: ago(3) },
    ];
    const sessions = [
      ...[1, 2, 3, 4].map((d) => ({ user_id: "a", finished_at: ago(d) })),
      { user_id: "a", finished_at: ago(40 - 22) }, // a'nın 4. haftası
      { user_id: "b", finished_at: ago(1) },
      { user_id: "x", finished_at: ago(1) }, // kayıtlı değil
    ];
    const e = engagement({ students, sessions, now: NOW });
    expect(e.registered).toBe(3);
    expect(e.active7d).toBe(2);
    expect(e.sessions7d).toBe(5);
    expect(e.fourPerWeekRate).toBeCloseTo(1 / 3);
    expect(e.w4Eligible).toBe(2);
    expect(e.w4Rate).toBe(0.5);
  });

  it("kimse yoksa oranlar null", () => {
    const e = engagement({ students: [], sessions: [], now: NOW });
    expect(e.fourPerWeekRate).toBeNull();
    expect(e.w4Rate).toBeNull();
  });
});

describe("costSummary", () => {
  it("toplam, sağlayıcı kırılımı, önbellek oranı ve oturum başı", () => {
    const c = costSummary(
      [
        { provider: "openrouter", purpose: "generate", calls: 4, ok_calls: 4, cost_usd: 0.02, tts_chars: 0, input_tokens: 1000, cache_read_tokens: 600 },
        { provider: "openrouter", purpose: "grade", calls: 10, ok_calls: 9, cost_usd: 0.01, tts_chars: 0, input_tokens: 1000, cache_read_tokens: 400 },
        { provider: "speechify", purpose: "tts", calls: 5, ok_calls: 5, cost_usd: 0, tts_chars: 3000, input_tokens: 0, cache_read_tokens: 0 },
      ],
      3,
    );
    expect(c.totalUsd).toBeCloseTo(0.03);
    expect(c.byProvider.find((p) => p.provider === "openrouter")?.calls).toBe(14);
    expect(c.byPurpose.find((p) => p.purpose === "grade")?.failed).toBe(1);
    expect(c.ttsChars).toBe(3000);
    expect(c.cacheHitRate).toBe(0.5);
    expect(c.perSessionUsd).toBeCloseTo(0.01);
  });
});

describe("alerts (M10 Bitti testi 1–3)", () => {
  const base = {
    killSwitch: false,
    monthCostUsd: 1,
    ttsPlanUsd: 0,
    budgetUsd: 40,
    ttsChars: 10,
    ttsCharAlert: 400_000,
    ttsVoice: "v",
    ttsEnabled: true,
  };
  it("normalde uyarı yok", () => expect(alerts(base)).toEqual([]));
  it("acil durdurma", () => expect(alerts({ ...base, killSwitch: true })[0].level).toBe("danger"));
  it("tavan 0,01 $'a düşürülünce tavan uyarısı", () => {
    const a = alerts({ ...base, monthCostUsd: 0.02, budgetUsd: 0.01 });
    expect(a.some((x) => x.level === "danger" && x.text.includes("tavan"))).toBe(true);
  });
  it("seslendirme eşiği 1'e düşürülünce kota uyarısı", () => {
    expect(alerts({ ...base, ttsCharAlert: 1 }).some((x) => x.text.includes("Seslendirme kotası"))).toBe(true);
  });
  it("%80 uyarısı ve ses seçilmemiş bilgisi", () => {
    const a = alerts({ ...base, monthCostUsd: 33, ttsVoice: null });
    expect(a.map((x) => x.level)).toEqual(["warning", "info"]);
  });
});

describe("reviewAgreement (M10 Bitti testi 4)", () => {
  it("uyum = Doğru / tüm kararlar; 'Hata değil' paydada; hafta ve koda göre", () => {
    const week = (d: Date) => (d < new Date("2026-12-21") ? "2026-12-14" : "2026-12-21");
    const r = reviewAgreement(
      [
        { verdict: "agree", l1_code: "L1.3SG_S", created_at: new Date("2026-12-15") },
        { verdict: "agree", l1_code: "L1.3SG_S", created_at: new Date("2026-12-16") },
        { verdict: "fix", l1_code: "L1.BE_OMIT", created_at: new Date("2026-12-16") },
        { verdict: "not_error", l1_code: "L1.3SG_S", created_at: new Date("2026-12-22") },
      ],
      week,
    );
    expect(r.overall).toBe(0.5);
    expect(r.weekly).toEqual([
      { week: "2026-12-21", agree: 0, total: 1, rate: 0 },
      { week: "2026-12-14", agree: 2, total: 3, rate: 2 / 3 },
    ]);
    expect(r.byCode[0]).toEqual({ code: "L1.3SG_S", agree: 2, total: 3, rate: 2 / 3 });
  });
  it("karar yoksa null", () => expect(reviewAgreement([], () => "w").overall).toBeNull());
});

describe("parseSettingValue", () => {
  it("geçerli değerler", () => {
    expect(parseSettingValue("kill_switch", true)).toEqual({ ok: true, value: true });
    expect(parseSettingValue("monthly_budget_usd", 0.01)).toEqual({ ok: true, value: 0.01 });
    expect(parseSettingValue("tts_voice", "")).toEqual({ ok: true, value: null });
    expect(parseSettingValue("auto_join_invite_code", "PILOT-ACIK")).toEqual({ ok: true, value: "PILOT-ACIK" });
    expect(parseSettingValue("auto_join_invite_code", " ")).toEqual({ ok: true, value: null });
  });
  it("geçersiz değerler reddedilir", () => {
    expect(parseSettingValue("kill_switch", "true").ok).toBe(false);
    expect(parseSettingValue("daily_session_limit", 1.5).ok).toBe(false);
    expect(parseSettingValue("effort_grade", "turbo").ok).toBe(false);
    expect(parseSettingValue("review_sample_rate", 2).ok).toBe(false);
    expect(parseSettingValue("auto_join_invite_code", "a b").ok).toBe(false);
  });
  it("cevap anahtarı ya da bilinmeyen anahtar listede yok", () => {
    expect(EDITABLE_KEYS).not.toContain("item_keys");
    expect(EDITABLE_KEYS).toContain("kill_switch");
  });
});

describe("cronAuthorized (M10 Bitti testi 5)", () => {
  it("gizli anahtar olmadan 401", () => {
    expect(cronAuthorized(null, "s3cret")).toBe(false);
    expect(cronAuthorized("Bearer wrong", "s3cret")).toBe(false);
    expect(cronAuthorized("Bearer s3cret", undefined)).toBe(false);
    expect(cronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });
});

describe("pickDefaultVoice", () => {
  const m = (locale: string) => [{ name: "simba-3.5", languages: [{ locale }] }];
  it("en-US kadın + anlatım etiketi önce; yoksa ilk kadın; yoksa ilk ses", () => {
    const voices = [
      { id: "m1", gender: "male", models: m("en-US") },
      { id: "f-uk", gender: "female", models: m("en-GB") },
      { id: "f1", gender: "female", models: m("en-US") },
      { id: "f2", gender: "female", tags: ["timbre:warm", "use-case:narration"], models: m("en-US") },
    ];
    expect(pickDefaultVoice(voices, "simba-3.5")?.id).toBe("f2");
    expect(pickDefaultVoice(voices.slice(0, 3), "simba-3.5")?.id).toBe("f1");
    expect(pickDefaultVoice(voices.slice(0, 1), "simba-3.5")?.id).toBe("m1");
    expect(pickDefaultVoice(voices, "other")).toBeNull();
  });
});
