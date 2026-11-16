import { describe, expect, it } from "vitest";
import { GeneratedItem } from "@/lib/ai/schemas";
import { ACTIVITY_TYPE_INFO, ACTIVITY_TYPES } from "@/lib/content/activity-types";
import { planSession } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type { PlanSlot } from "@/lib/engine/types";
import { nextExplainMode } from "@/lib/session/explain-mode";
import { applyTextFallback, LISTENING_FALLBACK, SPEAKING_FALLBACK } from "@/lib/session/fallback";
import { splitGeneratedItem, splitGeneratedItems } from "@/lib/session/save-items";
import { validItem } from "../ai/fixtures";
import { plannerInput } from "../engine/fixtures";

const slot = (position: number, activity_type: PlanSlot["activity_type"]): PlanSlot => ({
  position,
  topic_id: "g.present_simple_3sg",
  skill: ACTIVITY_TYPE_INFO[activity_type].skill,
  activity_type,
  mode: ACTIVITY_TYPE_INFO[activity_type].mode,
  purpose: "focus",
  l1_target: "L1.3SG_S",
  interest: "football",
  reason: "odak",
});

describe("applyTextFallback (M6 geçici bayrağı)", () => {
  it("dinleme ve konuşma türleri aynı moddaki metin türüne düşer", () => {
    expect(LISTENING_FALLBACK).toEqual({ listen_choose: "mcq_read", dictation: "gap_fill" });
    expect(SPEAKING_FALLBACK).toEqual(["short_write", "translate_tr_en"]);
    for (const [from, to] of Object.entries(LISTENING_FALLBACK)) {
      expect(ACTIVITY_TYPE_INFO[to].mode).toBe(ACTIVITY_TYPE_INFO[from as "listen_choose"].mode);
    }
    for (const to of SPEAKING_FALLBACK) expect(ACTIVITY_TYPE_INFO[to].mode).toBe(ACTIVITY_TYPE_INFO.speak_answer.mode);
  });

  it("konuşma slotları sırayla kısa yazma ve çeviriye düşer", () => {
    const out = applyTextFallback([1, 2, 3, 4, 5].map((p) => slot(p, p === 3 ? "gap_fill" : "speak_answer")));
    expect(out.map((s) => s.activity_type)).toEqual(["short_write", "translate_tr_en", "gap_fill", "short_write", "translate_tr_en"]);
  });

  it("beceri ve mod yeni türden gelir; diğer alanlar ve metin türleri değişmez", () => {
    const out = applyTextFallback(ACTIVITY_TYPES.map((t, i) => slot(i + 1, t)));
    expect(out.map((s) => s.activity_type)).toEqual([
      "mcq_read", "gap_fill", "word_order", "mcq_read", "gap_fill", "translate_tr_en", "short_write", "short_write",
    ]);
    for (const s of out) {
      expect(s.skill).toBe(ACTIVITY_TYPE_INFO[s.activity_type].skill);
      expect(["reading", "writing"]).toContain(s.skill);
      expect(s).toMatchObject({ topic_id: "g.present_simple_3sg", purpose: "focus", l1_target: "L1.3SG_S" });
    }
    expect(out[7].reason).toContain("speak_answer → short_write");
    expect(out[2]).toEqual(slot(3, "word_order"));
  });

  it("gerçek planlarda düşürmeden sonra dinleme/konuşma kalmaz, sayı 8–10", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planSession(plannerInput({ rng: createRng(seed), settings: { tts_enabled: false, general_content_rate: 0.2 } }));
      const slots = applyTextFallback(plan.slots);
      expect(slots.length).toBeGreaterThanOrEqual(8);
      expect(slots.length).toBeLessThanOrEqual(10);
      expect(slots.some((s) => s.skill === "listening" || s.skill === "speaking")).toBe(false);
    }
  });
});

describe("splitGeneratedItem (items / item_keys)", () => {
  it("anahtar alanları payload'a, payload alanları anahtara karışmaz", () => {
    for (const type of ACTIVITY_TYPES) {
      const row = splitGeneratedItem(validItem(1, type), slot(1, type));
      const payload = JSON.stringify(row.payload);
      for (const field of ["correct", "accepted", "distractors", "wrong_patterns", "model_answer_en", "hint_tr", "explanation"]) {
        expect(payload, `${type}.${field}`).not.toContain(field);
      }
      expect(row.key.hint_tr).toBeTruthy();
      expect(row).toMatchObject({ skill: ACTIVITY_TYPE_INFO[type].skill, mode: ACTIVITY_TYPE_INFO[type].mode, purpose: "focus", interest: "football", l1_target: "L1.3SG_S" });
    }
  });

  it("dinleme türlerinde seslendirilen `text_en` anahtara taşınır (PLAN karar 14)", () => {
    for (const type of ["listen_choose", "dictation"] as const) {
      const item = validItem(2, type);
      const row = splitGeneratedItem(item, slot(2, type));
      expect(row.payload.text_en).toBeUndefined();
      expect(row.key.text_en).toBe(item.payload.text_en);
      expect(JSON.stringify(row.payload)).not.toContain(item.payload.text_en!);
      // Kaynak nesne değişmez.
      expect(item.payload.text_en).toBeTruthy();
    }
  });

  it("okuma metni ve boşluklu cümle payload'da kalır", () => {
    expect(splitGeneratedItem(validItem(1, "mcq_read"), slot(1, "mcq_read")).payload.text_en).toBeTruthy();
    expect(splitGeneratedItem(validItem(1, "gap_fill"), slot(1, "gap_fill")).payload.text_en).toContain("___");
  });

  it("konum plan slotundan gelir; slotu olmayan etkinlik atılır", () => {
    const items: GeneratedItem[] = [validItem(3, "gap_fill"), validItem(9, "mcq_read")];
    const rows = splitGeneratedItems(items, [slot(3, "gap_fill")]);
    expect(rows.map((r) => r.position)).toEqual([3]);
  });
});

describe("nextExplainMode (PRD F4)", () => {
  it("kısa → uzun: yanlışların ≥ %50'sinde açılmışsa", () => {
    expect(nextExplainMode("short", { wrong: 4, opened: 2 })).toBe("long");
    expect(nextExplainMode("short", { wrong: 4, opened: 1 })).toBe("short");
  });
  it("uzun → kısa: < %20 ise; aradaki boşlukta mod değişmez", () => {
    expect(nextExplainMode("long", { wrong: 10, opened: 1 })).toBe("short");
    expect(nextExplainMode("long", { wrong: 10, opened: 2 })).toBe("long");
    expect(nextExplainMode("long", { wrong: 10, opened: 4 })).toBe("long");
    expect(nextExplainMode("short", { wrong: 10, opened: 4 })).toBe("short");
  });
  it("yanlış cevap yoksa mod değişmez", () => {
    expect(nextExplainMode("short", { wrong: 0, opened: 0 })).toBe("short");
    expect(nextExplainMode("long", { wrong: 0, opened: 0 })).toBe("long");
  });
});
