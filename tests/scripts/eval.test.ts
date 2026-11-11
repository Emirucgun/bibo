import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LlmUsageRow } from "@/lib/ai/store";
import { TOPIC_IDS, L1_CODE_IDS } from "@/lib/content/taxonomy";
import { GoldenSet, percentile, sample, summarizeUsage, tagAgrees } from "../../scripts/lib/eval";

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
    const base = { score: 1, corrected: "", feedback_short_tr: "", explanation_long_tr: "", evidence: [] };
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
