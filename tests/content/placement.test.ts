import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPE_INFO, isActivityType } from "@/lib/content/activity-types";
import { p4 } from "@/lib/engine/irt";
import { nextPlacementStep, type PlacementAnswer, type PlacementBankItem } from "@/lib/engine/placement-cat";
import { createRng } from "@/lib/engine/random";
import { loadL1Codes, loadPlacementBank, loadTopics } from "../../scripts/lib/seed";

const bank = loadPlacementBank();
const topics = new Map(loadTopics().map((t) => [t.id, t]));
const codes = new Set(loadL1Codes().map((c) => c.code));
const LOCAL = new Set(["mcq_read", "gap_fill", "word_order", "listen_choose", "dictation"]);
const BANDS: Record<string, [number, number]> = { preA1: [-3, -1.5], A1: [-1.5, 0], A2: [0, 1.5], B1: [1.5, 3], B2: [3, 4.5] };
const words = (s: string) => s.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean).sort();

describe("placement_bank.json (docs/SPEC.md 4.7, Ek C)", () => {
  it("taslak durumda ve en az 120 madde; her seviyede yeterli madde", () => {
    expect(bank.status).toBe("draft_pending_pedagogy");
    expect(bank.items.length).toBeGreaterThanOrEqual(120);
    const by = (c: string) => bank.items.filter((i) => i.cefr === c).length;
    expect(by("preA1")).toBeGreaterThanOrEqual(10);
    expect(by("A1")).toBeGreaterThanOrEqual(25);
    expect(by("A2")).toBeGreaterThanOrEqual(25);
    expect(by("B1")).toBeGreaterThanOrEqual(25);
    expect(by("B2")).toBeGreaterThanOrEqual(10);
  });

  it("kimlikler tekil, türler yerel puanlanır, konu ve kodlar seed'de var", () => {
    expect(new Set(bank.items.map((i) => i.id)).size).toBe(bank.items.length);
    for (const i of bank.items) {
      expect(isActivityType(i.activity_type), i.id).toBe(true);
      expect(LOCAL.has(i.activity_type), i.id).toBe(true);
      expect(topics.has(i.topic_id), i.id).toBe(true);
      if (i.cefr === "B1" || i.cefr === "B2") expect(topics.get(i.topic_id)!.kind, i.id).toBe("measure");
      if (i.l1_target) expect(codes, i.id).toContain(i.l1_target);
      for (const d of i.key.distractors ?? []) expect(codes, i.id).toContain(d.code);
      for (const w of i.key.wrong_patterns ?? []) expect(codes, i.id).toContain(w.code);
    }
  });

  it("IRT önselleri bant içinde ve geçerli", () => {
    for (const i of bank.items) {
      const [lo, hi] = BANDS[i.cefr];
      expect(i.irt.b, i.id).toBeGreaterThanOrEqual(lo - 0.3);
      expect(i.irt.b, i.id).toBeLessThanOrEqual(hi + 0.3);
      expect(i.irt.a).toBeGreaterThan(0);
      expect(i.irt.c).toBeGreaterThanOrEqual(0);
      expect(i.irt.d).toBeLessThanOrEqual(1);
    }
  });

  it("anahtarlar türle tutarlı", () => {
    for (const i of bank.items) {
      const t = i.activity_type;
      if (t === "mcq_read" || t === "listen_choose") {
        expect(i.payload.options, i.id).toContain(i.key.correct);
        expect(new Set(i.payload.options).size, i.id).toBe(i.payload.options!.length);
        expect(i.key.distractors!.length, i.id).toBe(i.payload.options!.length - 1);
      }
      if (t === "listen_choose" || t === "dictation") expect(i.key.text_en, i.id).toBeTruthy();
      if (t === "gap_fill") {
        expect(i.payload.text_en, i.id).toContain("___");
        expect(i.key.accepted!.length, i.id).toBeGreaterThan(0);
      }
      if (t === "word_order") for (const a of i.key.accepted!) expect(words(a), i.id).toEqual(words(i.payload.tokens!.join(" ")));
      if (t === "dictation") expect(i.key.correct, i.id).toBe(i.key.text_en);
    }
  });

  it("konuşma maddesi var", () => {
    expect(bank.speaking.activity_type).toBe("speak_answer");
    expect(ACTIVITY_TYPE_INFO.speak_answer.grading).toBe("llm_audio");
    expect(bank.speaking.payload.prompt_en).toBeTruthy();
  });

  it("gerçek bankayla simülasyon: önseller doğruysa %82+ doğruluk, ≤ 20 madde, yanlış dışlama ≤ %3", () => {
    const items: PlacementBankItem[] = bank.items.map((i) => ({
      id: i.id, cefr: i.cefr, topic_id: i.topic_id, activity_type: i.activity_type as PlacementBankItem["activity_type"],
      skill: ACTIVITY_TYPE_INFO[i.activity_type as PlacementBankItem["activity_type"]].skill, irt: i.irt,
    }));
    const N = 150;
    let right = 0, n = 0, a2 = 0, falseGate = 0;
    for (let s = 0; s < N; s++) {
      const theta = -2.4 + (5.6 * (s + 0.5)) / N;
      const rng = createRng(1000 + s);
      const answers: PlacementAnswer[] = [];
      let outcome;
      for (let g = 0; g < 40 && !outcome; g++) {
        const step = nextPlacementStep({ bank: items, answers, listening: true, rng });
        if (step.kind === "done") outcome = step.outcome;
        else answers.push({ item_id: step.item.id, score: rng() < p4(theta, step.item.irt) ? 1 : 0 });
      }
      const truth = theta < 0 ? "A1" : theta < 1.5 ? "A2" : "B1+";
      if (outcome!.level === truth) right++;
      if (truth === "A2") { a2++; if (outcome!.gate) falseGate++; }
      n += answers.length;
    }
    expect(right / N).toBeGreaterThan(0.82);
    expect(n / N).toBeLessThanOrEqual(20);
    expect(falseGate / a2).toBeLessThanOrEqual(0.03);
  });
});
