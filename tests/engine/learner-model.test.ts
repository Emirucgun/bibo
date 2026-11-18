import { describe, expect, it } from "vitest";
import {
  cell,
  cellLabel,
  compatible,
  createContext,
  defaultTopicB,
  deserialize,
  emptyState,
  observe,
  pCellGap,
  pSkillGap,
  pGlobalAbove,
  predict,
  pTopicGap,
  replay,
  reviewInDays,
  serialize,
  topicMastery,
  type ModelTopic,
  type Observation,
} from "@/lib/engine/learner-model";
import type { Mode, Skill } from "@/lib/content/activity-types";
import { TOPICS } from "./fixtures";

const MODEL_TOPICS: ModelTopic[] = TOPICS.map((t) => ({
  id: t.id,
  b: defaultTopicB(t.level, t.l1_risk),
  l1_risk: t.l1_risk,
  kind: t.kind,
}));
const ctx = createContext(MODEL_TOPICS);
const T0 = new Date("2026-12-01T09:00:00Z");
const DAY = 86_400_000;

function obs(topic_id: string, skill: Skill, score: number, i = 0, mode?: Mode): Observation {
  const m: Mode = mode ?? (skill === "reading" || skill === "listening" ? "recognition" : skill === "speaking" ? "free" : "controlled");
  return { topic_id, skill, mode: m, score, weight: 1, at: new Date(T0.getTime() + i * 60_000) };
}

describe("learner model", () => {
  it("starts with no verdicts: every cell is unknown", () => {
    const s = emptyState(ctx);
    for (const t of MODEL_TOPICS.slice(0, 5)) {
      const v = cell(ctx, s, t.id, "writing")!;
      expect(cellLabel(ctx, s, v)).toBe("unknown");
      expect(v.n).toBe(0);
    }
  });

  it("a strong placement makes unasked A1 topics 'solid' by prediction, not 'weak'", () => {
    const s = emptyState(ctx, { mu: 2.6, sd: 0.35 });
    for (const id of ["g.be_present", "g.articles_a_an", "g.present_simple_3sg"]) {
      const v = cell(ctx, s, id, "writing")!;
      expect(v.n).toBe(0);
      expect(v.p_mastered).toBeGreaterThan(0.8);
      expect(cellLabel(ctx, s, v)).toBe("solid");
    }
  });

  it("never says 'needs work' without evidence on the topic", () => {
    const s = emptyState(ctx, { mu: -1.5, sd: 0.3 });
    const before = cell(ctx, s, "g.present_perfect", "writing")!;
    expect(before.p_mastered).toBeLessThan(0.2);
    expect(cellLabel(ctx, s, before)).not.toBe("needs_work");
    observe(ctx, s, obs("g.present_perfect", "writing", 0, 1));
    observe(ctx, s, obs("g.present_perfect", "reading", 0, 2));
    expect(cellLabel(ctx, s, cell(ctx, s, "g.present_perfect", "writing")!)).toBe("needs_work");
  });

  it("correct answers raise mastery, wrong ones lower it, and one slip does not erase it", () => {
    const s = emptyState(ctx);
    const p0 = cell(ctx, s, "g.plurals", "writing")!.p_mastered;
    for (let i = 0; i < 6; i++) observe(ctx, s, obs("g.plurals", "writing", 1, i));
    const p6 = cell(ctx, s, "g.plurals", "writing")!.p_mastered;
    expect(p6).toBeGreaterThan(p0);
    expect(p6).toBeGreaterThan(0.8);
    observe(ctx, s, obs("g.plurals", "writing", 0, 7));
    const after = cell(ctx, s, "g.plurals", "writing")!;
    expect(after.p_mastered).toBeLessThan(p6);
    expect(after.p_mastered).toBeGreaterThan(0.6);
  });

  it("shares information: success on many topics raises an untouched topic", () => {
    const s = emptyState(ctx);
    const before = cell(ctx, s, "g.comparatives", "writing")!.p_mastered;
    const ids = ["g.be_present", "g.present_simple", "g.past_simple_regular", "g.going_to", "g.can", "g.have_has"];
    ids.forEach((id, i) => {
      observe(ctx, s, obs(id, "writing", 1, 2 * i));
      observe(ctx, s, obs(id, "reading", 1, 2 * i + 1));
    });
    expect(cell(ctx, s, "g.comparatives", "writing")!.p_mastered).toBeGreaterThan(before);
    expect(pGlobalAbove(s, 0)).toBeGreaterThan(0.6);
  });

  it("separates a skill gap from a topic gap", () => {
    const s = emptyState(ctx, { mu: 0.9, sd: 0.4 });
    for (let i = 0; i < 6; i++) observe(ctx, s, obs("g.past_simple_irregular", "writing", 1, i));
    for (let i = 0; i < 6; i++) observe(ctx, s, obs("g.past_simple_irregular", "speaking", 0, 10 + i));
    expect(pSkillGap(ctx, s, "g.past_simple_irregular", "speaking")).toBeGreaterThan(0.85);
    expect(pSkillGap(ctx, s, "g.past_simple_irregular", "writing")).toBeLessThan(0.3);
    expect(pCellGap(ctx, s, "g.past_simple_irregular", "speaking")).toBeGreaterThan(pCellGap(ctx, s, "g.past_simple_irregular", "writing"));
    expect(pTopicGap(ctx, s, "g.past_simple_irregular")).toBeLessThan(0.5);

    const s2 = emptyState(ctx, { mu: 0.9, sd: 0.4 });
    (["reading", "writing", "speaking", "listening"] as Skill[]).forEach((sk, j) => {
      for (let i = 0; i < 3; i++) observe(ctx, s2, obs("g.articles_the", sk, 0, j * 3 + i));
    });
    expect(pTopicGap(ctx, s2, "g.articles_the")).toBeGreaterThan(0.85);
    expect(topicMastery(ctx, s2, "g.articles_the")).toBeLessThan(0.2);
  });

  it("forgets over time and schedules expanding reviews", () => {
    const s = emptyState(ctx);
    for (let i = 0; i < 4; i++) observe(ctx, s, obs("g.can", "writing", 1, i));
    const early = reviewInDays(ctx, s, "g.can", "writing")!;
    for (let i = 4; i < 12; i++) observe(ctx, s, obs("g.can", "writing", 1, i));
    const later = reviewInDays(ctx, s, "g.can", "writing")!;
    expect(later).toBeGreaterThanOrEqual(early);
    const sdBefore = cell(ctx, s, "g.can", "writing")!.sd;
    observe(ctx, s, { ...obs("g.be_present", "reading", 1), at: new Date(T0.getTime() + 90 * DAY) });
    expect(cell(ctx, s, "g.can", "writing")!.sd).toBeGreaterThan(sdBefore);
    expect(reviewInDays(ctx, s, "g.never_seen" as string, "writing")).toBeNull();
  });

  it("uses an item's own IRT parameters for placement evidence", () => {
    const s = emptyState(ctx);
    const hard = { ...obs("g.present_perfect", "writing", 1), irt: { a: 1.2, b: 3, c: 0, d: 0.98 } };
    observe(ctx, s, hard);
    expect(pGlobalAbove(s, 1.5)).toBeGreaterThan(pGlobalAbove(emptyState(ctx), 1.5));
  });

  it("ignores zero-weight evidence and predicts probabilities in (0, 1)", () => {
    const s = emptyState(ctx);
    const before = Array.from(s.mu);
    observe(ctx, s, { ...obs("g.can", "writing", 0), weight: 0 });
    expect(Array.from(s.mu)).toEqual(before);
    const p = predict(ctx, s, obs("g.can", "reading", 1))!;
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(1);
  });

  it("serializes and replays deterministically", () => {
    const list = [obs("g.can", "writing", 1, 0), obs("g.can", "speaking", 0, 1), obs("g.plurals", "reading", 1, 2)];
    const a = replay(ctx, list);
    const b = deserialize(JSON.parse(JSON.stringify(serialize(a))))!;
    expect(compatible(ctx, b)).toBe(true);
    const va = cell(ctx, a, "g.can", "speaking")!;
    const vb = cell(ctx, b, "g.can", "speaking")!;
    expect(vb.p_mastered).toBeCloseTo(va.p_mastered, 3);
    expect(vb.n).toBe(1);
    const other = createContext(MODEL_TOPICS.slice(1));
    expect(compatible(other, b)).toBe(false);
  });
});
