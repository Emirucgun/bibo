import { describe, expect, it } from "vitest";
import { SKILLS } from "@/lib/content/activity-types";
import { assignInterests, planSession, TTS_FALLBACK } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import type { MasteryRow, Plan, PlannerInput, RecentError } from "@/lib/engine/types";
import { DAY, NOW, TOPICS, masteryFrom, plannerInput, topic } from "./fixtures";

/** Çeşitli öğrenci durumları: yeni, deneyimli, teşhisli, hatalı, A2, okul konulu. */
function scenarios(seed: number): PlannerInput[] {
  const rng = createRng(seed);
  const grammar = TOPICS.filter((t) => t.kind === "grammar" && t.level === "A1");
  const mastery: MasteryRow[] = [];
  const errors: RecentError[] = [];
  for (const t of grammar.slice(0, 8)) {
    for (const s of SKILLS) {
      if (rng() < 0.5) continue;
      const answers = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => (rng() < 0.6 ? 1 : 0));
      const row = masteryFrom(t.id, s, answers, undefined, new Date(NOW.getTime() - Math.floor(rng() * 10) * DAY));
      mastery.push(row);
      if (answers.includes(0) && rng() < 0.5) {
        errors.push({ topic_id: t.id, skill: s, l1_code: "GEN.OTHER", created_at: new Date(NOW.getTime() - rng() * 4 * DAY) });
      }
    }
  }
  const base = { rng: createRng(seed * 7 + 1) };
  return [
    plannerInput(base),
    plannerInput({ ...base, mastery, recent_errors: errors }),
    plannerInput({ ...base, mastery, recent_errors: errors, level_est: "A2", school_topic_id: "g.past_be" }),
    plannerInput({
      ...base,
      mastery,
      active_diagnoses: [{ id: "d", topic_id: grammar[0].id, kind: "skill_gap", weak_skill: "speaking", weak_activity: null, status: "active" }],
    }),
    plannerInput({ ...base, mastery, interests: [] }),
  ];
}

const skillsOf = (p: Plan) => new Set(p.slots.map((s) => s.skill));

describe("planSession — ROADMAP değişmezleri", () => {
  const cases = Array.from({ length: 40 }, (_, i) => i + 1).flatMap((seed) =>
    scenarios(seed).map((input, k) => [`tohum ${seed} / senaryo ${k}`, input] as const),
  );

  it.each(cases)("%s: 8–10 slot, 900–1200 sn, dört beceri, ≥ 1 çapraz tekrar", (_, input) => {
    const plan = planSession(input);
    expect(plan.slots.length).toBeGreaterThanOrEqual(8);
    expect(plan.slots.length).toBeLessThanOrEqual(10);
    expect(plan.total_seconds).toBeGreaterThanOrEqual(900);
    expect(plan.total_seconds).toBeLessThanOrEqual(1200);
    expect([...skillsOf(plan)].sort()).toEqual([...SKILLS].sort());
    expect(plan.slots.some((s) => s.purpose === "retest")).toBe(true);
    expect(plan.slots.map((s) => s.position)).toEqual(plan.slots.map((_, i) => i + 1));
  });

  it.each(cases)("%s: tts_enabled = false → dinleme slotu yok, diğer üç beceri var", (_, input) => {
    const plan = planSession({ ...input, settings: { ...input.settings, tts_enabled: false } });
    expect(plan.slots.length).toBeGreaterThanOrEqual(8);
    expect(plan.slots.length).toBeLessThanOrEqual(10);
    expect(plan.total_seconds).toBeGreaterThanOrEqual(900);
    expect(plan.total_seconds).toBeLessThanOrEqual(1200);
    expect(plan.slots.some((s) => s.skill === "listening")).toBe(false);
    expect(plan.slots.some((s) => s.activity_type === "listen_choose" || s.activity_type === "dictation")).toBe(false);
    expect(plan.slots.some((s) => topic(s.topic_id).kind === "pron")).toBe(false);
    expect([...skillsOf(plan)].sort()).toEqual(["reading", "speaking", "writing"]);
  });
});

describe("planSession — adımlar", () => {
  it("aynı tohum aynı planı verir", () => {
    expect(planSession(plannerInput({ rng: createRng(5) }))).toEqual(planSession(plannerInput({ rng: createRng(5) })));
  });

  it("odak: 3 etkinlik, en az 2 farklı beceri", () => {
    const plan = planSession(plannerInput());
    const focus = plan.slots.filter((s) => s.purpose === "focus" && s.topic_id === plan.focus_topic_id);
    expect(focus.length).toBeGreaterThanOrEqual(3);
    expect(new Set(focus.map((s) => s.skill)).size).toBeGreaterThanOrEqual(2);
  });

  it("odak önceliği: düşük ustalık + l1_risk; okul konusu +0,20", () => {
    const fresh = planSession(plannerInput());
    expect(topic(fresh.focus_topic_id!).l1_risk).toBe(2);
    const school = planSession(plannerInput({ school_topic_id: "g.plurals" }));
    // g.plurals (risk 1): 1 − 0.35 + 0.15 + 0.20 = 1.00 < yeni risk 2 konu: 1 − 0.20 + 0.30 = 1.10
    expect(school.focus_topic_id).not.toBe("g.plurals");
    const schoolRisk2 = planSession(plannerInput({ school_topic_id: "g.wh_questions" }));
    expect(schoolRisk2.focus_topic_id).toBe("g.wh_questions");
  });

  it("skill_gap aktifse odakta 2 etkinlik zayıf beceriden", () => {
    const t = "g.be_present";
    const plan = planSession(plannerInput({
      mastery: [masteryFrom(t, "writing", [1, 1, 1, 1, 0, 1]), masteryFrom(t, "speaking", [0, 0, 1, 0])],
      active_diagnoses: [{ id: "d", topic_id: t, kind: "skill_gap", weak_skill: "speaking", weak_activity: null, status: "active" }],
    }));
    expect(plan.focus_topic_id).toBe(t);
    const focusSpeaking = plan.slots.filter((s) => s.topic_id === t && s.purpose === "focus" && s.skill === "speaking");
    expect(focusSpeaking.length).toBeGreaterThanOrEqual(2);
  });

  it("activity_mismatch aktifse odakta zayıf tür seçilmez", () => {
    const t = "g.be_present";
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planSession(plannerInput({
        rng: createRng(seed),
        mastery: [masteryFrom(t, "writing", [0, 0, 0])],
        active_diagnoses: [{ id: "d", topic_id: t, kind: "activity_mismatch", weak_skill: "writing", weak_activity: "gap_fill", status: "active" }],
      }));
      expect(plan.slots.some((s) => s.topic_id === t && s.activity_type === "gap_fill")).toBe(false);
    }
  });

  it("tekrar: vadesi gelmiş en eski (konu, beceri) review olarak ilk slotta", () => {
    const old = { ...masteryFrom("g.can", "writing", [1, 1]), next_review_at: new Date(NOW.getTime() - 3 * DAY) };
    const newer = { ...masteryFrom("g.plurals", "reading", [1]), next_review_at: new Date(NOW.getTime() - DAY) };
    const future = { ...masteryFrom("g.have_has", "reading", [1]), next_review_at: new Date(NOW.getTime() + DAY) };
    const plan = planSession(plannerInput({ mastery: [newer, future, old] }));
    expect(plan.slots[0]).toMatchObject({ topic_id: "g.can", purpose: "review" });
    expect(plan.slots.filter((s) => s.purpose === "review" && s.topic_id === "g.have_has")).toHaveLength(0);
  });

  it("çapraz tekrar: son 3 günde hata yapılan konu, hatanın becerisinden farklı beceride", () => {
    const err: RecentError = { topic_id: "g.can", skill: "writing", l1_code: "GEN.VERB_FORM", created_at: new Date(NOW.getTime() - DAY) };
    const plan = planSession(plannerInput({ mastery: [masteryFrom("g.can", "writing", [0])], recent_errors: [err] }));
    const cross = plan.slots.filter((s) => s.topic_id === "g.can" && s.purpose === "retest");
    expect(cross.length).toBeGreaterThanOrEqual(1);
    expect(cross[0].skill).not.toBe("writing");
    expect(cross[0].l1_target).toBe("GEN.VERB_FORM");
  });

  it("3 günden eski hata çapraz tekrar sebebi sayılmaz", () => {
    const err: RecentError = { topic_id: "g.can", skill: "writing", l1_code: "GEN.VERB_FORM", created_at: new Date(NOW.getTime() - 4 * DAY) };
    const plan = planSession(plannerInput({ recent_errors: [err] }));
    expect(plan.slots.some((s) => s.reason.includes("recent error"))).toBe(false);
  });

  it("germe: önkoşulları ≥ 0,6 ve hiç kanıtı olmayan konu", () => {
    const strong = (id: string) => masteryFrom(id, "writing", [1, 1, 1, 1, 1]);
    const plan = planSession(plannerInput({
      mastery: TOPICS.filter((t) => t.kind === "grammar" && t.level === "A1" && t.prereqs.length === 0).map((t) => strong(t.id)),
    }));
    const stretch = plan.slots.find((s) => s.purpose === "stretch");
    if (stretch) {
      const t = topic(stretch.topic_id);
      expect(t.prereqs.length).toBeGreaterThan(0);
    }
  });

  it("A1 öğrencisine A2 konusu gelmez; A2'ye gelebilir", () => {
    const a1 = planSession(plannerInput());
    expect(a1.slots.every((s) => topic(s.topic_id).level === "A1")).toBe(true);
    // g.past_q_neg: A2, risk 2 → 1 − 0.20 + 0.30 + 0.20 = 1.30 (en yüksek)
    const a2 = planSession(plannerInput({ level_est: "A2", school_topic_id: "g.past_q_neg" }));
    expect(a2.focus_topic_id).toBe("g.past_q_neg");
  });

  it("l1_target: hata yoksa konunun ilk L1 kodu", () => {
    const plan = planSession(plannerInput());
    const s = plan.slots.find((x) => x.topic_id === "g.be_present");
    if (s) expect(s.l1_target).toBe("L1.BE_OMIT");
  });

  it("TTS kapalıyken dinleme türü aynı moddaki metin türüne düşer", () => {
    expect(TTS_FALLBACK).toEqual({ listen_choose: "mcq_read", dictation: "gap_fill" });
    const listeningDue = { ...masteryFrom("g.can", "listening", [1]), next_review_at: new Date(NOW.getTime() - DAY) };
    const plan = planSession(plannerInput({ mastery: [listeningDue], settings: { tts_enabled: false, general_content_rate: 0.2 } }));
    expect(plan.slots[0].topic_id).toBe("g.can");
    expect(["mcq_read", "gap_fill"]).toContain(plan.slots[0].activity_type);
    expect(plan.notes.some((n) => n.startsWith("tts_disabled"))).toBe(true);
  });
});

describe("assignInterests", () => {
  it("%20 genel içerik (null), kalanı ilgi alanlarına sırayla; ≥ %70 temalı", () => {
    for (const n of [8, 9, 10]) {
      const out = assignInterests(n, ["football", "music"], 0.2, createRng(n));
      const nulls = out.filter((x) => x === null).length;
      expect(nulls).toBe(Math.round(n * 0.2));
      expect((n - nulls) / n).toBeGreaterThanOrEqual(0.7);
      expect(out.filter((x) => x !== null)).toEqual(
        Array.from({ length: n - nulls }, (_, i) => (i % 2 === 0 ? "football" : "music")),
      );
    }
  });

  it("ilgi alanı yoksa hepsi null", () => {
    expect(assignInterests(8, [], 0.2, createRng(1))).toEqual(Array(8).fill(null));
  });
});
