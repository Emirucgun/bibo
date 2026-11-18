// Değerlendirmede çoğunluk oyu (karar 11, kesinlik önceliği).
import { describe, expect, it } from "vitest";
import { voteGrades } from "@/lib/ai/grade-vote";
import type { GradeResult } from "@/lib/ai/schemas";

const err3sg = { span: "play", correction: "plays", l1_code: "L1.3SG_S" as const, topic_id: "g.present_simple_3sg" as const };
const errArt = { span: "a apple", correction: "an apple", l1_code: "GEN.OTHER" as const, topic_id: "g.articles_a_an" as const };

const g = (over: Partial<GradeResult>): GradeResult => ({
  is_correct: true,
  score: 1,
  corrected: "He plays football.",
  feedback_short_tr: "Harika.",
  explanation_long_tr: "Doğru.",
  errors: [],
  evidence: [{ topic_id: "g.present_simple_3sg", correct: true }],
  confidence: "high",
  ...over,
});

describe("voteGrades", () => {
  it("tek örnek aynen döner; güven modelin güveni", () => {
    const one = g({ confidence: "medium" });
    expect(voteGrades([one])).toEqual({ result: one, agreement: 1, confidence: 0.8, samples: 1 });
  });

  it("tek örnekte görülen hata atılır (yanlış alarm); çoğunluğun hatası kalır", () => {
    const wrong = g({ is_correct: false, score: 0.5, errors: [err3sg, errArt], corrected: "He plays an apple." });
    const wrong2 = g({ is_correct: false, score: 0.4, errors: [{ ...err3sg, span: "Play" }], corrected: "He plays." });
    const right = g({});
    const v = voteGrades([wrong, wrong2, right]);
    expect(v.result.is_correct).toBe(false);
    expect(v.result.errors).toHaveLength(1);
    expect(v.result.errors[0]).toMatchObject({ correction: "plays", l1_code: "L1.3SG_S" });
    expect(v.result.score).toBeCloseTo(0.45, 5);
    expect(v.agreement).toBeCloseTo(2 / 3, 5);
    // Metinler kalan hatayla en uyumlu örnekten.
    expect(v.result.corrected).toBe("He plays.");
  });

  it("yanlış kararı için çoğunluk gerekir; eşitlikte doğru sayılır", () => {
    const wrong = g({ is_correct: false, score: 0.3, errors: [err3sg] });
    expect(voteGrades([wrong, g({}), g({})]).result).toMatchObject({ is_correct: true, errors: [], score: 1 });
    expect(voteGrades([wrong, g({})]).result.is_correct).toBe(true);
    expect(voteGrades([wrong, g({})]).agreement).toBe(0.5);
  });

  it("kanıt: yarıdan fazla örnekte geçen konu, doğruluğu çoğunlukla", () => {
    const a = g({ evidence: [{ topic_id: "g.present_simple_3sg", correct: false }, { topic_id: "g.be_present", correct: true }] });
    const b = g({ evidence: [{ topic_id: "g.present_simple_3sg", correct: false }] });
    const c = g({ evidence: [{ topic_id: "g.present_simple_3sg", correct: true }] });
    expect(voteGrades([a, b, c]).result.evidence).toEqual([{ topic_id: "g.present_simple_3sg", correct: false }]);
  });

  it("güven: uyum × uyumlu örneklerin ortalama güveni", () => {
    const v = voteGrades([g({ confidence: "high" }), g({ confidence: "low" }), g({ is_correct: false, errors: [err3sg] })]);
    expect(v.confidence).toBeCloseTo((2 / 3) * 0.75, 3);
  });
});
