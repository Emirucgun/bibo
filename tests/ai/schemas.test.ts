import { describe, expect, it } from "vitest";
import { llmCostUsd, priceFor } from "@/lib/ai/cost";
import { toStrictJsonSchema } from "@/lib/ai/json-schema";
import { GeneratedItem, GradeResult, SessionGen } from "@/lib/ai/schemas";
import { parseAiSettings } from "@/lib/ai/settings";
import { bySlot, TYPES_10, validItem } from "./fixtures";

const TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const UNSUPPORTED = ["maxLength", "minLength", "maxItems", "minimum", "maximum", "$schema"];

function walk(node: unknown, visit: (o: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}

describe("katı JSON şeması", () => {
  for (const [name, schema] of Object.entries({ SessionGen: SessionGen(TEN), SlotRegen: SessionGen([3, 5]), GradeResult })) {
    it(`${name}: desteklenmeyen sınır yok, her nesne kapalı, minItems ≤ 1`, () => {
      const json = toStrictJsonSchema(schema);
      walk(json, (o) => {
        for (const k of UNSUPPORTED) expect(o).not.toHaveProperty(k);
        if (o.type === "object") {
          expect(o.additionalProperties).toBe(false);
          expect(o).toHaveProperty("properties"); // z.record (serbest anahtar) yok
        }
        if (typeof o.minItems === "number") expect(o.minItems).toBeLessThanOrEqual(1);
      });
    });
  }

  it("sınırlar açıklamaya taşınır", () => {
    const json = JSON.stringify(toStrictJsonSchema(SessionGen(TEN)));
    expect(json).toContain("at most 140 characters");
    expect(json).toContain("at least 3 items");
  });

  it("her slot zorunlu bir anahtar; etkinlik tanımı $defs'te bir kez", () => {
    const json = toStrictJsonSchema(SessionGen(TEN)) as { required: string[]; properties: Record<string, { $ref?: string }>; $defs: Record<string, unknown> };
    expect(json.required).toEqual(TEN.map((p) => `slot_${p}`));
    expect(Object.values(json.properties).every((v) => v.$ref === "#/$defs/GeneratedItem")).toBe(true);
    expect(Object.keys(json.$defs)).toEqual(["GeneratedItem"]);
    expect((toStrictJsonSchema(SessionGen([3, 5])) as { required: string[] }).required).toEqual(["slot_3", "slot_5"]);
  });

  it("isteğe bağlı alan sayısı ≤ 24 (Anthropic sınırı)", () => {
    let optional = 0;
    walk(toStrictJsonSchema(SessionGen(TEN)), (o) => {
      if (o.type === "object" && o.properties) {
        const req = new Set((o.required as string[]) ?? []);
        optional += Object.keys(o.properties as object).filter((k) => !req.has(k)).length;
      }
    });
    expect(optional).toBeLessThanOrEqual(24);
  });

  it("konu ve kod enum'ları 32 / 24 değer", () => {
    const json = toStrictJsonSchema(GradeResult) as { properties: { errors: { items: { properties: Record<string, { enum: string[] }> } } } };
    const props = json.properties.errors.items.properties;
    expect(props.topic_id.enum).toHaveLength(32);
    expect(props.l1_code.enum).toHaveLength(24);
  });
});

describe("Zod doğrulaması cevapta sınırları yine uygular", () => {
  it("10 slotun hepsi geçer; eksik slot geçmez", () => {
    const items = TYPES_10.map((t, i) => validItem(i + 1, t));
    expect(SessionGen(TEN).safeParse(bySlot(items)).success).toBe(true);
    expect(SessionGen(TEN).safeParse(bySlot(items.slice(0, 7))).success).toBe(false);
  });

  it("uzun kısa açıklama ve bilinmeyen kod reddedilir", () => {
    const item = validItem(1, "gap_fill");
    const long = { ...item, key: { ...item.key, explanation_short_tr: "x".repeat(221) } };
    expect(GeneratedItem.safeParse(long).success).toBe(false);
    const badCode = { ...item, key: { ...item.key, wrong_patterns: [{ answer: "a", code: "L1.NOPE" }] } };
    expect(GeneratedItem.safeParse(badCode).success).toBe(false);
  });
});

describe("maliyet", () => {
  it("SPEC 8 tipik üretim: 6.500 girdi + 8.500 çıktı ≈ 0,00490 $", () => {
    expect(llmCostUsd("claude-haiku-5-5", { input_tokens: 6500, output_tokens: 8500, cache_read_tokens: 0, cache_write_tokens: 0 })).toBe(0.0049);
  });

  it("önbellek okuma onda bir, yazma 1,25 kat", () => {
    const p = priceFor("claude-haiku-5-5");
    expect(p.cache_read).toBeCloseTo(p.input / 10);
    expect(p.cache_write).toBeCloseTo(p.input * 1.25);
    expect(llmCostUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_tokens: 1_000_000, cache_write_tokens: 1_000_000 })).toBe(0.135);
  });

  it("bilinmeyen model hata verir (sessizce 0 $ yazılmaz)", () => {
    expect(() => llmCostUsd("unknown", { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0 })).toThrow();
  });
});

describe("app_settings", () => {
  const rows = [
    { key: "kill_switch", value: false },
    { key: "monthly_budget_usd", value: 40 },
    { key: "daily_session_limit", value: 2 },
    { key: "model_generate", value: "claude-haiku-5-5" },
    { key: "model_grade", value: "claude-haiku-5-5" },
    { key: "effort_generate", value: "medium" },
    { key: "effort_grade", value: "low" },
    { key: "thinking_grade", value: "adaptive" },
    { key: "tts_plan_usd", value: 0 },
    { key: "tts_voice", value: null },
  ];

  it("göçteki varsayılanlar okunur", () => {
    expect(parseAiSettings(rows)).toMatchObject({ effort_generate: "medium", effort_grade: "low", monthly_budget_usd: 40 });
  });

  it("eksik anahtar varsayılana düşmez, hata verir", () => {
    expect(() => parseAiSettings(rows.filter((r) => r.key !== "kill_switch"))).toThrow(/kill_switch/);
  });
});
