import { describe, expect, it } from "vitest";
import {
  classOf,
  classProbs,
  expectedClassEntropy,
  fisherInfo,
  normalCdf,
  normalize,
  normalLogPrior,
  addResponse,
  p4,
  posteriorMean,
  type IrtParams,
} from "@/lib/engine/irt";
import {
  decide,
  DEFAULT_PLACEMENT_CONFIG,
  nextPlacementStep,
  type Cefr,
  type PlacementAnswer,
  type PlacementBankItem,
} from "@/lib/engine/placement-cat";
import { createRng } from "@/lib/engine/random";
import type { ActivityType, Skill } from "@/lib/content/activity-types";

const ITEM: IrtParams = { a: 1.2, b: 0.5, c: 0.25, d: 0.98 };

describe("irt", () => {
  it("4PL is bounded by c and d and equals the midpoint at θ = b", () => {
    expect(p4(-20, ITEM)).toBeCloseTo(0.25, 5);
    expect(p4(20, ITEM)).toBeCloseTo(0.98, 5);
    expect(p4(0.5, ITEM)).toBeCloseTo((0.25 + 0.98) / 2, 5);
  });

  it("information peaks near the item difficulty", () => {
    const at = (t: number) => fisherInfo(t, { a: 1.3, b: 1, c: 0, d: 1 });
    expect(at(1)).toBeGreaterThan(at(-1));
    expect(at(1)).toBeGreaterThan(at(3));
  });

  it("normalCdf matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("a correct answer moves the posterior up, a wrong one down", () => {
    const prior = normalLogPrior(0, 1.5);
    const up = posteriorMean(normalize(addResponse(prior, ITEM, 1)));
    const down = posteriorMean(normalize(addResponse(prior, ITEM, 0)));
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
  });

  it("class probabilities sum to 1 and follow the cuts", () => {
    const post = normalize(normalLogPrior(0.75, 0.2));
    const p = classProbs(post, [0, 1.5]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(p[1]).toBeGreaterThan(0.99);
    expect(classOf(-0.1, [0, 1.5])).toBe(0);
    expect(classOf(1.5, [0, 1.5])).toBe(2);
  });

  it("an item near the cut reduces expected class entropy more than a far one", () => {
    const post = normalize(normalLogPrior(1.4, 0.6));
    const near = expectedClassEntropy(post, { a: 1.2, b: 1.5, c: 0, d: 0.98 }, [0, 1.5]);
    const far = expectedClassEntropy(post, { a: 1.2, b: -2.5, c: 0, d: 0.98 }, [0, 1.5]);
    expect(near).toBeLessThan(far);
  });
});

// ------------------------------------------------------------------ sentetik banka
const BANDS: [Cefr, number, number, number][] = [
  ["preA1", -3, -1.5, 15],
  ["A1", -1.5, 0, 35],
  ["A2", 0, 1.5, 45],
  ["B1", 1.5, 3, 40],
  ["B2", 3, 4.5, 15],
];
const TYPES: [ActivityType, Skill][] = [
  ["mcq_read", "reading"],
  ["gap_fill", "writing"],
  ["word_order", "writing"],
  ["listen_choose", "listening"],
  ["dictation", "listening"],
];

function bank(seed = 3): PlacementBankItem[] {
  const rng = createRng(seed);
  const out: PlacementBankItem[] = [];
  let i = 0;
  for (const [cefr, lo, hi, n] of BANDS) {
    for (let k = 0; k < n; k++) {
      const [activity_type, skill] = TYPES[i % TYPES.length];
      const choice = activity_type === "mcq_read" || activity_type === "listen_choose";
      out.push({
        id: `it-${i}`,
        cefr,
        topic_id: cefr === "B1" ? "m.b1" : cefr === "B2" ? "m.b2" : `g.t${i % 20}`,
        activity_type,
        skill,
        irt: { a: 1.2, b: lo + (hi - lo) * rng(), c: choice ? 0.25 : 0, d: 0.98 },
      });
      i++;
    }
  }
  return out;
}

function runExaminee(theta: number, seed: number, b = bank(), listening = true) {
  const rng = createRng(seed);
  const answers: PlacementAnswer[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const step = nextPlacementStep({ bank: b, answers, levelSelf: "unsure", listening, rng });
    if (step.kind === "done") return { outcome: step.outcome, asked: answers.map((a) => b.find((x) => x.id === a.item_id)!) };
    answers.push({ item_id: step.item.id, score: rng() < p4(theta, step.item.irt) ? 1 : 0 });
  }
  throw new Error("test did not stop");
}

describe("nextPlacementStep", () => {
  it("starts with easy A1 warm-up items", () => {
    const step = nextPlacementStep({ bank: bank(), answers: [], listening: true, rng: createRng(1) });
    expect(step.kind).toBe("ask");
    if (step.kind === "ask") expect(["A1", "preA1"]).toContain(step.item.cefr);
  });

  it("never asks listening items when listening is unavailable", () => {
    const { asked } = runExaminee(0.7, 5, bank(), false);
    expect(asked.every((a) => a.skill !== "listening")).toBe(true);
  });

  it("does not ask the same item twice and respects the length limits", () => {
    for (let s = 1; s <= 20; s++) {
      const { asked } = runExaminee(-1 + (s % 5), s);
      expect(new Set(asked.map((a) => a.id)).size).toBe(asked.length);
      expect(asked.length).toBeGreaterThanOrEqual(DEFAULT_PLACEMENT_CONFIG.min_items);
      expect(asked.length).toBeLessThanOrEqual(DEFAULT_PLACEMENT_CONFIG.max_items + DEFAULT_PLACEMENT_CONFIG.extension_items);
    }
  });

  it("classifies a synthetic population accurately with few items", () => {
    const b = bank();
    let right = 0;
    let items = 0;
    let falseGate = 0;
    let a2 = 0;
    const N = 160;
    for (let s = 0; s < N; s++) {
      const theta = -2.5 + (6 * (s + 0.5)) / N;
      const { outcome, asked } = runExaminee(theta, 100 + s, b);
      const truth = theta < 0 ? "A1" : theta < 1.5 ? "A2" : "B1+";
      if (outcome.level === truth) right++;
      if (truth === "A2") {
        a2++;
        if (outcome.gate) falseGate++;
      }
      items += asked.length;
    }
    expect(right / N).toBeGreaterThan(0.8);
    expect(items / N).toBeLessThan(20);
    expect(falseGate / a2).toBeLessThan(0.08);
  });

  it("gates a clearly advanced learner and keeps a beginner", () => {
    expect(runExaminee(3.5, 9).outcome.gate).toBe(true);
    const low = runExaminee(-1.8, 9).outcome;
    expect(low.level).toBe("A1");
    expect(low.gate).toBe(false);
  });

  it("gives the benefit of the doubt below the gate probability", () => {
    const outcome = decide({ probs: [0.05, 0.2, 0.75], theta_mean: 1.6, theta_sd: 0.4, n: 25 }, DEFAULT_PLACEMENT_CONFIG);
    expect(outcome.level).toBe("A2");
    expect(outcome.gate).toBe(false);
    expect(outcome.borderline).toBe(true);
  });
});
