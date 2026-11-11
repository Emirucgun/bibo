import { describe, expect, it } from "vitest";
import {
  applyEvidence,
  emptyMastery,
  evidenceFromAttempt,
  masteryBand,
  prior,
  reviewIntervalDays,
} from "@/lib/engine/mastery";
import type { Evidence, Mode } from "@/lib/engine/types";
import { DAY, NOW } from "./fixtures";

const ev = (o: Partial<Evidence> = {}): Evidence => ({
  topic_id: "g.present_simple_3sg",
  skill: "writing",
  mode: "controlled",
  score: 1,
  is_correct: true,
  hint_used: false,
  incidental: false,
  ...o,
});

describe("prior (SPEC 4.1)", () => {
  it("l1_risk 0/1/2 → 0,50 / 0,35 / 0,20", () => {
    expect([0, 1, 2].map((r) => prior({ l1_risk: r as 0 | 1 | 2 }))).toEqual([0.5, 0.35, 0.2]);
  });
});

describe("applyEvidence", () => {
  it("ROADMAP: tek cevap ustalığı en çok 0,25 değiştirir (her mod, her uç)", () => {
    for (const mode of ["recognition", "controlled", "free"] as Mode[]) {
      for (const start of [0, 0.2, 0.5, 1]) {
        for (const score of [0, 1]) {
          const before = { ...emptyMastery({ l1_risk: 0 }), score: start };
          const after = applyEvidence(before, ev({ mode, score, is_correct: score === 1 }), NOW);
          expect(Math.abs(after.score - start)).toBeLessThanOrEqual(0.25 + 1e-9);
        }
      }
    }
    const extreme = applyEvidence({ ...emptyMastery({ l1_risk: 0 }), score: 0 }, ev(), NOW);
    expect(extreme.score).toBe(0.25);
  });

  it("ROADMAP: ipuçlu cevap en çok 0,5 sayılır", () => {
    const start = { ...emptyMastery({ l1_risk: 0 }), score: 0.5 };
    const withHint = applyEvidence(start, ev({ hint_used: true }), NOW);
    expect(withHint.score).toBe(0.5); // 0.5 + 0.25 × (0.5 − 0.5)
    const low = applyEvidence({ ...start, score: 0.2 }, ev({ hint_used: true }), NOW);
    expect(low.score).toBe(0.275); // o = 0.5 → 0.2 + 0.25 × 0.3
  });

  it("tanıma modunda alpha 0,15, yan kanıtta yarısı", () => {
    const s = { ...emptyMastery({ l1_risk: 0 }), score: 0 };
    expect(applyEvidence(s, ev({ mode: "recognition" }), NOW).score).toBe(0.15);
    expect(applyEvidence(s, ev({ incidental: true }), NOW).score).toBe(0.125);
    expect(applyEvidence(s, ev({ mode: "recognition", incidental: true }), NOW).score).toBe(0.075);
  });

  it("n, correct, last_seen_at ve next_review_at güncellenir", () => {
    const after = applyEvidence(emptyMastery({ l1_risk: 1 }), ev(), NOW);
    expect(after).toMatchObject({ n: 1, correct: 1, last_seen_at: NOW });
    expect(after.score).toBe(0.513); // 0.35 + 0.25 × 0.65, üç ondalık
    expect(after.next_review_at!.getTime() - NOW.getTime()).toBe(3 * DAY); // doğru ve 0.5 ≤ m < 0.7
  });
});

describe("aralıklı tekrar (SPEC 4.2)", () => {
  it.each([
    [false, 0.9, 1],
    [true, 0.49, 1],
    [true, 0.5, 3],
    [true, 0.69, 3],
    [true, 0.7, 7],
    [true, 0.84, 7],
    [true, 0.85, 14],
  ])("correct=%s, m=%s → %s gün", (correct, m, days) => {
    expect(reviewIntervalDays(correct, m)).toBe(days);
  });
});

describe("masteryBand (ilerleme ızgarası)", () => {
  it("dört renk", () => {
    expect(masteryBand({ n: 0, score: 0.9 })).toBe("unknown");
    expect(masteryBand({ n: 2, score: 0.44 })).toBe("weak");
    expect(masteryBand({ n: 2, score: 0.45 })).toBe("developing");
    expect(masteryBand({ n: 2, score: 0.7 })).toBe("solid");
  });
});

describe("evidenceFromAttempt", () => {
  it("hedef kanıt + yan kanıtlar (incidental, hedef konu tekrarlanmaz)", () => {
    const list = evidenceFromAttempt({
      topic_id: "g.present_simple_3sg",
      skill: "writing",
      mode: "free",
      score: 0.6,
      is_correct: false,
      hint_used: false,
      incidental: [
        { topic_id: "g.present_simple_3sg", correct: true },
        { topic_id: "g.articles_a_an", correct: false },
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ topic_id: "g.present_simple_3sg", incidental: false, score: 0.6 });
    expect(list[1]).toMatchObject({ topic_id: "g.articles_a_an", incidental: true, score: 0, is_correct: false });
  });
});
