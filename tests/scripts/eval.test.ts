import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LlmUsageRow } from "@/lib/ai/store";
import { TOPIC_IDS, TOPICS, L1_CODE_IDS } from "@/lib/content/taxonomy";
import { GoldenSet, goldenFromCsv, percentile, sample, summarizeUsage, tagAgrees } from "../../scripts/lib/eval";
import { parseCsv } from "../../scripts/lib/seed";

const row = (o: Partial<LlmUsageRow>): LlmUsageRow => ({
  user_id: null, session_id: null, purpose: "generate", provider: "openrouter", model: "m",
  input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
  audio_seconds: null, tts_chars: null, cost_usd: 0, latency_ms: 0, ok: true, error: null, ...o,
});

describe("eval yardımcıları", () => {
  it("percentile (en yakın sıra)", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 90)).toBe(9);
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile([42], 90)).toBe(42);
  });

  it("kullanım özeti ve ilk çağrıdan sonraki önbellek isabeti", () => {
    const s = summarizeUsage([
      row({ cost_usd: 0.004, cache_write_tokens: 5000 }),
      row({ cost_usd: 0.003, cache_read_tokens: 5000 }),
      row({ cost_usd: 0.003, cache_read_tokens: 0 }),
      row({ ok: false, error: "http_529" }),
    ]);
    expect(s).toMatchObject({ calls: 4, ok: 3, cost_usd: 0.01, cache_read_tokens: 5000 });
    expect(s.cache_hit_rate_after_first).toBe(0.5);
  });

  it("örneklem tohumlu ve tekrarsız", () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const a = sample(xs, 20, 7);
    expect(a).toEqual(sample(xs, 20, 7));
    expect(new Set(a).size).toBe(20);
  });

  it("uyum: doğru cevapta hatasız, hatalıda birincil kod", () => {
    const base = { score: 1, corrected: "", feedback_short_tr: "", explanation_long_tr: "", evidence: [], confidence: "high" as const };
    const err = { span: "play", correction: "plays", l1_code: "L1.3SG_S" as const, topic_id: "g.present_simple_3sg" as const };
    expect(tagAgrees({ is_correct: true, l1_codes: [] }, { ...base, is_correct: true, errors: [] })).toBe(true);
    expect(tagAgrees({ is_correct: true, l1_codes: [] }, { ...base, is_correct: false, errors: [err] })).toBe(false);
    expect(tagAgrees({ is_correct: false, l1_codes: ["L1.3SG_S"] }, { ...base, is_correct: false, errors: [err] })).toBe(true);
    expect(tagAgrees({ is_correct: false, l1_codes: ["L1.BE_OMIT"] }, { ...base, is_correct: false, errors: [err] })).toBe(false);
  });

  it("golden.example.json biçime uyar, konu ve kodlar taksonomide", () => {
    const set = GoldenSet.parse(JSON.parse(readFileSync(new URL("../../scripts/data/golden.example.json", import.meta.url), "utf8")));
    for (const g of set) {
      expect(TOPIC_IDS as readonly string[]).toContain(g.topic_id);
      for (const c of g.expected.l1_codes) expect(L1_CODE_IDS as readonly string[]).toContain(c);
    }
  });
});

const TAX = { topics: TOPICS, codes: L1_CODE_IDS };
const csvRow = (o: Record<string, string> = {}) => ({
  id: "g01", etkinlik_turu: "translate_tr_en", konu: "g.present_simple_3sg", seviye: "A1",
  gorev: "Kardeşim futbol oynar.", model_cevap: "My brother plays football.", ogrenci_cevabi: "My brother play football.",
  dogru_mu: "hayir", birincil_kod: "L1.3SG_S", diger_kodlar: "", not: "", ...o,
});

describe("altın set CSV'si", () => {
  it("satırı GoldenItem'a çevirir; birincil kod ilk sırada", () => {
    const { items, errors } = goldenFromCsv([csvRow({ diger_kodlar: "GEN.SPELLING; GEN.VOCAB" })], TAX);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      id: "g01", topic_id: "g.present_simple_3sg", task: "Kardeşim futbol oynar.", student_text: "My brother play football.",
      expected: { is_correct: false, l1_codes: ["L1.3SG_S", "GEN.SPELLING", "GEN.VOCAB"] },
    });
    const right = goldenFromCsv([csvRow({ dogru_mu: "evet", birincil_kod: "", ogrenci_cevabi: "My brother plays football." })], TAX);
    expect(right.items[0].expected).toEqual({ is_correct: true, l1_codes: [] });
  });

  it("yanlış yazılmış kod, konu, tür ve tutarsız etiket reddedilir", () => {
    const bad = (o: Record<string, string>) => goldenFromCsv([csvRow(o)], TAX);
    expect(bad({ birincil_kod: "L1.3sg_s" }).errors).toEqual(["g01: bilinmeyen kod 'L1.3sg_s'"]);
    expect(bad({ konu: "g.nope" }).errors[0]).toContain("bilinmeyen konu");
    expect(bad({ etkinlik_turu: "gap_fill" }).errors[0]).toContain("bilinmeyen etkinlik türü");
    expect(bad({ dogru_mu: "evet" }).errors[0]).toContain("doğru cevapta kod olmamalı");
    expect(bad({ birincil_kod: "" }).errors[0]).toContain("birincil_kod boş");
    expect(bad({ ogrenci_cevabi: "My brother plays football." }).errors[0]).toContain("model cevapla aynı");
    expect(bad({ dogru_mu: "yes" }).errors[0]).toContain("evet/hayir");
    expect(bad({ birincil_kod: "L1.3SG_S" }).items).toHaveLength(1);
    expect(goldenFromCsv([csvRow(), csvRow()], TAX).errors).toEqual(["g01: id tekrar ediyor"]);
    expect(goldenFromCsv([{ id: "x" }], TAX).errors[0]).toContain("eksik sütun");
  });

  it("seviye konu seviyesinden farklıysa ve cevap tekrar ediyorsa uyarır", () => {
    const { warnings, errors } = goldenFromCsv([csvRow({ seviye: "A2" }), csvRow({ id: "g02" })], TAX);
    expect(errors).toEqual([]);
    expect(warnings).toEqual(["g01: seviye A2, konu g.present_simple_3sg ise A1", "g02: öğrenci cevabı g01 ile aynı"]);
  });

  it("golden.json, docs/pedagoji/altin-set.csv ile eşit ve hatasız", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    const { items, errors } = goldenFromCsv(parseCsv(read("../../docs/pedagoji/altin-set.csv")), TAX);
    expect(errors).toEqual([]);
    expect(GoldenSet.parse(JSON.parse(read("../../scripts/data/golden.json")))).toEqual(items);
    expect(items.length).toBeGreaterThanOrEqual(40);
  });
});
