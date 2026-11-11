import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES, isActivityType } from "@/lib/content/activity-types";
import { loadL1Codes, loadPlacement, loadTopics } from "../../scripts/lib/seed";

const placement = loadPlacement();
const items = placement.items;
const topicIds = new Set(loadTopics().map((t) => t.id));
const codes = new Set(loadL1Codes().map((c) => c.code));

const words = (s: string) =>
  s.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean).sort();

describe("placement.json (SPEC Ek C)", () => {
  it("14 soru, sıra 1–14", () => {
    expect(items).toHaveLength(14);
    expect(items.map((i) => i.position)).toEqual(Array.from({ length: 14 }, (_, n) => n + 1));
  });

  it("tür dağılımı: 6 mcq_read + 4 gap_fill, 2 listen_choose, 1 word_order, 1 speak_answer", () => {
    const types = items.map((i) => i.activity_type);
    expect(types.slice(0, 10).filter((t) => t === "mcq_read")).toHaveLength(6);
    expect(types.slice(0, 10).filter((t) => t === "gap_fill")).toHaveLength(4);
    expect(types.slice(10)).toEqual(["listen_choose", "listen_choose", "word_order", "speak_answer"]);
    for (const t of types) expect(ACTIVITY_TYPES).toContain(t);
  });

  it("hedef kodlar Ek C ile aynı", () => {
    expect(new Set(items.slice(0, 10).map((i) => i.l1_target))).toEqual(
      new Set([
        "L1.BE_OMIT", "L1.3SG_S", "L1.HE_SHE", "L1.ART_OMIT", "L1.DO_SUPPORT",
        "L1.Q_INVERSION", "L1.PLURAL_NUM", "L1.PREP_IN_ON_AT", "L1.SIMPLE_CONT", "L1.PERFECT_PAST",
      ]),
    );
    expect(items.slice(10, 13).map((i) => i.l1_target)).toEqual([
      "L1.TH_SOUND", "L1.W_V", "L1.WORD_ORDER_SOV",
    ]);
    expect(items[13].payload.prompt_en).toBe("Tell me about your day.");
  });

  it("konu ve kod kimlikleri seed'de var", () => {
    for (const i of items) {
      expect(topicIds, `#${i.position}`).toContain(i.topic_id);
      if (i.l1_target) expect(codes, `#${i.position}`).toContain(i.l1_target);
      for (const d of i.key.distractors ?? []) expect(codes, `#${i.position}`).toContain(d.code);
      for (const w of i.key.wrong_patterns ?? []) expect(codes, `#${i.position}`).toContain(w.code);
    }
  });

  it("SPEC 5.2 uzunluk sınırları", () => {
    for (const { position, payload: p, key: k } of items) {
      const at = `#${position}`;
      expect(p.instruction_tr.length, at).toBeLessThanOrEqual(140);
      expect((p.text_en ?? "").length, at).toBeLessThanOrEqual(600);
      expect((p.question_en ?? "").length, at).toBeLessThanOrEqual(160);
      expect((p.prompt_en ?? "").length, at).toBeLessThanOrEqual(200);
      for (const o of p.options ?? []) expect(o.length, at).toBeLessThanOrEqual(80);
      expect(k.explanation_short_tr.length, at).toBeLessThanOrEqual(220);
      expect(k.explanation_long_tr.length, at).toBeLessThanOrEqual(700);
      expect(k.hint_tr.length, at).toBeLessThanOrEqual(140);
      for (const d of k.distractors ?? []) expect(d.feedback_tr.length, at).toBeLessThanOrEqual(200);
    }
  });

  it("çoktan seçmelilerde doğru şık tam bir kez, her yanlış şık için bir çeldirici kaydı", () => {
    for (const i of items.filter((i) => ["mcq_read", "listen_choose"].includes(i.activity_type))) {
      const opts = i.payload.options!;
      expect(opts.length).toBeGreaterThanOrEqual(3);
      expect(opts.length).toBeLessThanOrEqual(4);
      expect(opts.filter((o) => o === i.key.correct), `#${i.position}`).toHaveLength(1);
      const wrong = opts.filter((o) => o !== i.key.correct).sort();
      expect(i.key.distractors!.map((d) => d.option).sort(), `#${i.position}`).toEqual(wrong);
    }
  });

  it("dinleme türlerinde seslendirilen metin payload'da yok (cevap sızmaz)", () => {
    for (const i of items.filter((i) => i.activity_type === "listen_choose")) {
      expect(i.payload.text_en, `#${i.position}`).toBeUndefined();
      expect(i.key.correct).toBeTruthy();
    }
  });

  it("boşluk doldurmada kabul edilen cevap var, yanlış kalıplar doğru cevaptan farklı", () => {
    for (const i of items.filter((i) => i.activity_type === "gap_fill")) {
      expect(i.payload.text_en, `#${i.position}`).toContain("___");
      expect(i.key.accepted!.length).toBeGreaterThan(0);
      for (const w of i.key.wrong_patterns ?? []) expect(i.key.accepted).not.toContain(w.answer);
    }
  });

  it("word_order: tokens, accepted[0]'ın bir permütasyonu ve karışık", () => {
    const i = items.find((i) => i.activity_type === "word_order")!;
    expect(words(i.payload.tokens!.join(" "))).toEqual(words(i.key.accepted![0]));
    expect(i.payload.tokens!.join(" ")).not.toBe(i.key.accepted![0]);
  });

  it("geçerli etkinlik türü yardımcıları", () => {
    expect(isActivityType("mcq_read")).toBe(true);
    expect(isActivityType("essay")).toBe(false);
  });
});
