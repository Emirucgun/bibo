import { describe, expect, it } from "vitest";
import { SKILLS } from "@/lib/content/activity-types";
import { assignInterests, planSession, TTS_FALLBACK } from "@/lib/engine/planner";
import { createRng } from "@/lib/engine/random";
import { expectedAccuracy, topicEvidence, topicMastery } from "@/lib/engine/learner-model";
import type { Plan, PlannerInput, RecentError, Skill } from "@/lib/engine/types";
import { CTX, DAY, NOW, TOPICS, plannerInput, stateFrom, topic } from "./fixtures";

/** Çeşitli öğrenci durumları: yeni, deneyimli, teşhisli, hatalı, A2, okul konulu, kendi programı. */
function scenarios(seed: number): PlannerInput[] {
  const rng = createRng(seed);
  const grammar = TOPICS.filter((t) => t.kind === "grammar" && t.level === "A1");
  const answers: [string, Skill, number[]][] = [];
  const errors: RecentError[] = [];
  for (const t of grammar.slice(0, 8)) {
    for (const s of SKILLS) {
      if (rng() < 0.5) continue;
      const list = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => (rng() < 0.6 ? 1 : 0));
      answers.push([t.id, s, list]);
      if (list.includes(0) && rng() < 0.5) {
        errors.push({ topic_id: t.id, skill: s, l1_code: "GEN.OTHER", created_at: new Date(NOW.getTime() - rng() * 4 * DAY) });
      }
    }
  }
  const model = { ctx: CTX, state: stateFrom(answers, undefined, new Date(NOW.getTime() - 10 * DAY)) };
  const base = { rng: createRng(seed * 7 + 1) };
  return [
    plannerInput(base),
    plannerInput({ ...base, model, recent_errors: errors }),
    plannerInput({ ...base, model, recent_errors: errors, level_est: "A2", school_topic_id: "g.past_be" }),
    plannerInput({
      ...base,
      model,
      active_diagnoses: [{ id: "d", topic_id: grammar[0].id, kind: "skill_gap", weak_skill: "speaking", weak_activity: null, status: "active" }],
    }),
    plannerInput({ ...base, model, interests: [], study_mode: "self", session_index: seed }),
    plannerInput({ ...base, model: { ctx: CTX, state: stateFrom([], { mu: 2.6, sd: 0.35 }) }, level_est: "A2" }),
  ];
}

const skillsOf = (p: Plan) => new Set(p.slots.map((s) => s.skill));

describe("planSession — değişmezler", () => {
  const cases = Array.from({ length: 30 }, (_, i) => i + 1).flatMap((seed) =>
    scenarios(seed).map((input, k) => [`tohum ${seed} / senaryo ${k}`, input] as const),
  );

  it.each(cases)("%s: 8–10 slot, 900–1200 sn, dört beceri, sıra numaraları", (_, input) => {
    const plan = planSession(input);
    expect(plan.slots.length).toBeGreaterThanOrEqual(8);
    expect(plan.slots.length).toBeLessThanOrEqual(10);
    expect(plan.total_seconds).toBeGreaterThanOrEqual(900);
    expect(plan.total_seconds).toBeLessThanOrEqual(1200);
    expect([...skillsOf(plan)].sort()).toEqual([...SKILLS].sort());
    expect(plan.slots.map((s) => s.position)).toEqual(plan.slots.map((_, i) => i + 1));
    expect(plan.slots.every((s) => topic(s.topic_id).kind !== "measure")).toBe(true);
  });

  it.each(cases)("%s: yeni açılan odak konusunun ön koşulları hazır", (_, input) => {
    const plan = planSession(input);
    if (!plan.focus_topic_id) return;
    if (topicEvidence(CTX, input.model.state, plan.focus_topic_id) > 0) return; // süren konu
    for (const p of topic(plan.focus_topic_id).prereqs) {
      const ok = expectedAccuracy(CTX, input.model.state, p) >= 0.65 || topicMastery(CTX, input.model.state, p) >= 0.8;
      expect(ok).toBe(true);
    }
  });

  it.each(cases)("%s: tts_enabled = false → dinleme yok, diğer üç beceri var", (_, input) => {
    const plan = planSession({ ...input, settings: { ...input.settings, tts_enabled: false } });
    expect(plan.slots.length).toBeGreaterThanOrEqual(8);
    expect(plan.total_seconds).toBeGreaterThanOrEqual(900);
    expect(plan.total_seconds).toBeLessThanOrEqual(1200);
    expect(plan.slots.some((s) => s.skill === "listening")).toBe(false);
    expect(plan.slots.some((s) => s.activity_type === "listen_choose" || s.activity_type === "dictation")).toBe(false);
    expect([...skillsOf(plan)].sort()).toEqual(["reading", "speaking", "writing"]);
  });
});

describe("planSession — müfredat", () => {
  it("aynı tohum aynı planı verir", () => {
    expect(planSession(plannerInput({ rng: createRng(5) }))).toEqual(planSession(plannerInput({ rng: createRng(5) })));
  });

  it("yeni öğrenci varsayılan yolun başından başlar; L1 riski sırayı belirlemez", () => {
    const plan = planSession(plannerInput());
    expect(plan.focus_topic_id).toBe("g.be_present");
    const focus = plan.slots.filter((s) => s.purpose === "focus" && s.topic_id === plan.focus_topic_id);
    expect(focus.length).toBeGreaterThanOrEqual(3);
    expect(new Set(focus.map((s) => s.skill)).size).toBeGreaterThanOrEqual(2);
  });

  it("güçlü öğrenciye A1 temel konusu odak olmaz", () => {
    const plan = planSession(plannerInput({ model: { ctx: CTX, state: stateFrom([], { mu: 1.4, sd: 0.3 }) }, level_est: "A2" }));
    if (plan.focus_topic_id) expect(topic(plan.focus_topic_id).level).toBe("A2");
  });

  it("A1 öğrencisine A2 konusu gelmez", () => {
    const plan = planSession(plannerInput({ model: { ctx: CTX, state: stateFrom([], { mu: -1.2, sd: 0.4 }) } }));
    expect(plan.slots.every((s) => topic(s.topic_id).level === "A1")).toBe(true);
  });

  it("öğrencinin seçimi odak olur", () => {
    const plan = planSession(plannerInput({ focus_choice: "g.plurals" }));
    expect(plan.focus_topic_id).toBe("g.plurals");
  });

  it("okul konusu hazırsa odak olur (PRD F10)", () => {
    const plan = planSession(plannerInput({ school_topic_id: "g.plurals" }));
    expect(plan.focus_topic_id).toBe("g.plurals");
  });

  it("okul konusunun ön koşulu eksikse önce köprü kurulur", () => {
    const state = stateFrom([["g.past_simple_regular", "writing", [0, 0]], ["g.past_simple_irregular", "writing", [0, 0]]], { mu: 0.7, sd: 0.4 });
    const plan = planSession(plannerInput({ level_est: "A2", model: { ctx: CTX, state }, school_topic_id: "g.present_perfect" }));
    expect(plan.bridge_for).toBe("g.present_perfect");
    expect(["g.past_simple_regular", "g.past_simple_irregular", "g.have_has", "g.present_simple"]).toContain(plan.focus_topic_id);
  });

  it("okul konusu zaten sağlamsa odak yapılmaz", () => {
    const state = stateFrom([["g.plurals", "writing", [1, 1, 1, 1, 1, 1]], ["g.plurals", "reading", [1, 1, 1, 1]]], { mu: 0.5, sd: 0.4 });
    const plan = planSession(plannerInput({ model: { ctx: CTX, state }, school_topic_id: "g.plurals" }));
    expect(plan.focus_topic_id).not.toBe("g.plurals");
  });

  it("odak sürer: ilerleme yoksa aynı konu en çok 3 oturum", () => {
    const state = stateFrom([["g.be_present", "writing", [0, 1, 0]]]);
    const continued = planSession(plannerInput({ model: { ctx: CTX, state }, recent_focus: ["g.be_present"] }));
    expect(continued.focus_topic_id).toBe("g.be_present");
    const capped = planSession(plannerInput({ model: { ctx: CTX, state }, recent_focus: ["g.be_present", "g.be_present", "g.be_present"] }));
    expect(capped.focus_topic_id).not.toBe("g.be_present");
  });

  it("karışabilir konu tanıtıldıysa odakta karışık çalışma", () => {
    const state = stateFrom([["g.present_continuous", "writing", [1, 0]], ["g.present_simple", "writing", [1, 0, 1]], ["g.present_simple", "reading", [1]]], { mu: 0, sd: 0.5 });
    const plan = planSession(plannerInput({ model: { ctx: CTX, state }, focus_choice: "g.present_simple", recent_focus: ["g.present_simple"] }));
    expect(plan.slots.some((s) => s.reason.startsWith("interleave"))).toBe(true);
  });

  it("kendi programım modunda anlam odaklı girdi her oturumda", () => {
    for (let i = 0; i < 4; i++) {
      const plan = planSession(plannerInput({ study_mode: "self", session_index: i, rng: createRng(i + 1) }));
      expect(plan.slots.some((s) => s.purpose === "input")).toBe(true);
      expect(plan.slots.some((s) => s.purpose === "output")).toBe(true);
    }
  });
});

describe("planSession — teşhis ve hatalar", () => {
  it("skill_gap aktifse odakta 2 etkinlik zayıf beceriden", () => {
    const t = "g.be_present";
    const plan = planSession(plannerInput({
      active_diagnoses: [{ id: "d", topic_id: t, kind: "skill_gap", weak_skill: "speaking", weak_activity: null, status: "active" }],
    }));
    expect(plan.focus_topic_id).toBe(t);
    expect(plan.slots.filter((s) => s.topic_id === t && s.purpose === "focus" && s.skill === "speaking").length).toBeGreaterThanOrEqual(2);
  });

  it("activity_mismatch aktifse odakta zayıf tür seçilmez", () => {
    const t = "g.be_present";
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planSession(plannerInput({
        rng: createRng(seed),
        active_diagnoses: [{ id: "d", topic_id: t, kind: "activity_mismatch", weak_skill: "writing", weak_activity: "gap_fill", status: "active" }],
      }));
      expect(plan.slots.some((s) => s.topic_id === t && s.purpose === "focus" && s.activity_type === "gap_fill")).toBe(false);
    }
  });

  it("doğrulama sondası: son hatanın konusu, hatanın becerisinden farklı beceride", () => {
    const err: RecentError = { topic_id: "g.can", skill: "writing", l1_code: "GEN.VERB_FORM", created_at: new Date(NOW.getTime() - DAY) };
    const state = stateFrom([["g.can", "writing", [0]]]);
    const plan = planSession(plannerInput({ model: { ctx: CTX, state }, recent_errors: [err] }));
    const probe = plan.slots.filter((s) => s.topic_id === "g.can" && s.purpose === "probe");
    expect(probe.length).toBe(1);
    expect(probe[0].skill).not.toBe("writing");
    expect(probe[0].l1_target).toBe("GEN.VERB_FORM");
  });

  it("ayırt edici sonda: konu başka beceride sağlamsa hatalı beceri yeniden sınanır", () => {
    const err: RecentError = { topic_id: "g.can", skill: "speaking", l1_code: "GEN.VERB_FORM", created_at: new Date(NOW.getTime() - DAY) };
    const state = stateFrom([["g.can", "writing", [1, 1, 1, 1]], ["g.can", "speaking", [0]]]);
    const plan = planSession(plannerInput({ model: { ctx: CTX, state }, recent_errors: [err] }));
    const probe = plan.slots.filter((s) => s.topic_id === "g.can" && s.purpose === "probe");
    expect(probe.map((p) => p.skill)).toEqual(["speaking"]);
  });

  it("3 günden eski hata sonda sebebi sayılmaz", () => {
    const err: RecentError = { topic_id: "g.can", skill: "writing", l1_code: "GEN.VERB_FORM", created_at: new Date(NOW.getTime() - 4 * DAY) };
    const plan = planSession(plannerInput({ recent_errors: [err] }));
    expect(plan.slots.some((s) => s.reason.includes("probe after error"))).toBe(false);
  });

  it("tekrar: unutma modeline göre vadesi gelen hücre", () => {
    const state = stateFrom([["g.can", "writing", [1, 0, 1]]], undefined, new Date(NOW.getTime() - 40 * DAY));
    const plan = planSession(plannerInput({ model: { ctx: CTX, state } }));
    // Unutulmaya başlayan konu tekrar ya da kısa kontrol olarak plana girer.
    expect(plan.slots.some((s) => s.topic_id === "g.can" && ["review", "probe", "focus"].includes(s.purpose))).toBe(true);
  });

  it("l1_target: hata yoksa konunun ilk L1 kodu", () => {
    const plan = planSession(plannerInput());
    const s = plan.slots.find((x) => x.topic_id === "g.be_present");
    expect(s?.l1_target).toBe("L1.BE_OMIT");
  });

  it("TTS kapalıyken dinleme türü metin türüne düşer", () => {
    expect(TTS_FALLBACK).toEqual({ listen_choose: "mcq_read", dictation: "gap_fill" });
    const plan = planSession(plannerInput({ settings: { tts_enabled: false, general_content_rate: 0.2 } }));
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
      expect(out.filter((x) => x !== null)).toEqual(Array.from({ length: n - nulls }, (_, i) => (i % 2 === 0 ? "football" : "music")));
    }
  });

  it("ilgi alanı yoksa hepsi null", () => {
    expect(assignInterests(8, [], 0.2, createRng(1))).toEqual(Array(8).fill(null));
  });
});
